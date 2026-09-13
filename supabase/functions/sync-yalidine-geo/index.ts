// Daily cron job (see README.md "Sync géo quotidienne"):
//  1. Syncs wilayas/communes/centers using any one active merchant's
//     credentials (assumed identical reference data across accounts).
//  2. For each merchant with active credentials AND a shipping origin
//     configured, syncs delivery fees from their origin wilaya to every
//     other wilaya (scoped per merchant — see migration 0008 for why).
// Landing pages never call Yalidine directly; they only ever read this
// cached data (Lot 2).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { yalidineRequest } from "../_shared/yalidineClient.ts";

interface WilayaRow {
  id: number;
  name: string;
  zone: number;
  is_deliverable: boolean;
}
interface CommuneRow {
  id: number;
  name: string;
  wilaya_id: number;
  wilaya_name: string;
  has_stop_desk: boolean;
  is_deliverable: boolean;
  delivery_time_parcel: number | null;
  delivery_time_payment: number | null;
}
interface CenterRow {
  center_id: number;
  name: string;
  address: string;
  gps: string;
  commune_id: number;
  commune_name: string;
  wilaya_id: number;
  wilaya_name: string;
}
interface PagedResponse<T> {
  has_more: boolean;
  total_data: number;
  data: T[];
}
interface FeesResponse {
  from_wilaya_name: string;
  to_wilaya_name: string;
  zone: number;
  retour_fee: number;
  cod_percentage: number;
  insurance_percentage: number;
  oversize_fee: number;
  per_commune: Record<string, {
    commune_id: number;
    commune_name: string;
    express_home: number | null;
    express_desk: number | null;
    economic_home: number | null;
    economic_desk: number | null;
  }>;
}

// Default quota is 5 req/s — this delay keeps every loop comfortably under it.
const REQUEST_DELAY_MS = 250;
const MAX_RETRY_QUEUE_ATTEMPTS = 5;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Reads the "role" claim straight off the bearer JWT instead of
// string-matching it against SUPABASE_SERVICE_ROLE_KEY: the platform's own
// verify_jwt gateway (enabled for this function) already checked the token's
// signature before this code runs, so this only needs to confirm it's a
// service-role token — sidesteps any drift between the project's legacy vs.
// new-format service key representations.
function callerRole(authHeader: string | null): string | null {
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return (JSON.parse(atob(padded)) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

async function fetchAllPages<T>(apiId: string, apiToken: string, path: string): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  while (true) {
    const separator = path.includes("?") ? "&" : "?";
    const result = await yalidineRequest<PagedResponse<T>>(
      apiId,
      apiToken,
      `${path}${separator}page=${page}&page_size=1000`,
    );
    if (!result.ok || !result.data) {
      throw new Error(result.errorMessage ?? `Échec de récupération de ${path}`);
    }
    items.push(...result.data.data);
    if (!result.data.has_more) break;
    page += 1;
    await sleep(REQUEST_DELAY_MS);
  }
  return items;
}

async function logError(
  admin: SupabaseClient,
  merchantId: string | null,
  endpoint: string,
  statusCode: number | null,
  message: string,
) {
  await admin.from("yalidine_api_errors").insert({
    merchant_id: merchantId,
    endpoint,
    status_code: statusCode,
    message,
  });
}

async function upsertDeliveryFee(
  admin: SupabaseClient,
  merchantId: string,
  fromWilayaId: number,
  toWilayaId: number,
  fee: FeesResponse,
) {
  const { data: feeRow, error } = await admin
    .from("yalidine_delivery_fees")
    .upsert(
      {
        merchant_id: merchantId,
        from_wilaya_id: fromWilayaId,
        from_wilaya_name: fee.from_wilaya_name,
        to_wilaya_id: toWilayaId,
        to_wilaya_name: fee.to_wilaya_name,
        zone: fee.zone,
        retour_fee: fee.retour_fee,
        cod_percentage: fee.cod_percentage,
        insurance_percentage: fee.insurance_percentage,
        oversize_fee: fee.oversize_fee,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "merchant_id,from_wilaya_id,to_wilaya_id" },
    )
    .select("id")
    .single();

  if (error || !feeRow) return;

  const communeRows = Object.values(fee.per_commune).map((c) => ({
    delivery_fee_id: feeRow.id as string,
    commune_id: c.commune_id,
    commune_name: c.commune_name,
    express_home: c.express_home,
    express_desk: c.express_desk,
    economic_home: c.economic_home,
    economic_desk: c.economic_desk,
  }));
  if (communeRows.length > 0) {
    await admin
      .from("yalidine_delivery_fees_communes")
      .upsert(communeRows, { onConflict: "delivery_fee_id,commune_id" });
  }
}

async function recordQuota(admin: SupabaseClient, merchantId: string, quota: {
  secondLeft: number | null;
  minuteLeft: number | null;
  hourLeft: number | null;
  dayLeft: number | null;
}) {
  if (quota.secondLeft === null) return;
  await admin.from("yalidine_api_quota").upsert(
    {
      merchant_id: merchantId,
      second_left: quota.secondLeft,
      minute_left: quota.minuteLeft,
      hour_left: quota.hourLeft,
      day_left: quota.dayLeft,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "merchant_id" },
  );
  // Back off if we're close to exhausting a short-window quota, per the
  // "couper les appels non critiques quand le seuil approche" rule.
  if (quota.secondLeft <= 1 || (quota.minuteLeft !== null && quota.minuteLeft <= 2)) {
    await sleep(1500);
  }
}

async function drainFeeRetryQueue(admin: SupabaseClient) {
  const { data: dueRows } = await admin
    .from("yalidine_retry_queue")
    .select("id, merchant_id, payload, attempts")
    .eq("task_type", "sync_fees")
    .lte("next_attempt_at", new Date().toISOString())
    .limit(200);

  for (const row of dueRows ?? []) {
    const payload = row.payload as { from_wilaya_id: number; to_wilaya_id: number };
    const { data: creds } = await admin.rpc("get_decrypted_yalidine_credentials", {
      p_merchant_id: row.merchant_id,
    });
    const cred = Array.isArray(creds) ? creds[0] : creds;
    if (!cred?.api_id || !cred?.api_token) continue;

    const result = await yalidineRequest<FeesResponse>(
      cred.api_id,
      cred.api_token,
      `/fees/?from_wilaya_id=${payload.from_wilaya_id}&to_wilaya_id=${payload.to_wilaya_id}`,
    );

    if (result.ok && result.data) {
      await upsertDeliveryFee(admin, row.merchant_id, payload.from_wilaya_id, payload.to_wilaya_id, result.data);
      await admin.from("yalidine_retry_queue").delete().eq("id", row.id);
    } else {
      const attempts = row.attempts + 1;
      if (attempts >= MAX_RETRY_QUEUE_ATTEMPTS) {
        await logError(
          admin,
          row.merchant_id,
          "/fees (file d'attente)",
          result.status,
          `Abandon après ${attempts} tentatives: ${result.errorMessage}`,
        );
        await admin.from("yalidine_retry_queue").delete().eq("id", row.id);
      } else {
        await admin
          .from("yalidine_retry_queue")
          .update({
            attempts,
            next_attempt_at: new Date(Date.now() + attempts * attempts * 60_000).toISOString(),
            last_error: result.errorMessage,
          })
          .eq("id", row.id);
      }
    }
    await sleep(REQUEST_DELAY_MS);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Configuration serveur manquante." }), { status: 500 });
  }

  // Only pg_cron (or another trusted caller holding a service-role token)
  // may trigger this function.
  if (callerRole(req.headers.get("Authorization")) !== "service_role") {
    return new Response(JSON.stringify({ error: "Non autorisé." }), { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // 1. Shared reference data: wilayas, then communes (FK on wilaya_id), then
  // centers (FK on commune_id), using any one active merchant's credentials.
  const { data: anyActiveCred } = await admin
    .from("yalidine_credentials")
    .select("merchant_id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!anyActiveCred) {
    await logError(
      admin,
      null,
      "/wilayas,/communes,/centers",
      null,
      "Aucun marchand avec des identifiants Yalidine actifs, synchronisation géo ignorée.",
    );
    return new Response(JSON.stringify({ error: "Aucun identifiant Yalidine actif disponible." }), { status: 200 });
  }

  const { data: refCreds } = await admin.rpc("get_decrypted_yalidine_credentials", {
    p_merchant_id: anyActiveCred.merchant_id,
  });
  const refCred = Array.isArray(refCreds) ? refCreds[0] : refCreds;

  if (!refCred?.api_id || !refCred?.api_token) {
    await logError(admin, anyActiveCred.merchant_id, "/wilayas,/communes,/centers", null, "Déchiffrement des identifiants impossible.");
    return new Response(JSON.stringify({ error: "Déchiffrement des identifiants impossible." }), { status: 500 });
  }

  try {
    const wilayas = await fetchAllPages<WilayaRow>(refCred.api_id, refCred.api_token, "/wilayas/");
    await admin.from("yalidine_wilayas").upsert(
      wilayas.map((w) => ({ id: w.id, name: w.name, zone: w.zone, is_deliverable: w.is_deliverable, synced_at: new Date().toISOString() })),
      { onConflict: "id" },
    );

    const communes = await fetchAllPages<CommuneRow>(refCred.api_id, refCred.api_token, "/communes/");
    await admin.from("yalidine_communes").upsert(
      communes.map((c) => ({
        id: c.id,
        name: c.name,
        wilaya_id: c.wilaya_id,
        wilaya_name: c.wilaya_name,
        has_stop_desk: c.has_stop_desk,
        is_deliverable: c.is_deliverable,
        delivery_time_parcel: c.delivery_time_parcel,
        delivery_time_payment: c.delivery_time_payment,
        synced_at: new Date().toISOString(),
      })),
      { onConflict: "id" },
    );

    const centers = await fetchAllPages<CenterRow>(refCred.api_id, refCred.api_token, "/centers/");
    await admin.from("yalidine_centers").upsert(
      centers.map((c) => ({
        center_id: c.center_id,
        name: c.name,
        address: c.address,
        gps: c.gps,
        commune_id: c.commune_id,
        commune_name: c.commune_name,
        wilaya_id: c.wilaya_id,
        wilaya_name: c.wilaya_name,
        synced_at: new Date().toISOString(),
      })),
      { onConflict: "center_id" },
    );
  } catch (error) {
    await logError(
      admin,
      anyActiveCred.merchant_id,
      "/wilayas,/communes,/centers",
      null,
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    // 2. Retry previously failed fee lookups before doing a fresh sweep.
    await drainFeeRetryQueue(admin);

    // 3. Per-merchant delivery fees (scoped — see migration 0008).
    const { data: allWilayas } = await admin.from("yalidine_wilayas").select("id, name");
    const { data: activeMerchants } = await admin
      .from("yalidine_credentials")
      .select("merchant_id")
      .eq("is_active", true);

    for (const merchant of activeMerchants ?? []) {
      const { data: settings } = await admin
        .from("shipping_settings")
        .select("from_wilaya_id, from_wilaya_name")
        .eq("merchant_id", merchant.merchant_id)
        .maybeSingle();

      if (!settings) continue; // merchant hasn't configured a shipping origin yet

      const { data: creds } = await admin.rpc("get_decrypted_yalidine_credentials", {
        p_merchant_id: merchant.merchant_id,
      });
      const cred = Array.isArray(creds) ? creds[0] : creds;
      if (!cred?.api_id || !cred?.api_token) continue;

      for (const wilaya of allWilayas ?? []) {
        // Same-wilaya delivery is a real, common route (merchant and buyer in
        // the same wilaya) — it must be synced too, not skipped.
        const result = await yalidineRequest<FeesResponse>(
          cred.api_id,
          cred.api_token,
          `/fees/?from_wilaya_id=${settings.from_wilaya_id}&to_wilaya_id=${wilaya.id}`,
        );

        if (!result.ok || !result.data) {
          await admin.from("yalidine_retry_queue").insert({
            merchant_id: merchant.merchant_id,
            task_type: "sync_fees",
            payload: { from_wilaya_id: settings.from_wilaya_id, to_wilaya_id: wilaya.id },
            last_error: result.errorMessage,
          });
          await logError(admin, merchant.merchant_id, "/fees", result.status, result.errorMessage ?? "Échec de synchronisation des frais.");
        } else {
          await upsertDeliveryFee(admin, merchant.merchant_id, settings.from_wilaya_id, wilaya.id, result.data);
          await recordQuota(admin, merchant.merchant_id, result.quota);
        }

        await sleep(REQUEST_DELAY_MS);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    await logError(
      admin,
      null,
      "/fees (sweep)",
      null,
      error instanceof Error ? error.message : String(error),
    );
    return new Response(JSON.stringify({ error: "Échec de la synchronisation des frais de livraison." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

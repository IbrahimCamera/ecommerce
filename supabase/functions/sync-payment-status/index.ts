// Merchant-triggered refresh of Yalidine's payment_status for their pushed
// shipments (GET /parcels?tracking=...&fields=...). A stand-in for real-time
// updates until the Lot 4 webhook (parcel_payment_updated) is built.
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { yalidineRequest } from "../_shared/yalidineClient.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ParcelPaymentRow {
  tracking: string;
  payment_status: string | null;
  payment_id: string | null;
}
interface PagedResponse<T> {
  data: T[];
}

const TRACKING_BATCH_SIZE = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non supportée." }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Authentification requise." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Configuration serveur manquante." }, 500);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: "Session invalide, reconnectez-vous." }, 401);
  }
  const merchantId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: creds } = await admin.rpc("get_decrypted_yalidine_credentials", { p_merchant_id: merchantId });
  const cred = Array.isArray(creds) ? creds[0] : creds;
  if (!cred?.api_id || !cred?.api_token) {
    return jsonResponse({ error: "Identifiants Yalidine indisponibles." }, 422);
  }

  const { data: shipmentRows } = await admin
    .from("shipments")
    .select("id, tracking, orders!inner(merchant_id)")
    .eq("orders.merchant_id", merchantId)
    .not("tracking", "is", null);

  const trackings = (shipmentRows ?? []).map((s) => s.tracking as string);
  if (trackings.length === 0) {
    return jsonResponse({ updated: 0 }, 200);
  }

  let updated = 0;
  for (let i = 0; i < trackings.length; i += TRACKING_BATCH_SIZE) {
    const batch = trackings.slice(i, i + TRACKING_BATCH_SIZE);
    const result = await yalidineRequest<PagedResponse<ParcelPaymentRow>>(
      cred.api_id,
      cred.api_token,
      `/parcels/?tracking=${batch.join(",")}&fields=tracking,payment_status,payment_id&page_size=1000`,
    );

    if (!result.ok || !result.data) {
      await admin.from("yalidine_api_errors").insert({
        merchant_id: merchantId,
        endpoint: "/parcels (sync-payment-status)",
        status_code: result.status,
        message: result.errorMessage ?? "Échec de synchronisation des paiements.",
      });
      continue;
    }

    for (const row of result.data.data) {
      const { error } = await admin
        .from("shipments")
        .update({ payment_status: row.payment_status, payment_id: row.payment_id })
        .eq("tracking", row.tracking);
      if (!error) updated += 1;
    }
  }

  return jsonResponse({ updated }, 200);
});

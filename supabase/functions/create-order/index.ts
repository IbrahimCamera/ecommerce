// Public endpoint hit by the buyer-facing landing page on submit. Validates
// with the shared Zod schema, rejects bots via honeypot, rate-limits by IP,
// normalizes the phone number, and recomputes the delivery fee server-side
// (never trusts anything the client sent) before inserting a pending order.
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { computeDeliveryFee } from "../_shared/computeDeliveryFee.ts";
import { pushOrdersToYalidine } from "../_shared/pushToYalidine.ts";
import { createOrderSchema } from "../../../shared/schemas/order.ts";
import { normalizeDzPhone } from "../../../shared/phone.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// No published rate-limit threshold in the project spec — this is a
// technical anti-abuse default, not a business value, and can be tuned.
const RATE_LIMIT_MAX_ORDERS = 5;
const RATE_LIMIT_WINDOW_MINUTES = 10;

function generatePublicOrderId(): string {
  const timePart = Date.now().toString(36).toUpperCase();
  const randomPart = crypto.randomUUID().slice(0, 4).toUpperCase();
  return `CMD-${timePart}-${randomPart}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non supportée." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Configuration serveur manquante." }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse({ error: "Corps de requête JSON invalide." }, 400);
  }

  const parsed = createOrderSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues[0]?.message ?? "Données invalides." }, 400);
  }
  const input = parsed.data;

  // Honeypot: pretend success without writing anything, so the bot doesn't
  // learn its submission was rejected.
  if (input.website) {
    return jsonResponse({ publicOrderId: generatePublicOrderId() }, 200);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent");

  if (ip) {
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
    const { count } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", windowStart);
    if ((count ?? 0) >= RATE_LIMIT_MAX_ORDERS) {
      return jsonResponse({ error: "Trop de commandes envoyées récemment, réessayez plus tard." }, 429);
    }
  }

  const { data: landingPage } = await admin
    .from("landing_pages")
    .select("id, merchant_id, price")
    .eq("slug", input.landingPageSlug)
    .eq("status", "published")
    .maybeSingle();

  if (!landingPage) {
    return jsonResponse({ error: "Page introuvable ou dépubliée." }, 404);
  }

  const [{ data: wilaya }, { data: commune }] = await Promise.all([
    admin.from("yalidine_wilayas").select("name").eq("id", input.toWilayaId).maybeSingle(),
    admin.from("yalidine_communes").select("name").eq("id", input.toCommuneId).maybeSingle(),
  ]);
  if (!wilaya || !commune) {
    return jsonResponse({ error: "Wilaya ou commune invalide." }, 400);
  }

  const feeOutcome = await computeDeliveryFee(admin, {
    merchantId: landingPage.merchant_id,
    toWilayaId: input.toWilayaId,
    toCommuneId: input.toCommuneId,
    isStopdesk: input.isStopdesk,
  });
  if (!feeOutcome.ok) {
    return jsonResponse({ error: feeOutcome.error }, 422);
  }
  const deliveryFee = feeOutcome.result.freeshipping ? 0 : feeOutcome.result.deliveryFee;

  const normalizedPhone = normalizeDzPhone(input.contactPhone);
  if (!normalizedPhone) {
    // Already checked by the Zod schema, but computed again here since we
    // need the normalized value (not the raw one) for storage.
    return jsonResponse({ error: "Numéro de téléphone invalide." }, 400);
  }

  const publicOrderId = generatePublicOrderId();

  // Every order is confirmed and pushed to Yalidine immediately — no
  // per-merchant setting, no manual step. If the push below fails, the order
  // still lands as "confirmed" (pushOrdersToYalidine moves it to "failed" on
  // error) and the merchant can retry from the dashboard.
  const { data: insertedOrder, error: insertError } = await admin
    .from("orders")
    .insert({
      landing_page_id: landingPage.id,
      merchant_id: landingPage.merchant_id,
      public_order_id: publicOrderId,
      firstname: input.firstname,
      familyname: input.familyname,
      contact_phone: normalizedPhone,
      address: input.address,
      to_wilaya_id: input.toWilayaId,
      to_wilaya_name: wilaya.name,
      to_commune_id: input.toCommuneId,
      to_commune_name: commune.name,
      is_stopdesk: input.isStopdesk,
      stopdesk_center_id: input.isStopdesk ? input.stopdeskCenterId : null,
      price: landingPage.price,
      delivery_fee: deliveryFee,
      status: "confirmed",
      ip,
      user_agent: userAgent,
    })
    .select("id")
    .single();

  if (insertError || !insertedOrder) {
    return jsonResponse({ error: "Impossible d'enregistrer la commande, réessayez." }, 500);
  }

  // Best-effort: the order already exists either way. A failure here must
  // not break the buyer's confirmation — the merchant sees it as "failed" in
  // the dashboard and can retry the push manually.
  await pushOrdersToYalidine(admin, landingPage.merchant_id, [insertedOrder.id]);

  return jsonResponse({ publicOrderId, total: landingPage.price + deliveryFee }, 200);
});

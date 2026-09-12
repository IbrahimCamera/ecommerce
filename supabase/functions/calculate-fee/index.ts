import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { computeDeliveryFee } from "../_shared/computeDeliveryFee.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface FeeRequestBody {
  slug?: unknown;
  toWilayaId?: unknown;
  toCommuneId?: unknown;
  isStopdesk?: unknown;
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

  let body: FeeRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Corps de requête JSON invalide." }, 400);
  }

  if (
    typeof body.slug !== "string" ||
    typeof body.toWilayaId !== "number" ||
    typeof body.toCommuneId !== "number" ||
    typeof body.isStopdesk !== "boolean"
  ) {
    return jsonResponse({ error: "Paramètres invalides." }, 400);
  }

  const { data: landingPage } = await admin
    .from("landing_pages")
    .select("merchant_id, price")
    .eq("slug", body.slug)
    .eq("status", "published")
    .maybeSingle();

  if (!landingPage) {
    return jsonResponse({ error: "Page introuvable." }, 404);
  }

  const outcome = await computeDeliveryFee(admin, {
    merchantId: landingPage.merchant_id,
    toWilayaId: body.toWilayaId,
    toCommuneId: body.toCommuneId,
    isStopdesk: body.isStopdesk,
  });

  if (!outcome.ok) {
    return jsonResponse({ error: outcome.error }, 422);
  }

  const displayedDeliveryFee = outcome.result.freeshipping ? 0 : outcome.result.deliveryFee;

  return jsonResponse(
    {
      price: landingPage.price,
      deliveryFee: displayedDeliveryFee,
      total: landingPage.price + displayedDeliveryFee,
    },
    200,
  );
});

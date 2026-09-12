// Tests a merchant's Yalidine API ID/token against the real API before ever
// storing them, then hands them to Vault via set_yalidine_credentials().
// This is the ONLY place in the whole app where a raw Yalidine key is held
// in memory outside of Vault itself, and it never leaves this function.
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { yalidineRequest } from "../_shared/yalidineClient.ts";
import { yalidineCredentialsInputSchema } from "../../../shared/schemas/yalidineCredentials.ts";

interface WilayasProbe {
  data: unknown[];
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Corps de requête JSON invalide." }, 400);
  }

  const parsed = yalidineCredentialsInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues[0]?.message ?? "Données invalides." }, 400);
  }
  const { apiId, apiToken } = parsed.data;

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const probe = await yalidineRequest<WilayasProbe>(apiId, apiToken, "/wilayas/?page_size=1");

  if (!probe.ok) {
    await adminClient.rpc("record_yalidine_check_result", {
      p_merchant_id: merchantId,
      p_is_active: false,
      p_status: "error",
      p_message: probe.errorMessage,
    });
    await adminClient.from("yalidine_api_errors").insert({
      merchant_id: merchantId,
      endpoint: "/wilayas (test de connexion)",
      status_code: probe.status,
      message: probe.errorMessage ?? "Échec du test de connexion.",
    });
    return jsonResponse({ error: probe.errorMessage }, 422);
  }

  await adminClient.rpc("set_yalidine_credentials", {
    p_merchant_id: merchantId,
    p_api_id: apiId,
    p_api_token: apiToken,
  });
  await adminClient.rpc("record_yalidine_check_result", {
    p_merchant_id: merchantId,
    p_is_active: true,
    p_status: "ok",
    p_message: "Connexion à Yalidine réussie.",
  });

  return jsonResponse({ success: true }, 200);
});

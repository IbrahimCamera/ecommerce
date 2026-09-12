// Public read access to the cached geo reference data, for the anonymous
// buyer-facing order form. Direct table access is intentionally not granted
// to anon (see migration 0007) so this is the only path — keeps "no table
// accessible to anon except published landing_pages" intact while still
// letting the form filter communes/centers dynamically.
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

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
  if (req.method !== "GET") {
    return jsonResponse({ error: "Méthode non supportée." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Configuration serveur manquante." }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const url = new URL(req.url);
  const resource = url.searchParams.get("resource");

  if (resource === "wilayas") {
    const { data, error } = await admin
      .from("yalidine_wilayas")
      .select("id, name")
      .eq("is_deliverable", true)
      .order("name");
    if (error) return jsonResponse({ error: "Erreur de lecture des wilayas." }, 500);
    return jsonResponse({ data }, 200);
  }

  if (resource === "communes") {
    const wilayaId = Number(url.searchParams.get("wilaya_id"));
    if (!Number.isInteger(wilayaId) || wilayaId <= 0) {
      return jsonResponse({ error: "Paramètre wilaya_id invalide." }, 400);
    }
    const { data, error } = await admin
      .from("yalidine_communes")
      .select("id, name, has_stop_desk")
      .eq("wilaya_id", wilayaId)
      .eq("is_deliverable", true)
      .order("name");
    if (error) return jsonResponse({ error: "Erreur de lecture des communes." }, 500);
    return jsonResponse({ data }, 200);
  }

  if (resource === "centers") {
    const communeId = Number(url.searchParams.get("commune_id"));
    if (!Number.isInteger(communeId) || communeId <= 0) {
      return jsonResponse({ error: "Paramètre commune_id invalide." }, 400);
    }
    const { data, error } = await admin
      .from("yalidine_centers")
      .select("center_id, name, address")
      .eq("commune_id", communeId)
      .order("name");
    if (error) return jsonResponse({ error: "Erreur de lecture des centres." }, 500);
    return jsonResponse({ data }, 200);
  }

  return jsonResponse({ error: "Paramètre resource invalide (wilayas|communes|centers)." }, 400);
});

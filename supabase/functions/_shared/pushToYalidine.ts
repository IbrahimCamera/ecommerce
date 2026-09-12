// Core "push these orders to Yalidine" logic, shared by the push-to-yalidine
// Edge Function (merchant-triggered from the dashboard) and create-order
// (when the merchant has enabled auto-push). order_id (our public_order_id)
// is used as Yalidine's own order_id, which is what makes replaying this
// function safe: a shipments row keyed by order_id (unique) is only ever
// inserted once a Yalidine tracking number actually exists.
import type { SupabaseClient } from "@supabase/supabase-js";
import { yalidineRequest } from "./yalidineClient.ts";

interface ParcelPayload {
  order_id: string;
  from_wilaya_name: string;
  firstname: string;
  familyname: string;
  contact_phone: string;
  address: string;
  to_commune_name: string;
  to_wilaya_name: string;
  product_list: string;
  price: number;
  do_insurance: boolean;
  declared_value: number;
  length: number;
  width: number;
  height: number;
  weight: number;
  freeshipping: boolean;
  is_stopdesk: boolean;
  stopdesk_id?: number;
  has_exchange: boolean;
}

interface ParcelResult {
  success: boolean;
  order_id: string;
  tracking: string | null;
  import_id: number | null;
  label: string | null;
  labels: string | null;
  message: string;
}

export interface PushOutcome {
  orderId: string;
  publicOrderId: string;
  status: "pushed" | "failed" | "skipped";
  message: string;
}

export async function pushOrdersToYalidine(
  admin: SupabaseClient,
  merchantId: string,
  orderIds: string[],
): Promise<PushOutcome[]> {
  const outcomes: PushOutcome[] = [];

  const { data: creds } = await admin.rpc("get_decrypted_yalidine_credentials", { p_merchant_id: merchantId });
  const cred = Array.isArray(creds) ? creds[0] : creds;
  if (!cred?.api_id || !cred?.api_token) {
    return orderIds.map((id) => ({ orderId: id, publicOrderId: "", status: "failed", message: "Identifiants Yalidine indisponibles." }));
  }

  const { data: settings } = await admin
    .from("shipping_settings")
    .select("from_wilaya_name, default_freeshipping, default_weight, default_length, default_width, default_height")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!settings) {
    return orderIds.map((id) => ({ orderId: id, publicOrderId: "", status: "failed", message: "Adresse d'expédition non configurée." }));
  }

  const { data: orders } = await admin
    .from("orders")
    .select(
      "id, public_order_id, firstname, familyname, contact_phone, address, to_commune_name, to_wilaya_name, price, delivery_fee, is_stopdesk, stopdesk_center_id, status, landing_page_id",
    )
    .eq("merchant_id", merchantId)
    .in("id", orderIds);

  if (!orders || orders.length === 0) return outcomes;

  // Idempotency guard: never build a parcel for an order that already has a
  // shipment, even if the caller asks for it again.
  const { data: existingShipments } = await admin
    .from("shipments")
    .select("order_id")
    .in("order_id", orders.map((o) => o.id));
  const alreadyShipped = new Set((existingShipments ?? []).map((s) => s.order_id as string));

  const pushable = orders.filter((o) => {
    if (alreadyShipped.has(o.id)) {
      outcomes.push({ orderId: o.id, publicOrderId: o.public_order_id, status: "skipped", message: "Déjà poussée vers Yalidine." });
      return false;
    }
    if (o.status !== "confirmed") {
      outcomes.push({ orderId: o.id, publicOrderId: o.public_order_id, status: "skipped", message: `Statut actuel "${o.status}", doit être "confirmed".` });
      return false;
    }
    return true;
  });

  if (pushable.length === 0) return outcomes;

  const landingPageIds = [...new Set(pushable.map((o) => o.landing_page_id))];
  const { data: landingPages } = await admin.from("landing_pages").select("id, title").in("id", landingPageIds);
  const titleByPageId = new Map((landingPages ?? []).map((p) => [p.id, p.title as string]));

  const payloads: ParcelPayload[] = pushable.map((order) => {
    // Not confirmed by any spec/doc reviewed so far: when freeshipping is
    // false, we bundle the delivery fee into the COD amount collected from
    // the receiver, since Yalidine's own `price` field is described as "the
    // amount you want to recover from the receiver". Flagged for validation.
    const price = settings.default_freeshipping ? order.price : order.price + order.delivery_fee;
    return {
      order_id: order.public_order_id,
      from_wilaya_name: settings.from_wilaya_name,
      firstname: order.firstname,
      familyname: order.familyname,
      contact_phone: order.contact_phone,
      address: order.address,
      to_commune_name: order.to_commune_name,
      to_wilaya_name: order.to_wilaya_name,
      product_list: titleByPageId.get(order.landing_page_id) ?? "Produit",
      price,
      // No insurance feature built yet — do_insurance/declared_value are
      // required by Yalidine, so we default to "no insurance" with the
      // product price as the declared value rather than inventing a number.
      do_insurance: false,
      declared_value: order.price,
      length: settings.default_length,
      width: settings.default_width,
      height: settings.default_height,
      weight: settings.default_weight,
      freeshipping: settings.default_freeshipping,
      is_stopdesk: order.is_stopdesk,
      stopdesk_id: order.is_stopdesk ? order.stopdesk_center_id ?? undefined : undefined,
      has_exchange: false,
    };
  });

  const orderRowByPublicId = new Map(pushable.map((o) => [o.public_order_id, o]));

  // Single attempt, no retry: a retried POST could create a duplicate parcel
  // if the first attempt actually succeeded server-side but the response was
  // lost (timeout/5xx). Idempotency for a genuine retry is handled by the
  // shipments-row check above on the *next* invocation, not by retrying here.
  const result = await yalidineRequest<Record<string, ParcelResult>>(
    cred.api_id,
    cred.api_token,
    "/parcels/",
    { method: "POST", body: JSON.stringify(payloads) },
    { maxRetries: 0 },
  );

  if (!result.ok || !result.data) {
    const message = result.errorMessage ?? "Échec de l'envoi vers Yalidine.";
    await admin
      .from("orders")
      .update({ status: "failed", failure_reason: message })
      .in("id", pushable.map((o) => o.id));
    await admin.from("yalidine_api_errors").insert({
      merchant_id: merchantId,
      endpoint: "/parcels (push)",
      status_code: result.status,
      message,
    });
    for (const order of pushable) {
      outcomes.push({ orderId: order.id, publicOrderId: order.public_order_id, status: "failed", message });
    }
    return outcomes;
  }

  for (const [publicOrderId, parcelResult] of Object.entries(result.data)) {
    const order = orderRowByPublicId.get(publicOrderId);
    if (!order) continue;

    if (parcelResult.success && parcelResult.tracking) {
      await admin.from("shipments").insert({
        order_id: order.id,
        tracking: parcelResult.tracking,
        label_url: parcelResult.label,
        payload_sent: payloads.find((p) => p.order_id === publicOrderId),
        response: parcelResult,
      });
      await admin.from("orders").update({ status: "pushed" }).eq("id", order.id);
      outcomes.push({ orderId: order.id, publicOrderId, status: "pushed", message: "Colis créé chez Yalidine." });
    } else {
      const message = parcelResult.message || "Échec de création du colis.";
      await admin.from("orders").update({ status: "failed", failure_reason: message }).eq("id", order.id);
      await admin.from("yalidine_api_errors").insert({
        merchant_id: merchantId,
        endpoint: "/parcels (push)",
        status_code: result.status,
        message,
      });
      outcomes.push({ orderId: order.id, publicOrderId, status: "failed", message });
    }
  }

  return outcomes;
}

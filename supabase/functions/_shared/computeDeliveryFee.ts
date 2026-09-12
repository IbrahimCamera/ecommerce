// Server-side delivery fee calculation, per the project rule that this must
// never happen client-side. Reads only from the cached tables populated by
// sync-yalidine-geo — never calls api.yalidine.app directly.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface FeeInput {
  merchantId: string;
  toWilayaId: number;
  toCommuneId: number;
  isStopdesk: boolean;
}

export interface FeeResult {
  deliveryFee: number;
  freeshipping: boolean;
}

export type FeeOutcome = { ok: true; result: FeeResult } | { ok: false; error: string };

export async function computeDeliveryFee(admin: SupabaseClient, input: FeeInput): Promise<FeeOutcome> {
  const { data: settings } = await admin
    .from("shipping_settings")
    .select("from_wilaya_id, default_freeshipping, default_weight, default_length, default_width, default_height")
    .eq("merchant_id", input.merchantId)
    .maybeSingle();

  if (!settings) {
    return { ok: false, error: "Adresse d'expédition du marchand non configurée." };
  }

  const { data: feeRow } = await admin
    .from("yalidine_delivery_fees")
    .select("id, oversize_fee")
    .eq("merchant_id", input.merchantId)
    .eq("from_wilaya_id", settings.from_wilaya_id)
    .eq("to_wilaya_id", input.toWilayaId)
    .maybeSingle();

  if (!feeRow) {
    return { ok: false, error: "Tarifs de livraison indisponibles pour cette wilaya (synchronisation en attente)." };
  }

  const { data: communeFee } = await admin
    .from("yalidine_delivery_fees_communes")
    .select("express_home, express_desk")
    .eq("delivery_fee_id", feeRow.id)
    .eq("commune_id", input.toCommuneId)
    .maybeSingle();

  if (!communeFee) {
    return { ok: false, error: "Tarifs de livraison indisponibles pour cette commune (synchronisation en attente)." };
  }

  const baseTariff = input.isStopdesk ? communeFee.express_desk : communeFee.express_home;
  if (baseTariff === null || baseTariff === undefined) {
    return {
      ok: false,
      error: input.isStopdesk
        ? "Livraison stop-desk indisponible pour cette commune."
        : "Livraison à domicile indisponible pour cette commune.",
    };
  }

  // Per the Fees docs "Calculating weight" section: volumetric weight (cm) x
  // 0.0002, billable weight is the greater of that and the actual weight, and
  // the first 5kg are free of the oversize fee.
  const volumetricWeight = settings.default_length * settings.default_width * settings.default_height * 0.0002;
  const billableWeight = Math.max(volumetricWeight, settings.default_weight);
  const overweightFee = billableWeight <= 5 ? 0 : (billableWeight - 5) * feeRow.oversize_fee;

  return {
    ok: true,
    result: {
      deliveryFee: Math.round(baseTariff + overweightFee),
      freeshipping: settings.default_freeshipping,
    },
  };
}

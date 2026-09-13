import { supabase } from "./supabaseClient";

// The app has one real business record (Yalidine credentials + shipping
// settings), shared by both admin accounts. Resolved server-side by email
// rather than hardcoded here — see canonical_merchant_id() migration.
let cached: Promise<string> | null = null;

export async function getCanonicalMerchantId(): Promise<string> {
  if (!cached) {
    cached = (async () => {
      const { data, error } = await supabase.rpc("canonical_merchant_id");
      if (error || !data) {
        cached = null;
        throw error ?? new Error("Compte marchand introuvable.");
      }
      return data as string;
    })();
  }
  return cached;
}

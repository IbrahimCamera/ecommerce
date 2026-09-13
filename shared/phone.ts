// Yalidine's POST /parcels docs: "contact_phone must start with 0 and contain
// 9 digits for mobile or 8 digits for landline (e.g. 0550123456 for mobile,
// 023456789 for landline)." That's a total length of 10 (mobile) or 9
// (landline) digits.
//
// Length alone isn't enough: a real-world Yalidine rejection showed
// "068457845" (9 digits, 06-mobile-prefix) being accepted by a length-only
// check but refused by Yalidine's own validation. 05/06/07 is Algeria's
// national mobile numbering plan (ARPT), not a Yalidine-specific guess, so a
// 05/06/07 number is only valid at the full 10-digit mobile length.
const MOBILE_PREFIX_PATTERN = /^0[567]/;
const MOBILE_PATTERN = /^0[567]\d{8}$/;
const LANDLINE_PATTERN = /^0\d{8}$/;

// Strips spaces/dashes/dots/parens and validates against the Yalidine format.
// Returns the normalized digits-only string, or null if invalid.
export function normalizeDzPhone(raw: string): string | null {
  const digitsOnly = raw.replace(/[\s\-.()]/g, "");
  if (MOBILE_PREFIX_PATTERN.test(digitsOnly)) {
    return MOBILE_PATTERN.test(digitsOnly) ? digitsOnly : null;
  }
  return LANDLINE_PATTERN.test(digitsOnly) ? digitsOnly : null;
}

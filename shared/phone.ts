// Yalidine's POST /parcels docs: "contact_phone must start with 0 and contain
// 9 digits for mobile or 8 digits for landline (e.g. 0550123456 for mobile,
// 023456789 for landline)." That's a total length of 10 (mobile) or 9
// (landline) digits, no prefix restriction documented beyond the leading 0 —
// so we validate on length only rather than inventing prefix rules.
const MOBILE_PATTERN = /^0\d{9}$/;
const LANDLINE_PATTERN = /^0\d{8}$/;

// Strips spaces/dashes/dots/parens and validates against the Yalidine format.
// Returns the normalized digits-only string, or null if invalid.
export function normalizeDzPhone(raw: string): string | null {
  const digitsOnly = raw.replace(/[\s\-.()]/g, "");
  if (MOBILE_PATTERN.test(digitsOnly) || LANDLINE_PATTERN.test(digitsOnly)) {
    return digitsOnly;
  }
  return null;
}

// src/lib/utils/normalize-phone.ts

const COUNTRY_CODES: Record<string, string> = {
  BR: "55", US: "1", MX: "52", ES: "34", PT: "351",
  CO: "57", AR: "54", CL: "56", PE: "51", UY: "598",
  GB: "44", FR: "33", DE: "49", IT: "39",
};

/**
 * Normalize a phone number to E.164 format.
 * Handles Brazilian numbers (9th digit), US, and international formats.
 */
export function normalizePhone(
  phone: string,
  countryCode: string = "BR"
): string {
  // Strip everything except digits and leading +
  let cleaned = phone.replace(/[^\d+]/g, "");

  // If already starts with +, just clean and return
  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  // Remove leading zeros
  cleaned = cleaned.replace(/^0+/, "");

  const cc = COUNTRY_CODES[countryCode.toUpperCase()] || "55";

  // If already starts with country code
  if (cleaned.startsWith(cc)) {
    return `+${cleaned}`;
  }

  // Brazilian specifics: ensure 9th digit for mobiles
  if (cc === "55") {
    // DDD (2 digits) + number
    if (cleaned.length === 10) {
      // Missing 9th digit — add it for mobile
      const ddd = cleaned.substring(0, 2);
      const number = cleaned.substring(2);
      // Mobile numbers in BR start with 9 after DDD
      if (!number.startsWith("9")) {
        cleaned = `${ddd}9${number}`;
      }
    }
    // Should be 11 digits now (DDD + 9 + 8 digits)
    if (cleaned.length === 11 || cleaned.length === 10) {
      return `+${cc}${cleaned}`;
    }
  }

  // US/MX: 10 digits
  if ((cc === "1" || cc === "52") && cleaned.length === 10) {
    return `+${cc}${cleaned}`;
  }

  // Generic: prepend country code
  return `+${cc}${cleaned}`;
}
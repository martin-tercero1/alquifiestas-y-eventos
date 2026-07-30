import {
  parsePhoneNumberFromString,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js";

/**
 * Phone helpers for the ADMIN panel only.
 *
 * libphonenumber-js is a heavy dependency, so it lives here and is imported
 * exclusively by panel code — the public reservation form assumes Nicaragua and
 * validates a bare 8-digit input without it (Brief 04 §1).
 *
 * The database stores `phone` as full international digits (e.g. 50588887777);
 * these functions split it into the calling code + national number the UI
 * shows, and compose it back on save.
 */

export type PhoneParts = { cc: string; national: string };

/** Nicaragua. The overwhelming default — pre-selected everywhere. */
export const DEFAULT_CC = "505";

/** The calling codes offered in the selector: Nicaragua first, then the
 *  neighbours and the handful of countries a real customer here comes from.
 *  Any code already on a record is added on the fly so it never disappears. */
const COMMON_COUNTRIES: CountryCode[] = [
  "NI", // Nicaragua 505
  "CR", // Costa Rica 506
  "HN", // Honduras 504
  "SV", // El Salvador 503
  "GT", // Guatemala 502
  "PA", // Panamá 507
  "MX", // México 52
  "US", // EE. UU. / Canadá 1
  "ES", // España 34
  "BR", // Brasil 55
];

export type CallingCode = { cc: string; label: string };

const COUNTRY_NAME: Record<string, string> = {
  NI: "Nicaragua",
  CR: "Costa Rica",
  HN: "Honduras",
  SV: "El Salvador",
  GT: "Guatemala",
  PA: "Panamá",
  MX: "México",
  US: "EE. UU.",
  ES: "España",
  BR: "Brasil",
};

/** The selector options, guaranteeing `include` (a record's own code) is present. */
export function callingCodes(include?: string | null): CallingCode[] {
  const seen = new Set<string>();
  const out: CallingCode[] = [];
  for (const country of COMMON_COUNTRIES) {
    const cc = getCountryCallingCode(country);
    if (seen.has(cc)) continue;
    seen.add(cc);
    out.push({ cc, label: `${COUNTRY_NAME[country] ?? country} +${cc}` });
  }
  if (include && include !== "" && !seen.has(include)) {
    out.unshift({ cc: include, label: `+${include}` });
  }
  return out;
}

/** Split a stored full-international phone (digits only) into code + national.
 *  Used only for well-formed stored values, so libphonenumber parses cleanly;
 *  anything it cannot parse falls back to assuming Nicaragua. */
export function splitPhone(full: string | null | undefined): PhoneParts {
  const digits = (full ?? "").replace(/\D/g, "");
  if (digits === "") return { cc: DEFAULT_CC, national: "" };

  const parsed = parsePhoneNumberFromString("+" + digits);
  if (parsed) {
    return {
      cc: String(parsed.countryCallingCode),
      national: parsed.nationalNumber,
    };
  }
  // Unparseable (rare): a bare 8-digit local is Nicaragua; otherwise keep the
  // digits under the default code rather than losing them.
  return { cc: DEFAULT_CC, national: digits };
}

/** Compose code + national back into the stored digits form. An empty national
 *  number means "no phone" and yields an empty string. */
export function joinPhone(cc: string, national: string): string {
  const n = national.replace(/\D/g, "");
  if (n === "") return "";
  return (cc.replace(/\D/g, "") || DEFAULT_CC) + n;
}

/** Warn — never block — when a Nicaraguan number is not the expected 8 digits.
 *  A foreign code is left alone; we do not police other countries' formats. */
export function phoneWarning(cc: string, national: string): string | null {
  const n = national.replace(/\D/g, "");
  if (n === "") return null;
  if (cc === DEFAULT_CC && n.length !== 8) {
    return "Un número de Nicaragua tiene 8 dígitos. Revisá que esté completo.";
  }
  return null;
}

/** A stored phone shown the friendly way: "8888 7777" for a local number,
 *  "+506 7082 2926" for a foreign one. Returns null when there is no phone. */
export function formatPhone(full: string | null | undefined): string | null {
  const digits = (full ?? "").replace(/\D/g, "");
  if (digits === "") return null;

  const parsed = parsePhoneNumberFromString("+" + digits);
  if (!parsed) return digits;

  const cc = String(parsed.countryCallingCode);
  return cc === DEFAULT_CC
    ? parsed.formatNational()
    : parsed.formatInternational();
}

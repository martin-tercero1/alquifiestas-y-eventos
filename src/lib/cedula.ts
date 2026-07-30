/**
 * Nicaraguan cédula (national ID).
 *
 * Format: NNN-DDMMAA-NNNNX — three municipality digits, six birth-date digits
 * (DDMMAA), four serial digits, one check letter. San Marcos is municipality
 * 043, so most local cards begin with 043.
 *
 * Nicaragua introduced a NEW cédula format in February 2026, and holders of the
 * old one keep it until their document expires — so two formats coexist for
 * years. Everything here therefore validates SHAPE only and warns on a
 * mismatch; nothing ever blocks a save. A tourist, a company with only a RUC,
 * or a new-format card must all be storable.
 *
 * Pure string work, no dependency — safe to use on the public form and in the
 * admin panel alike.
 */

/** The placeholder shown in inputs: obvious San Marcos shape. */
export const CEDULA_PLACEHOLDER = "043-140587-1234A";

/** The classic format: NNN-DDMMAA-NNNNX. */
const CEDULA_RE = /^\d{3}-\d{6}-\d{4}[A-Z]$/;

/**
 * Auto-format keystrokes into NNN-DDMMAA-NNNNX. Only inserts dashes and
 * uppercases — never drops a character the user typed, so a foreign or
 * new-format value the mask doesn't fit still survives on screen.
 */
export function formatCedula(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const mun = cleaned.slice(0, 3);
  const date = cleaned.slice(3, 9);
  const serial = cleaned.slice(9, 13);
  const letter = cleaned.slice(13, 14);

  let out = mun;
  if (cleaned.length > 3) out += "-" + date;
  if (cleaned.length > 9) out += "-" + serial;
  if (cleaned.length > 13) out += letter;
  return out;
}

/** True when the value matches the classic shape. New-format cards return
 *  false and are warned about, not rejected. */
export function isCedulaShape(value: string): boolean {
  return CEDULA_RE.test(value.trim().toUpperCase());
}

/**
 * A gentle, non-blocking warning. Returns null when the field is empty or the
 * shape is the familiar one; otherwise a note that lets staff save anyway.
 */
export function cedulaWarning(value: string): string | null {
  const v = value.trim();
  if (v === "") return null;
  if (isCedulaShape(v)) return null;
  return "No tiene la forma habitual (043-140587-1234A). Podés guardarla igual si estás seguro.";
}

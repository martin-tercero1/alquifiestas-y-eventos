/**
 * Formatting helpers. All output is Nicaraguan Spanish.
 *
 * Deliberately deterministic (no locale lookup at render time) so the server
 * and client always produce the same string and hydration never mismatches.
 */

/** Córdobas, whole numbers. The catalog has no sub-córdoba prices. */
export function money(amount: number): string {
  return `C$ ${Math.round(amount).toLocaleString("es-NI")}`;
}

/** Just the number, for when the "C$" is set separately in the layout. */
export function moneyAmount(amount: number): string {
  return Math.round(amount).toLocaleString("es-NI");
}

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/** "sáb 14 mar 2026" — short enough for the sheet header on a 360px screen. */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[date.getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y}`;
}

/** "sáb 14 mar" — the year is dropped where space is tight, like the hoja bar. */
export function compactDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[date.getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** "14 de marzo de 2026" — for confirmation copy, where it should read aloud. */
const MONTHS_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${d} de ${MONTHS_LONG[m - 1]} de ${y}`;
}

/**
 * "8:00 a. m." / "3:30 p. m." — an agreed pickup or return time.
 *
 * Takes a Postgres `time` ("HH:MM:SS" or "HH:MM") and shows it the way a
 * Nicaraguan reads a clock: 12-hour, with the meridiem. Returns "" for a null
 * or unparseable time so a missing agreed time renders as nothing, not "0:00".
 */
export function shortTime(time: string | null | undefined): string {
  if (!time) return "";
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const meridiem = h < 12 ? "a. m." : "p. m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${meridiem}`;
}

/** Today in YYYY-MM-DD, local time — the minimum selectable event date. */
export function todayISO(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** "1 día" / "3 días" — the rental is priced linearly per 24 hours. */
export function dayCount(days: number): string {
  return days === 1 ? "1 día" : `${days} días`;
}

/** "1 renglón" / "4 renglones" — the sheet counts lines, like the paper form. */
export function lineCount(lines: number): string {
  return lines === 1 ? "1 renglón" : `${lines} renglones`;
}

/** "1 artículo" / "12 artículos". */
export function itemCount(count: number): string {
  return count === 1 ? "1 artículo" : `${count} artículos`;
}

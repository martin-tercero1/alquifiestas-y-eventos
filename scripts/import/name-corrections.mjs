/**
 * Accent repair for the Odoo export.
 *
 * The cleaning script that produced the CSVs stripped accents from product and
 * variant names — "Silla Plastica", "Taza para Cafe", "Cubiculos", "Numero 15",
 * "Pequeno(a)" — while leaving them intact in the category names and in four
 * stray rows (Muñeca Típica, Champañera, Cumpleaños, Niño).
 *
 * These strings are customer-visible, and the product ships in Spanish. So the
 * import repairs them from an explicit, reviewed dictionary rather than from a
 * general un-accenting heuristic: every entry below is a deliberate decision
 * about a real product in this catalog, and the raw value is stored alongside
 * in `source_name` / `source_label` so the import stays auditable.
 *
 * Words the business genuinely spells without an accent are NOT in this list.
 * "Queque", "Chafer Dish", "Yacar", "Buffette" and "Container" are their own
 * vocabulary, not typos, and are left exactly as they are.
 */

/** Applied on whole-word boundaries, case-sensitive. */
const WORDS = {
  Plastica: "Plástica",
  Plastico: "Plástico",
  Electrica: "Eléctrica",
  Cafe: "Café",
  Espatula: "Espátula",
  Metalico: "Metálico",
  Rustica: "Rústica",
  Cubiculos: "Cubículos",
  Numero: "Número",
  Deposito: "Depósito",
  Cabezon: "Cabezón",
  Pequeno: "Pequeño",
  Jicara: "Jícara",
  Cesped: "Césped",
  Satin: "Satín",
  Consume: "Consomé",
};

/**
 * Whole-string replacements, for cases a word map cannot express.
 *
 * "Pequeno(a)" carries an Odoo gender artifact that reads as noise on a
 * customer-facing page. "Mesas Redonda" is ungrammatical in the source and
 * would be visible on the catalog page; there is a separate "Mesa Redonda"
 * product, so correcting it collides with nothing.
 */
const EXACT = {
  "Pequeno(a)": "Pequeño",
  "Mesas Redonda para 10 personas": "Mesa Redonda para 10 personas",
};

const WORD_PATTERN = new RegExp(`\\b(${Object.keys(WORDS).join("|")})\\b`, "g");

/** Repairs one name. Returns the input unchanged when nothing matches. */
export function correctName(raw) {
  if (!raw) return raw;
  const trimmed = raw.trim();
  if (EXACT[trimmed]) return EXACT[trimmed];
  return trimmed.replace(WORD_PATTERN, (word) => WORDS[word] ?? word);
}

/** Slug for URLs: accent-folded, lowercased, punctuation collapsed. */
export function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Pure parsing for the Odoo shop pages. No network, no filesystem — every
 * function here takes a string and returns data, so the rules that are easy to
 * get silently wrong (above all the decimal separator) are covered by
 * parse-odoo.test.mjs.
 *
 * The shop runs Odoo `website_sale` + `sale_renting` in Spanish. Prices render
 * as `1.500,00 C$ por 24 Horas` — comma decimal, period thousands.
 */

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/**
 * Parses a number written in the es-NI convention Odoo renders here.
 *
 * The whole run turns on this one function. Reading `1.500,00` as 1.5 instead
 * of 1500 corrupts every four-digit price, and it corrupts them *plausibly* —
 * nothing downstream would flag a chair at C$1.50. Hence the explicit rule
 * rather than Number() or parseFloat(), both of which stop at the first comma.
 *
 * Rule: period groups thousands, comma separates decimals. When both appear,
 * the rightmost separator is the decimal one, which also makes the function
 * correct if a page ever renders in the en-US convention instead.
 *
 * Returns { value, ambiguous } — ambiguous marks input the caller should flag
 * for a human rather than trust.
 */
export function parseLocalizedNumber(input) {
  if (input === null || input === undefined) return { value: null, ambiguous: false };

  const text = String(input).replace(/[\s\u00a0]/g, "");
  if (!/^-?[\d.,]+$/.test(text) || !/\d/.test(text)) {
    return { value: null, ambiguous: false };
  }

  const lastComma = text.lastIndexOf(",");
  const lastPeriod = text.lastIndexOf(".");

  let decimalSep = null;
  let ambiguous = false;

  if (lastComma !== -1 && lastPeriod !== -1) {
    // Both present: the rightmost one is the decimal point. `1.500,00` -> ","
    decimalSep = lastComma > lastPeriod ? "," : ".";
  } else if (lastComma !== -1) {
    // Only commas. In this locale a comma is a decimal point, and Odoo always
    // renders currency with exactly two decimals — so `1,500` is not a price
    // this shop would produce, and if it appears something else is wrong.
    decimalSep = ",";
    const decimals = text.length - lastComma - 1;
    if (decimals === 3 && text.split(",").length === 2) ambiguous = true;
  } else if (lastPeriod !== -1) {
    // Only periods. Two decimals is the machine format Odoo's microdata uses
    // (`1500.0`, `73.0`); three digits after a lone period is a thousands
    // group written without decimals (`1.500`).
    const decimals = text.length - lastPeriod - 1;
    if (decimals === 3 && text.split(".").length === 2) {
      decimalSep = null; // thousands group, no decimal part
    } else {
      decimalSep = ".";
    }
  }

  let normalized;
  if (decimalSep === null) {
    normalized = text.replace(/[.,]/g, "");
  } else {
    const thousandsSep = decimalSep === "," ? "." : ",";
    normalized = text
      .split(thousandsSep)
      .join("")
      .replace(decimalSep, ".");
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? { value, ambiguous } : { value: null, ambiguous };
}

/** `30,00 C$ por 24 Horas` -> { value: 30, currency: "C$" } */
export function parsePriceText(text) {
  if (!text) return { value: null, currency: null, ambiguous: false };

  const cleaned = String(text).replace(/\u00a0/g, " ");
  const match = cleaned.match(/(-?[\d.,]*\d)/);
  if (!match) return { value: null, currency: null, ambiguous: false };

  const { value, ambiguous } = parseLocalizedNumber(match[1]);

  const currencyMatch = cleaned.match(/(C\$|NIO|US\$|USD|\$|€)/);
  return { value, currency: currencyMatch ? currencyMatch[1] : null, ambiguous };
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#34": '"',
};

export function decodeEntities(text) {
  return String(text).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, name) => {
    if (name in ENTITIES) return ENTITIES[name];
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X"
        ? parseInt(name.slice(2), 16)
        : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return whole;
  });
}

export function stripHtml(html) {
  return decodeEntities(
    String(html)
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Pulls one attribute off a single tag string, quote style agnostic. */
function attr(tag, name) {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"),
  );
  if (!match) return null;
  return decodeEntities(match[2] ?? match[3] ?? "");
}

function itemprop(html, name) {
  const match = html.match(
    new RegExp(`<span[^>]*\\bitemprop=["']${name}["'][^>]*>([\\s\\S]*?)</span>`, "i"),
  );
  return match ? stripHtml(match[1]) : null;
}

/**
 * The structured `itemprop` block Odoo emits alongside the rendered price.
 *
 * Preferred over the rendered text because it is already machine-formatted
 * (`73.0`, `NIO`) and so sidesteps the separator question entirely.
 */
export function extractMicrodata(html) {
  const rawPrice = itemprop(html, "price");
  const rawDuration = itemprop(html, "rental_duration");

  const price = rawPrice === null ? { value: null, ambiguous: false } : parseLocalizedNumber(rawPrice);
  const duration = rawDuration === null ? { value: null } : parseLocalizedNumber(rawDuration);

  return {
    price: price.value,
    priceAmbiguous: price.ambiguous,
    currency: itemprop(html, "priceCurrency"),
    duration: duration.value,
    unit: itemprop(html, "rental_unit"),
  };
}

/**
 * The rendered price, used to cross-check the microdata rather than replace it.
 *
 * The price span wraps another span (`<span class="oe_currency_value">73,00
 * </span> C$`), so this walks the nesting rather than matching the first
 * `</span>` — which would cut the currency symbol off.
 */
export function extractRenderedPrice(html) {
  const open = html.match(
    /<span[^>]*\bclass=["'][^"']*\bo_renting_price\b[^"']*["'][^>]*>/i,
  );
  if (!open) return { value: null, currency: null, ambiguous: false };

  const start = open.index + open[0].length;
  let depth = 1;
  let i = start;

  while (depth > 0 && i < html.length) {
    const next = html.slice(i).search(/<\/?span\b/i);
    if (next === -1) break;
    i += next;
    depth += html.slice(i, i + 6).toLowerCase().startsWith("</span") ? -1 : 1;
    i += 5;
  }

  return parsePriceText(stripHtml(html.slice(start, depth === 0 ? i - 5 : start)));
}

/** `[["24 Horas", "300,00 C$"], ...]` as rendered in the rental pricing table. */
export function extractPricingTable(html) {
  const table = html.match(
    /<table[^>]*\bid=["']oe_wsale_rental_pricing_table["'][\s\S]*?<\/table>/i,
  );
  if (!table) return [];

  const rows = [];
  for (const row of table[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
      stripHtml(c[1]),
    );
    if (cells.length >= 2) rows.push([cells[0], cells[1]]);
  }
  return rows;
}

/** The `<h1>`, used to confirm the URL landed on the product we expected. */
export function extractProductName(html) {
  const match = html.match(/<h1[^>]*\bitemprop=["']name["'][^>]*>([\s\S]*?)<\/h1>/i);
  return match ? stripHtml(match[1]) : null;
}

export function extractTemplateId(html) {
  const match = html.match(
    /<input[^>]*\bname=["']product_template_id["'][^>]*>/i,
  );
  const value = match ? attr(match[0], "value") : null;
  return value ? Number(value) : null;
}

/**
 * The variant selector, as a list of attributes each holding its options.
 *
 * Handles both renderings Odoo uses — a `<select>` of `<option>`s and radio or
 * colour `<input>`s — because which one appears depends on how the attribute
 * was configured, not on anything we control.
 */
export function extractAttributes(html) {
  const block = html.match(
    /<ul[^>]*\bclass=["'][^"']*\bjs_add_cart_variants\b[\s\S]*?<\/ul>/i,
  );
  if (!block) return [];

  const attributes = [];
  for (const li of block[0].matchAll(
    /<li[^>]*\bclass=["'][^"']*\bvariant_attribute\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi,
  )) {
    const openTag = li[0].slice(0, li[0].indexOf(">") + 1);
    const body = li[1];

    const options = [];
    const seen = new Set();
    for (const tag of body.matchAll(/<(option|input)\b[^>]*>/gi)) {
      const ptav = attr(tag[0], "data-value_id") ?? attr(tag[0], "value");
      const label = attr(tag[0], "data-value_name");
      if (!ptav || !label || seen.has(ptav)) continue;
      seen.add(ptav);
      options.push({
        ptav: Number(ptav),
        label,
        selected: /\bselected\b|\bchecked\b/i.test(tag[0]),
      });
    }

    if (options.length > 0) {
      attributes.push({
        id: Number(attr(openTag, "data-attribute_id")),
        name: attr(openTag, "data-attribute_name") ?? "",
        options,
      });
    }
  }

  return attributes;
}

/**
 * The customer-facing sales description.
 *
 * The CSV export gave us Odoo's *internal* notes field; this is the text a
 * customer actually reads, and it is unrecoverable once the shop is gone.
 * Empty is both fine and, on this shop, common.
 */
export function extractDescription(html) {
  const candidates = [];

  const full = html.match(
    /<div[^>]*\bid=["']product_full_description["'][^>]*>([\s\S]*?)<\/div>\s*<div/i,
  );
  if (full) candidates.push(full[1]);

  const described = html.match(
    /<(p|div|span)[^>]*\bitemprop=["']description["'][^>]*>([\s\S]*?)<\/\1>/i,
  );
  if (described) candidates.push(described[2]);

  for (const candidate of candidates) {
    const text = stripHtml(candidate);
    if (text) return text;
  }
  return "";
}

/** Every combination of one option per attribute, in selector order. */
export function combinations(attributes) {
  return attributes.reduce(
    (acc, attribute) =>
      acc.flatMap((partial) =>
        attribute.options.map((option) => [...partial, option]),
      ),
    [[]],
  );
}

/**
 * Comparison key for matching Odoo's names against the CSV's.
 *
 * The CSV export stripped accents (`Cubiculos`) where the live page has them
 * (`Cubículos`), so a literal comparison would miss. Folding both sides is
 * enough; nothing here depends on the fold being reversible.
 */
export function foldKey(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

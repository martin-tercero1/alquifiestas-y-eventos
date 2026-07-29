/**
 * Recovers the 24-hour rental price of every published product from the
 * business's own live Odoo shop, before the subscription lapses and the pages
 * disappear.
 *
 *   npm run scrape:prices              # resume (uses the cache)
 *   npm run scrape:prices -- --refresh # ignore the cache and re-fetch
 *   npm run scrape:prices -- --limit 5 # smoke test against a few products
 *
 * Writes precios-recuperados.csv and precios-fallidos.csv at the repo root.
 * It reads catalogo-limpio.csv and writes nothing else — merging the recovered
 * prices into the catalog is a separate, reviewable step, and the import rule
 * still holds: staff-entered data wins over imported data.
 *
 * This is the owner's own site. It is still fetched politely — one request a
 * second, real User-Agent, cached to disk — because it is a small hosted
 * instance and there is no reason to fetch a page twice.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCsv, toCsv } from "../lib/csv.mjs";
import {
  extractMicrodata,
  extractRenderedPrice,
  extractAttributes,
  extractDescription,
  extractProductName,
  extractTemplateId,
  combinations,
  foldKey,
} from "./parse-odoo.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SEED = join(ROOT, "src", "data", "seed");
const CACHE = join(ROOT, ".cache", "odoo-shop");

const ORIGIN = "https://www.alquifiestasyeventos.com";
const COMBINATION_INFO = `${ORIGIN}/website_sale/get_combination_info`;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 " +
  "(alquifiestas price recovery; owner's own site)";

const REQUEST_INTERVAL_MS = 1000;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 3; // the first try plus two retries

/** This business rents chairs, not venues. Anything above this wants a look. */
const SANITY_CEILING = 5000;

/** A guard against a badly configured product exploding into a huge fan-out. */
const MAX_COMBINATIONS = 32;

const args = process.argv.slice(2);
const REFRESH = args.includes("--refresh");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i === -1 ? Infinity : Number(args[i + 1]);
})();

// ---------------------------------------------------------------------------
// Polite, cached, resumable HTTP
// ---------------------------------------------------------------------------

let lastRequestAt = 0;
let networkRequests = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function throttle() {
  const wait = lastRequestAt + REQUEST_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

/**
 * Fetches with retries and a hard timeout, and returns an error rather than
 * throwing: one unreachable product must never end the run, because the whole
 * point is to get as much as possible before the source goes away.
 */
async function request(url, { method = "GET", body = null } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await throttle();
    networkRequests++;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "es-NI,es;q=0.9",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        // 404 is an answer, not a hiccup — retrying it just wastes the budget.
        if (response.status >= 400 && response.status < 500) break;
      } else {
        return { text: await response.text(), error: null };
      }
    } catch (error) {
      lastError = error.name === "TimeoutError" ? "tiempo de espera agotado" : error.message;
    }

    if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** attempt);
  }

  return { text: null, error: lastError };
}

/**
 * Disk cache. This is what makes the run resumable: a second run re-derives
 * everything from cached bytes without touching the network, so dying at
 * product 40 costs 40 pages, not the whole job.
 */
function cached(key, extension) {
  return join(CACHE, `${key}.${extension}`);
}

async function fetchPage(dbId, url) {
  const path = cached(`page-${dbId}`, "html");

  if (!REFRESH && existsSync(path)) {
    return { html: readFileSync(path, "utf8"), error: null, fromCache: true };
  }

  const { text, error } = await request(url);
  if (error) return { html: null, error, fromCache: false };

  mkdirSync(CACHE, { recursive: true });
  writeFileSync(path, text);
  return { html: text, error: null, fromCache: false };
}

/**
 * Asks Odoo for one combination's price, the same call the page's own
 * JavaScript makes when a customer picks a variant from the selector.
 */
async function fetchCombination(templateId, ptavs) {
  const path = cached(`combo-${templateId}-${ptavs.join("_")}`, "json");

  if (!REFRESH && existsSync(path)) {
    return { info: JSON.parse(readFileSync(path, "utf8")), error: null, fromCache: true };
  }

  const { text, error } = await request(COMBINATION_INFO, {
    method: "POST",
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        product_template_id: templateId,
        product_id: null,
        combination: ptavs,
        add_qty: 1,
        parent_combination: [],
        context: {},
      },
    }),
  });

  if (error) return { info: null, error, fromCache: false };

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { info: null, error: "respuesta no es JSON", fromCache: false };
  }

  if (payload.error || !payload.result) {
    return { info: null, error: "el endpoint respondió con un error", fromCache: false };
  }

  mkdirSync(CACHE, { recursive: true });
  writeFileSync(path, JSON.stringify(payload.result));
  return { info: payload.result, error: null, fromCache: false };
}

// ---------------------------------------------------------------------------
// Source rows
// ---------------------------------------------------------------------------

const catalogRows = parseCsv(readFileSync(join(SEED, "catalogo-limpio.csv"), "utf8"));

// Unpublished products have no public page; they get priced by hand.
const published = catalogRows.filter((r) => r.publicado === "si");

const byProduct = new Map();
for (const row of published) {
  if (!byProduct.has(row.db_id)) byProduct.set(row.db_id, []);
  byProduct.get(row.db_id).push(row);
}

const products = [...byProduct.entries()].slice(0, LIMIT);

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

const recovered = [];
const failed = [];

/** Records one rentable unit, applying the confidence rules in one place. */
function record(
  row,
  { price, currency, method, notes = [], duration, unit, copied, stock = null },
) {
  const reasons = [...notes];

  if (copied) {
    reasons.push("precio del variante por defecto copiado a los demás variantes");
  }
  if (price === 0) reasons.push("precio cero en la página");
  if (price !== null && price > SANITY_CEILING) {
    reasons.push(`precio por encima de C$${SANITY_CEILING}`);
  }
  if (currency && !["NIO", "C$"].includes(currency)) {
    reasons.push(`moneda inesperada: ${currency}`);
  }
  if (duration != null && unit && !(duration === 24 && /hora/i.test(unit))) {
    reasons.push(`la tarifa es por ${duration} ${unit}, no por 24 Horas`);
  }

  const suspect =
    copied ||
    price === 0 ||
    price === null ||
    price > SANITY_CEILING ||
    (currency && !["NIO", "C$"].includes(currency)) ||
    (duration != null && unit && !(duration === 24 && /hora/i.test(unit)));

  recovered.push({
    db_id: row.db_id,
    producto: row.producto,
    variante: row.variante,
    unidad_alquilable: row.unidad_alquilable,
    precio_24h: price === null ? "" : String(price),
    moneda: currency ?? "",
    existencias_odoo: stock === null ? "" : String(stock),
    descripcion_venta: row.__description ?? "",
    metodo: method,
    confianza: suspect ? "revisar" : "alta",
    notas: reasons.join("; "),
  });
}

function fail(row, motivo) {
  failed.push({
    db_id: row.db_id,
    producto: row.producto,
    url: row.url_producto,
    motivo,
  });
}

/**
 * Matches an Odoo combination to a CSV row.
 *
 * Odoo's `display_name` is literally the CSV's `unidad_alquilable`
 * ("Cilindros (Grande)"), which makes it the natural key — but the export
 * stripped accents, so both sides are folded before comparing. The variant
 * label is the fallback for the cases where the display name was edited.
 */
function matchUnit(units, info, comboLabels) {
  const displayKey = foldKey(info?.display_name);
  const byDisplay = units.find((u) => foldKey(u.unidad_alquilable) === displayKey);
  if (byDisplay) return byDisplay;

  const labelKey = foldKey(comboLabels.join(" "));
  return units.find((u) => foldKey(u.variante) === labelKey) ?? null;
}

let index = 0;

for (const [dbId, units] of products) {
  index++;
  const first = units[0];
  const url = first.url_producto;
  const label = `[${String(index).padStart(2, " ")}/${products.length}] ${first.producto}`;

  if (!url) {
    console.log(`${label} — sin URL`);
    for (const unit of units) fail(unit, "la fila publicada no trae url_producto");
    continue;
  }

  const { html, error, fromCache } = await fetchPage(dbId, url);

  if (error) {
    console.log(`${label} — FALLÓ: ${error}`);
    for (const unit of units) fail(unit, `no se pudo descargar la página: ${error}`);
    continue;
  }

  const micro = extractMicrodata(html);
  const rendered = extractRenderedPrice(html);
  const attributes = extractAttributes(html);
  const templateId = extractTemplateId(html) ?? Number(dbId);
  const description = extractDescription(html);
  const pageName = extractProductName(html);

  for (const unit of units) unit.__description = description;

  const pageNotes = [];

  // A URL that lands on a different product would quietly price the wrong
  // thing, so it is checked rather than assumed.
  if (pageName && foldKey(pageName) !== foldKey(first.producto)) {
    pageNotes.push(`la página se titula "${pageName}"`);
  }

  // The microdata is machine-formatted, so it is the source of truth; the
  // rendered text is only used to catch a disagreement worth a human look.
  const pagePrice = micro.price ?? rendered.value;
  const pageCurrency = micro.currency ?? rendered.currency;

  if (
    micro.price !== null &&
    rendered.value !== null &&
    Math.abs(micro.price - rendered.value) > 0.01
  ) {
    pageNotes.push(
      `el precio estructurado (${micro.price}) no coincide con el mostrado (${rendered.value})`,
    );
  }
  if (rendered.ambiguous || micro.priceAmbiguous) {
    pageNotes.push("el separador decimal del precio es ambiguo");
  }

  const hasVariants = attributes.length > 0;
  const cacheMark = fromCache ? " (cache)" : "";

  // ---- Single rentable unit, no selector -> the page price is the price ----
  if (!hasVariants) {
    if (pagePrice === null) {
      console.log(`${label} — sin precio en la página${cacheMark}`);
      for (const unit of units) fail(unit, "no se encontró precio en la página");
      continue;
    }

    if (units.length > 1) {
      pageNotes.push("la página no muestra selector de variantes");
    }

    // The page markup carries the price but not the stock figure, so ask the
    // endpoint with an empty combination — the same call, minus a selection.
    // Odoo's own count is worth having even though the CSV warns it is stale:
    // an approximate real number beats an invented one.
    const { info } = await fetchCombination(templateId, []);
    const stock = typeof info?.free_qty === "number" ? info.free_qty : null;

    for (const unit of units) {
      record(unit, {
        price: pagePrice,
        currency: pageCurrency,
        method: "pagina",
        duration: micro.duration,
        unit: micro.unit,
        copied: units.length > 1,
        stock,
        notes: pageNotes,
      });
    }
    console.log(
      `${label} — C$${pagePrice}` +
        `${stock === null ? "" : ` · ${stock} en existencia`}${cacheMark}`,
    );
    continue;
  }

  // ---- Variants: ask Odoo for each combination's own price ----------------
  const combos = combinations(attributes);

  if (combos.length > MAX_COMBINATIONS) {
    pageNotes.push(`${combos.length} combinaciones, demasiadas para consultar`);
    for (const unit of units) {
      record(unit, {
        price: pagePrice,
        currency: pageCurrency,
        method: "pagina",
        duration: micro.duration,
        unit: micro.unit,
        copied: true,
        notes: pageNotes,
      });
    }
    console.log(`${label} — ${combos.length} combinaciones, se usó el precio por defecto`);
    continue;
  }

  const resolved = []; // every combination the shop offers, priced
  let endpointBroken = false;

  for (const combo of combos) {
    const ptavs = combo.map((o) => o.ptav);
    const { info, error: comboError } = await fetchCombination(templateId, ptavs);

    if (comboError) {
      // The brief is explicit: do not fight this. One failure means the route
      // is not what we assumed, so fall back for the whole product.
      endpointBroken = comboError;
      break;
    }

    resolved.push({
      labels: combo.map((o) => o.label),
      info,
      record: {
        price: info.current_rental_price_per_unit ?? info.price ?? null,
        currency: info.product_tracking_info?.currency ?? pageCurrency,
        method: "combination_info",
        duration: info.current_rental_duration ?? info.rental_duration,
        unit: info.current_rental_unit ?? info.rental_unit,
        copied: false,
        stock: typeof info.free_qty === "number" ? info.free_qty : null,
        notes: [...pageNotes],
      },
    });
  }

  const priced = new Map(); // unidad_alquilable -> record input
  for (const entry of resolved) {
    const unit = matchUnit(units, entry.info, entry.labels);
    // A combination Odoo offers that the CSV does not list is not an error —
    // it simply is not one of the units this business tracks.
    if (unit && !priced.has(unit.unidad_alquilable)) {
      priced.set(unit.unidad_alquilable, entry.record);
    }
  }

  /**
   * Some products carry an attribute that exists only to pick a pattern or a
   * style — `Estilo 1..5`, `Color: Celeste`, `Forma: Redonda` — and every
   * option costs the same. The CSV rightly treats those as a single unit, so
   * no combination matches by name, but the price is not in doubt: it is the
   * one price the whole attribute has. Treating that as uncertain would send
   * the owner back to a site that no longer exists to confirm a number we
   * already know.
   */
  const uniquePrices = [...new Set(resolved.map((r) => r.record.price))];
  const decorativeVariants =
    resolved.length > 0 && uniquePrices.length === 1 && units.every((u) => !u.variante);

  const pageOptions = attributes
    .map((a) => `${a.name}: ${a.options.map((o) => o.label).join(", ")}`)
    .join(" / ");

  if (endpointBroken) {
    const why = `el endpoint de variantes falló (${endpointBroken})`;
    for (const unit of units) {
      record(unit, {
        price: pagePrice,
        currency: pageCurrency,
        method: "pagina",
        duration: micro.duration,
        unit: micro.unit,
        copied: true,
        notes: [...pageNotes, why],
      });
    }
    console.log(`${label} — ${why}, se usó el precio por defecto${cacheMark}`);
    continue;
  }

  if (decorativeVariants) {
    for (const unit of units) {
      record(unit, {
        ...resolved[0].record,
        notes: [
          ...resolved[0].record.notes,
          `un solo precio para todo el atributo (${pageOptions})`,
        ],
      });
    }
    console.log(
      `${label} — C$${resolved[0].record.price} para ${resolved.length} opciones ` +
        `de ${pageOptions}${cacheMark}`,
    );
    continue;
  }

  for (const unit of units) {
    const found = priced.get(unit.unidad_alquilable);
    if (found) {
      record(unit, found);
      continue;
    }

    // The shop does not offer this variant at all: it exists in the backend
    // export but was never published, so there is no price to recover. Copy
    // the sibling price so the row is not empty, and say exactly why.
    record(unit, {
      price: pagePrice,
      currency: pageCurrency,
      method: "pagina",
      duration: micro.duration,
      unit: micro.unit,
      copied: true,
      notes: [
        ...pageNotes,
        pageOptions
          ? `la tienda solo publica ${pageOptions} — este variante no tiene precio en línea`
          : "este variante no aparece en la página",
      ],
    });
  }

  const prices = units
    .map((u) => priced.get(u.unidad_alquilable)?.price)
    .filter((p) => p != null);

  console.log(
    `${label} — ${priced.size}/${units.length} variantes: ` +
      `C$${prices.join(" / C$")}${cacheMark}`,
  );
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const RECOVERED_COLUMNS = [
  "db_id",
  "producto",
  "variante",
  "unidad_alquilable",
  "precio_24h",
  "moneda",
  "existencias_odoo",
  "descripcion_venta",
  "metodo",
  "confianza",
  "notas",
];

const FAILED_COLUMNS = ["db_id", "producto", "url", "motivo"];

// A --limit run covers only part of the catalog, so it must not be able to
// overwrite a complete result with a truncated one. Smoke tests write beside
// the real files, never over them.
const partial = Number.isFinite(LIMIT);
const suffix = partial ? "-parcial" : "";

writeFileSync(
  join(ROOT, `precios-recuperados${suffix}.csv`),
  toCsv(RECOVERED_COLUMNS, recovered),
);
writeFileSync(join(ROOT, `precios-fallidos${suffix}.csv`), toCsv(FAILED_COLUMNS, failed));

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const withPrice = recovered.filter((r) => r.precio_24h !== "");
const values = withPrice.map((r) => Number(r.precio_24h)).sort((a, b) => a - b);
const alta = recovered.filter((r) => r.confianza === "alta").length;
const revisar = recovered.filter((r) => r.confianza === "revisar").length;
const withDescription = recovered.filter((r) => r.descripcion_venta !== "").length;

const median = values.length
  ? values.length % 2
    ? values[(values.length - 1) / 2]
    : (values[values.length / 2 - 1] + values[values.length / 2]) / 2
  : null;

const money = (n) => (n === null ? "—" : `C$${n.toLocaleString("es-NI")}`);

console.log(`\nProductos resueltos    : ${products.length - new Set(failed.map((f) => f.db_id)).size}/${products.length}`);
console.log(`Unidades con precio    : ${withPrice.length}`);
console.log(`  confianza alta       : ${alta}`);
console.log(`  a revisar            : ${revisar}`);
console.log(`Unidades fallidas      : ${failed.length}`);
console.log(`Unidades con existencia : ${recovered.filter((r) => r.existencias_odoo !== "").length}`);
console.log(`Descripciones de venta : ${withDescription}`);
console.log(`Peticiones de red      : ${networkRequests}`);

// The price range is the fastest check on the decimal separator there is: if
// this business's median rental comes out in the thousands, it is parsed wrong.
console.log(`\nPrecio mínimo  : ${money(values[0] ?? null)}`);
console.log(`Precio mediano : ${money(median)}`);
console.log(`Precio máximo  : ${money(values[values.length - 1] ?? null)}`);

console.log(
  `\nEscrito: precios-recuperados${suffix}.csv, precios-fallidos${suffix}.csv` +
    (partial ? "  (corrida parcial, no sobrescribe los archivos completos)" : ""),
);
console.log("Revisar a mano antes de importar — lo que el personal escribe siempre gana.");

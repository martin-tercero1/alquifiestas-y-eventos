/**
 * Loads recovered prices and quantities into `variants`.
 *
 *   pnpm import:prices -- --dry-run    # show the plan, write nothing
 *   pnpm import:prices                 # recovered values only
 *   pnpm import:prices -- --estimates  # also invent the gaps, for testing
 *
 * This is the one script allowed to write `price_per_day` and `total_quantity`
 * — the catalog import deliberately never touches them. Two rules keep that
 * safe:
 *
 *   1. Staff data always wins. A value whose source is 'staff', or a non-null
 *      value with no source at all, is never overwritten.
 *   2. Everything written is labelled. `price_source` / `quantity_source` say
 *      whether a number was recovered from Odoo or invented for testing, and
 *      `select * from estimated_values` lists every invented one.
 *
 * Confidence maps onto provenance rather than being dropped: a `revisar` row
 * in the recovered file is a price copied from a sibling variant, which is a
 * guess — so it lands as 'estimated', not as 'recovered'.
 *
 * Needs SUPABASE_DB_URL.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

import { parseCsv } from "../lib/csv.mjs";
import { loadEnv, checkDbUrl } from "../lib/env.mjs";

loadEnv();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RECOVERED = join(ROOT, "precios-recuperados.csv");
const CATALOG = join(ROOT, "src", "data", "seed", "catalogo-limpio.csv");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ESTIMATES = args.includes("--estimates");

if (!existsSync(RECOVERED)) {
  console.error(
    `Missing ${RECOVERED}.\nRun: pnpm scrape:prices`,
  );
  process.exit(1);
}

const url = checkDbUrl(process.env.SUPABASE_DB_URL);

// ---------------------------------------------------------------------------
// Source data
// ---------------------------------------------------------------------------

const recoveredRows = parseCsv(readFileSync(RECOVERED, "utf8"));
const catalogRows = parseCsv(readFileSync(CATALOG, "utf8"));

/** source_key -> top-level category, for the per-category estimates. */
const categoryOf = new Map(
  catalogRows.map((r) => [r.unidad_alquilable, r.categoria_principal]),
);

const number = (text) => {
  if (text === undefined || text === null || text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
};

const median = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// ---------------------------------------------------------------------------
// What the recovered file gives us
// ---------------------------------------------------------------------------

const prices = new Map(); // source_key -> { value, source }
const quantities = new Map();

for (const row of recoveredRows) {
  const key = row.unidad_alquilable;
  const price = number(row.precio_24h);

  if (price !== null) {
    prices.set(key, {
      value: price,
      // A `revisar` price is a sibling's, or a rate Odoo stores per hour.
      // Real enough to test with, not real enough to quote.
      source: row.confianza === "alta" ? "recovered" : "estimated",
    });
  }

  const stock = number(row.existencias_odoo);

  // free_qty is what Odoo had FREE, not what the business owns, and zero shows
  // up on products whose stock was simply never maintained. Writing zero would
  // make an item permanently unbookable; in this schema unknown is a supported
  // state and a wrong number is a bug, so zero stays unknown.
  if (stock !== null && stock > 0) {
    quantities.set(key, { value: stock, source: "recovered" });
  }
}

// ---------------------------------------------------------------------------
// Estimates, only when asked for
// ---------------------------------------------------------------------------

const estimatedPrices = new Map();
const estimatedQuantities = new Map();

if (ESTIMATES) {
  const pricesByCategory = new Map();
  const stockByCategory = new Map();

  const push = (map, category, value) => {
    if (!category) return;
    if (!map.has(category)) map.set(category, []);
    map.get(category).push(value);
  };

  for (const [key, entry] of prices) push(pricesByCategory, categoryOf.get(key), entry.value);
  for (const [key, entry] of quantities) push(stockByCategory, categoryOf.get(key), entry.value);

  const allPrices = [...prices.values()].map((e) => e.value);
  const allStock = [...quantities.values()].map((e) => e.value);

  // A category median is a defensible guess: a chair estimated from other
  // chairs is far closer than a chair estimated from an alfombra.
  const priceFor = (category) =>
    median(pricesByCategory.get(category) ?? []) ?? median(allPrices) ?? 50;
  const stockFor = (category) =>
    Math.max(1, Math.round(median(stockByCategory.get(category) ?? []) ?? median(allStock) ?? 10));

  for (const row of catalogRows) {
    const key = row.unidad_alquilable;
    const category = row.categoria_principal;
    if (!prices.has(key)) estimatedPrices.set(key, { value: priceFor(category), source: "estimated" });
    if (!quantities.has(key)) estimatedQuantities.set(key, { value: stockFor(category), source: "estimated" });
  }
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

const priceWrites = [...prices, ...estimatedPrices];
const quantityWrites = [...quantities, ...estimatedQuantities];

console.log("A escribir:");
console.log(`  precios recuperados   : ${[...prices.values()].filter((e) => e.source === "recovered").length}`);
console.log(`  precios por revisar   : ${[...prices.values()].filter((e) => e.source === "estimated").length}`);
console.log(`  precios estimados     : ${estimatedPrices.size}`);
console.log(`  cantidades recuperadas: ${quantities.size}`);
console.log(`  cantidades estimadas  : ${estimatedQuantities.size}`);

if (DRY_RUN) {
  console.log("\n--dry-run: no se escribió nada.");
  process.exit(0);
}

const sql = postgres(url, { prepare: false, onnotice: () => {} });

try {
  const result = await sql.begin(async (tx) => {
    // The guard is in the WHERE clause rather than in JavaScript, so it holds
    // however this is called and whatever else is running at the time.
    const [{ count: pricesWritten }] = await tx`
      with incoming (source_key, value, source) as (
        select * from unnest(
          ${priceWrites.map(([k]) => k)}::text[],
          ${priceWrites.map(([, e]) => e.value)}::numeric[],
          ${priceWrites.map(([, e]) => e.source)}::text[]
        )
      )
      update variants v
         set price_per_day = i.value,
             price_source  = i.source,
             updated_at    = now()
        from incoming i
       where v.source_key = i.source_key
         and (v.price_per_day is null or v.price_source in ('recovered', 'estimated'))
      returning 1 as count
    `.then((rows) => [{ count: rows.length }]);

    const [{ count: quantitiesWritten }] = await tx`
      with incoming (source_key, value, source) as (
        select * from unnest(
          ${quantityWrites.map(([k]) => k)}::text[],
          ${quantityWrites.map(([, e]) => e.value)}::integer[],
          ${quantityWrites.map(([, e]) => e.source)}::text[]
        )
      )
      update variants v
         set total_quantity   = i.value,
             quantity_source  = i.source,
             updated_at       = now()
        from incoming i
       where v.source_key = i.source_key
         and (v.total_quantity is null or v.quantity_source in ('recovered', 'estimated'))
      returning 1 as count
    `.then((rows) => [{ count: rows.length }]);

    return { pricesWritten, quantitiesWritten };
  });

  console.log(`\nEscrito: ${result.pricesWritten} precios, ${result.quantitiesWritten} cantidades.`);

  const [state] = await sql`
    select
      (select count(*) from variants where price_per_day is not null)      as con_precio,
      (select count(*) from variants where total_quantity is not null)     as con_cantidad,
      (select count(*) from variants where price_source = 'recovered')     as precio_recuperado,
      (select count(*) from variants where price_source = 'estimated')     as precio_estimado,
      (select count(*) from variants where quantity_source = 'estimated')  as cantidad_estimada,
      (select count(*) from public_catalog)                                as publicables
  `;

  console.log("\nEstado del catálogo:");
  console.log(`  variantes con precio    : ${state.con_precio} / 129`);
  console.log(`  variantes con cantidad  : ${state.con_cantidad} / 129`);
  console.log(`  precio recuperado       : ${state.precio_recuperado}`);
  console.log(`  precio estimado         : ${state.precio_estimado}`);
  console.log(`  cantidad estimada       : ${state.cantidad_estimada}`);
  console.log(`  visibles al público     : ${state.publicables}`);

  if (Number(state.precio_estimado) > 0 || Number(state.cantidad_estimada) > 0) {
    console.log(
      "\n⚠  Hay datos inventados en la base. No son precios reales.\n" +
        "   Verlos   : select * from estimated_values;\n" +
        "   Borrarlos: pnpm db:clear-estimates",
    );
  }
} catch (error) {
  console.error("\nFalló, no se escribió nada:");
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

/**
 * Applies the generated import SQL to the database.
 *
 *   node scripts/import/build-import-sql.mjs   # regenerate from the CSVs
 *   node scripts/import/run-import.mjs         # apply it
 *
 * Idempotent: run it as often as the source files are corrected. It never
 * duplicates a row, never writes price_per_day or total_quantity, and never
 * overwrites a name or label staff have marked as overridden.
 *
 * Needs SUPABASE_DB_URL (Project Settings > Database > Connection string).
 * That is a service credential — it belongs in .env.local, never in the app.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { loadEnv, checkDbUrl } from "../lib/env.mjs";

loadEnv();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SEED = join(ROOT, "supabase", "seed");

const url = checkDbUrl(process.env.SUPABASE_DB_URL);

const PARTS = [
  "01-categories.sql",
  "02-products.sql",
  "03-variants.sql",
  "04-customers.sql",
];

for (const part of PARTS) {
  if (!existsSync(join(SEED, part))) {
    console.error(
      `Missing ${part}. Run: node scripts/import/build-import-sql.mjs`,
    );
    process.exit(1);
  }
}

const sql = postgres(url, { prepare: false, onnotice: () => {} });

try {
  // One transaction for the whole import: a half-applied catalog is worse than
  // no catalog, and re-running is free.
  await sql.begin(async (tx) => {
    for (const part of PARTS) {
      const body = readFileSync(join(SEED, part), "utf8");
      await tx.unsafe(body);
      console.log(`  applied ${part}`);
    }
  });

  const [counts] = await sql`
    select
      (select count(*) from categories) as categories,
      (select count(*) from products)   as products,
      (select count(*) from variants)   as variants,
      (select count(*) from customers)  as customers
  `;

  const [gaps] = await sql`select * from catalog_gaps_summary`;

  console.log("\nImported:");
  console.log(`  categories : ${counts.categories}`);
  console.log(`  products   : ${counts.products}`);
  console.log(`  variants   : ${counts.variants}`);
  console.log(`  customers  : ${counts.customers}`);
  console.log("\nGaps to fill from the admin panel:");
  console.log(`  missing price    : ${gaps.variants_missing_price}`);
  console.log(`  missing quantity : ${gaps.variants_missing_quantity}`);
  console.log(`  missing photo    : ${gaps.products_missing_photo}`);
} catch (error) {
  console.error("\nImport failed, nothing was written:");
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

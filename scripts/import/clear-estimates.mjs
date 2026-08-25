/**
 * Removes every invented price and quantity from the database.
 *
 *   pnpm db:clear-estimates -- --dry-run
 *   pnpm db:clear-estimates
 *
 * The estimates exist so the site can be tested end to end before the real
 * numbers are known. They are not prices this business charges, and this is
 * the one command that guarantees none of them survive to a real customer.
 *
 * It only touches rows explicitly marked 'estimated'. Recovered values and
 * anything staff entered are left exactly as they are.
 *
 * Needs SUPABASE_DB_URL.
 */

import postgres from "postgres";
import { loadEnv, checkDbUrl } from "../lib/env.mjs";

loadEnv();

const DRY_RUN = process.argv.slice(2).includes("--dry-run");
const sql = postgres(checkDbUrl(process.env.SUPABASE_DB_URL), {
  prepare: false,
  onnotice: () => {},
});

try {
  const doomed = await sql`select * from estimated_values`;

  if (doomed.length === 0) {
    console.log("No hay datos estimados en la base. Nada que borrar.");
    process.exit(0);
  }

  console.log(`${doomed.length} variantes con datos inventados:\n`);
  for (const row of doomed.slice(0, 15)) {
    const name = [row.product_name, row.variant_label].filter(Boolean).join(" — ");
    const price = row.price_source === "estimated" ? `precio C$${row.price_per_day}` : null;
    const qty = row.quantity_source === "estimated" ? `cantidad ${row.total_quantity}` : null;
    console.log(`  ${name.padEnd(44)} ${[price, qty].filter(Boolean).join(", ")}`);
  }
  if (doomed.length > 15) console.log(`  … y ${doomed.length - 15} más`);

  if (DRY_RUN) {
    console.log("\n--dry-run: no se borró nada.");
    process.exit(0);
  }

  const [result] = await sql.begin(async (tx) => {
    const priced = await tx`
      update variants
         set price_per_day = null, price_source = null, updated_at = now()
       where price_source = 'estimated'
      returning 1
    `;
    const counted = await tx`
      update variants
         set total_quantity = null, quantity_source = null, updated_at = now()
       where quantity_source = 'estimated'
      returning 1
    `;
    return [{ priced: priced.length, counted: counted.length }];
  });

  const [state] = await sql`
    select
      (select count(*) from variants where price_per_day is not null) as con_precio,
      (select count(*) from public_catalog)                           as publicables,
      (select count(*) from estimated_values)                         as estimados
  `;

  console.log(`\nBorrados: ${result.priced} precios, ${result.counted} cantidades.`);
  console.log(`Quedan ${state.con_precio} variantes con precio, ${state.publicables} visibles al público.`);
  console.log(`Datos inventados restantes: ${state.estimados}`);
} finally {
  await sql.end();
}

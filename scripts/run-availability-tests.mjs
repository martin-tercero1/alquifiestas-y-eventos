/**
 * Runs the availability engine regression suite.
 *
 *   npm run db:test
 *
 * The suite lives in the database (tests.availability_suite) because the engine
 * does, and testing the real SQL against real Postgres is the only test worth
 * having here. It runs inside a rolled-back subtransaction, so it is safe
 * against a database holding real orders.
 *
 * Exits non-zero if anything fails, so CI can use it.
 */

import postgres from "postgres";
import { loadEnv, checkDbUrl } from "./lib/env.mjs";

loadEnv();

const url = checkDbUrl(process.env.SUPABASE_DB_URL);

const sql = postgres(url, { prepare: false, onnotice: () => {} });

try {
  const results = await sql`select * from tests.availability_suite()`;
  const failed = results.filter((r) => !r.passed);

  for (const row of results) {
    console.log(`  ${row.passed ? "✓" : "✗"} ${row.case_name}`);
    if (!row.passed) console.log(`      ${row.detail}`);
  }

  console.log(
    `\n${results.length - failed.length}/${results.length} passed` +
      (failed.length ? ` — ${failed.length} FAILED` : ""),
  );

  if (failed.length > 0) process.exitCode = 1;
} finally {
  await sql.end();
}

/**
 * Dumps the applied migration history out of Supabase into
 * `supabase/migrations/` so the schema lives in the repository rather than
 * only in the hosted project.
 *
 * The brief requires migrations for every schema change and forbids editing
 * schema by hand in a dashboard. Migrations are applied through the Supabase
 * MCP tooling, which records them server-side; this pulls them back down so
 * the repo is the durable record.
 *
 *   node scripts/dump-migrations.mjs
 *
 * Needs SUPABASE_DB_URL (the pooled connection string, service credentials).
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { loadEnv, checkDbUrl } from "./lib/env.mjs";

loadEnv();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "supabase", "migrations");

const url = checkDbUrl(process.env.SUPABASE_DB_URL);

const sql = postgres(url, { prepare: false });

const rows = await sql`
  select version, name, statements
  from supabase_migrations.schema_migrations
  order by version
`;

mkdirSync(OUT, { recursive: true });

for (const row of rows) {
  const filename = `${row.version}_${row.name ?? "unnamed"}.sql`;
  writeFileSync(join(OUT, filename), `${row.statements.join(";\n\n")}\n`);
  console.log(`  ${filename}`);
}

console.log(`\nWrote ${rows.length} migrations to supabase/migrations/`);
await sql.end();

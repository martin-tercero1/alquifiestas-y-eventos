/**
 * Minimal .env.local reader, so scripts run without a dotenv dependency.
 * Real environment variables always win over the file.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Fails with the fix, not just the symptom.
 *
 * The direct Supabase host is IPv6-only, so `postgres` dies with a bare
 * ENOTFOUND on any IPv4-only network. That error tells you nothing useful the
 * first three times you hit it.
 */
export function checkDbUrl(url) {
  if (!url) {
    console.error(
      "SUPABASE_DB_URL is not set.\n" +
        "Supabase dashboard > Project Settings > Database > Connection string > Session pooler.\n" +
        "See .env.example.",
    );
    process.exit(1);
  }

  if (/^db\..*\.supabase\.co$/.test(new URL(url).hostname)) {
    console.error(
      "SUPABASE_DB_URL points at the DIRECT connection, which is IPv6-only and\n" +
        "will fail with ENOTFOUND on an IPv4 network.\n\n" +
        "Use the Session pooler string instead:\n" +
        "  Project Settings > Database > Connection string > Session pooler\n" +
        "  postgresql://postgres.<ref>:PASSWORD@aws-0-<region>.pooler.supabase.com:5432/postgres",
    );
    process.exit(1);
  }

  return url;
}

export function loadEnv() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

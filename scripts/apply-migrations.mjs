import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const raw = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!raw) {
  console.error("Missing POSTGRES_URL_NON_POOLING / POSTGRES_URL");
  process.exit(1);
}
const url = raw.replace(/([?&])sslmode=[^&]*/, "$1sslmode=no-verify").includes("sslmode=")
  ? raw.replace(/([?&])sslmode=[^&]*/, "$1sslmode=no-verify")
  : raw + (raw.includes("?") ? "&" : "?") + "sslmode=no-verify";

const dir = "supabase/migrations";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS public._migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
`);

const { rows: appliedRows } = await client.query("SELECT name FROM public._migrations");
const applied = new Set(appliedRows.map((r) => r.name));

const baseline = new Set(["0001_init.sql", "0002_rls.sql"]);
for (const file of baseline) {
  if (!applied.has(file)) {
    await client.query("INSERT INTO public._migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [file]);
    applied.add(file);
    console.log(`baseline ${file} (marked applied without running — schema already exists)`);
  }
}

let appliedCount = 0;
for (const file of files) {
  if (applied.has(file)) {
    console.log(`skip ${file} (already applied)`);
    continue;
  }
  const sql = readFileSync(join(dir, file), "utf8");
  console.log(`\n--- applying ${file} (${sql.length} bytes) ---`);
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO public._migrations (name) VALUES ($1)", [file]);
    await client.query("COMMIT");
    console.log(`OK ${file}`);
    appliedCount++;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`FAIL ${file}: ${err.message}`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log(`\n${appliedCount} new migration(s) applied.`);

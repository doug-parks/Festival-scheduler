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

for (const file of files) {
  const sql = readFileSync(join(dir, file), "utf8");
  console.log(`\n--- applying ${file} (${sql.length} bytes) ---`);
  try {
    await client.query(sql);
    console.log(`OK ${file}`);
  } catch (err) {
    console.error(`FAIL ${file}: ${err.message}`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log("\nAll migrations applied.");

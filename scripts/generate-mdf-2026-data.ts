/**
 * Generates the baked-in MDF 2026 set times data module from the committed
 * deathfests.com HTML snapshot at `tests/fixtures/mdf-2026.html`.
 *
 * Outputs:
 *   - `src/data/mdf-2026.ts`     — TypeScript exports (STAGES, BANDS, SETS)
 *   - `supabase/migrations/0009_seed_mdf2026_data.sql` — idempotent SQL seed
 *
 * Deterministic: UUIDs are derived (RFC-4122 v5-style) from a fixed namespace
 * + stable natural keys (stage name / band slug / band slug + stage + start),
 * so re-running produces byte-identical output. This is the dev tool for
 * regenerating the seed when the deathfests.com lineup changes — fetch a
 * fresh snapshot, replace the fixture, re-run this script, commit the diff.
 *
 *   node --experimental-strip-types scripts/generate-mdf-2026-data.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { parseSetTimes } from "./scrape-mdf-2026.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// Stable namespace UUID for deterministic v5-style derivation. Don't rotate
// this — it pins the IDs of every committed seed row.
const NS = "mdf-2026-v1";

/**
 * Deterministic UUID derived from a name + the fixed namespace via SHA-1.
 * Matches RFC-4122 v5 bit-layout (variant 10xx, version 0101) so the output
 * is a valid UUID that Postgres' `uuid` type accepts unchanged.
 */
function deterministicUuid(name: string): string {
  const hash = createHash("sha1").update(`${NS}:${name}`).digest();
  // Apply v5 variant/version bits.
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // variant RFC4122
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function sqlString(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

function main() {
  const fixturePath = join(REPO_ROOT, "tests/fixtures/mdf-2026.html");
  const html = readFileSync(fixturePath, "utf-8");
  const parsed = parseSetTimes(html);

  if (parsed.errors.length > 0) {
    console.error("Parse errors:", parsed.errors);
    process.exit(1);
  }
  if (parsed.sets.length === 0) {
    console.error("Empty parse — refusing to overwrite seed.");
    process.exit(1);
  }

  // Sort everything to keep output stable across runs.
  const stages = [...parsed.stages].sort((a, b) =>
    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
  const bands = [...parsed.bands].sort((a, b) => a.slug.localeCompare(b.slug));
  const sets = [...parsed.sets].sort((a, b) => {
    if (a.startUtc !== b.startUtc) return a.startUtc < b.startUtc ? -1 : 1;
    if (a.stageName !== b.stageName) return a.stageName.localeCompare(b.stageName);
    return a.bandSlug.localeCompare(b.bandSlug);
  });

  // Deterministic ID maps.
  const stageIdByName = new Map<string, string>();
  for (const s of stages) {
    stageIdByName.set(s.name, deterministicUuid(`stage:${s.name}`));
  }
  const bandIdBySlug = new Map<string, string>();
  for (const b of bands) {
    bandIdBySlug.set(b.slug, deterministicUuid(`band:${b.slug}`));
  }

  // ── Emit src/data/mdf-2026.ts ────────────────────────────────────────────
  const dataDir = join(REPO_ROOT, "src/data");
  mkdirSync(dataDir, { recursive: true });

  const stageEntries = stages.map((s) => {
    const id = stageIdByName.get(s.name)!;
    return `  {
    id: "${id}",
    name: ${JSON.stringify(s.name)},
    sort_order: ${s.sortOrder},
    display_color: null,
  },`;
  });
  const bandEntries = bands.map((b) => {
    const id = bandIdBySlug.get(b.slug)!;
    return `  {
    id: "${id}",
    name: ${JSON.stringify(b.name)},
    slug: ${JSON.stringify(b.slug)},
  },`;
  });
  const setEntries = sets.map((s) => {
    const bandId = bandIdBySlug.get(s.bandSlug)!;
    const stageId = stageIdByName.get(s.stageName)!;
    const id = deterministicUuid(`set:${s.bandSlug}|${s.stageName}|${s.startUtc}`);
    return `  {
    id: "${id}",
    band_id: "${bandId}",
    stage_id: "${stageId}",
    start_time: ${JSON.stringify(s.startUtc)},
    end_time: ${JSON.stringify(s.endUtc)},
  },`;
  });

  const dataFile = `/**
 * MDF 2026 set times — baked into the repo.
 *
 * GENERATED FILE — do not edit by hand. Regenerate from the latest
 * deathfests.com snapshot:
 *
 *   1. Fetch a fresh \`tests/fixtures/mdf-2026.html\`.
 *   2. \`node --experimental-strip-types scripts/generate-mdf-2026-data.ts\`.
 *   3. Commit the resulting diff (this file + the SQL seed).
 *
 * UUIDs are deterministic (SHA-1 of a stable namespace + natural key) so
 * re-running produces byte-identical output and no row IDs ever drift.
 */

export type SeedStage = {
  id: string;
  name: string;
  sort_order: number;
  display_color: string | null;
};

export type SeedBand = {
  id: string;
  name: string;
  slug: string;
};

export type SeedSet = {
  id: string;
  band_id: string;
  stage_id: string;
  start_time: string; // ISO UTC
  end_time: string;
};

export const STAGES: SeedStage[] = [
${stageEntries.join("\n")}
];

export const BANDS: SeedBand[] = [
${bandEntries.join("\n")}
];

export const SETS: SeedSet[] = [
${setEntries.join("\n")}
];
`;
  writeFileSync(join(dataDir, "mdf-2026.ts"), dataFile, "utf-8");

  // ── Emit supabase/migrations/0009_seed_mdf2026_data.sql ──────────────────
  const sqlLines: string[] = [];
  sqlLines.push(`-- GENERATED by scripts/generate-mdf-2026-data.ts — do not edit by hand.`);
  sqlLines.push(`-- Seeds the baked-in MDF 2026 lineup. Idempotent: ON CONFLICT DO UPDATE on the`);
  sqlLines.push(`-- primary keys (which are deterministic UUIDs derived from natural keys).`);
  sqlLines.push("");
  sqlLines.push(`-- Stages`);
  for (const s of stages) {
    const id = stageIdByName.get(s.name)!;
    sqlLines.push(
      `insert into public.stages (id, name, sort_order) values ('${id}', ${sqlString(s.name)}, ${s.sortOrder})`,
    );
    sqlLines.push(`  on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order;`);
  }
  sqlLines.push("");
  sqlLines.push(`-- Bands`);
  for (const b of bands) {
    const id = bandIdBySlug.get(b.slug)!;
    sqlLines.push(
      `insert into public.bands (id, name, slug) values ('${id}', ${sqlString(b.name)}, ${sqlString(b.slug)})`,
    );
    sqlLines.push(`  on conflict (id) do update set name = excluded.name, slug = excluded.slug;`);
  }
  sqlLines.push("");
  sqlLines.push(`-- Sets`);
  for (const s of sets) {
    const bandId = bandIdBySlug.get(s.bandSlug)!;
    const stageId = stageIdByName.get(s.stageName)!;
    const id = deterministicUuid(`set:${s.bandSlug}|${s.stageName}|${s.startUtc}`);
    sqlLines.push(
      `insert into public.sets (id, band_id, stage_id, start_time, end_time) values ('${id}', '${bandId}', '${stageId}', ${sqlString(s.startUtc)}, ${sqlString(s.endUtc)})`,
    );
    sqlLines.push(
      `  on conflict (id) do update set band_id = excluded.band_id, stage_id = excluded.stage_id, start_time = excluded.start_time, end_time = excluded.end_time;`,
    );
  }
  sqlLines.push("");
  writeFileSync(
    join(REPO_ROOT, "supabase/migrations/0009_seed_mdf2026_data.sql"),
    sqlLines.join("\n"),
    "utf-8",
  );

  console.log(
    `Generated src/data/mdf-2026.ts (${stages.length} stages, ${bands.length} bands, ${sets.length} sets)`,
  );
  console.log(`Generated supabase/migrations/0009_seed_mdf2026_data.sql`);
}

main();

"use server";

/**
 * Admin importer for MDF 2026 — scrapes deathfests.com/set-times/ and
 * upserts bands, stages, and sets into Supabase. Designed to be safely
 * re-runnable: the unique constraints on (festival_id, slug) for bands,
 * (festival_id, name) for stages, and (band_id, stage_id, start_time)
 * for sets back stop ON CONFLICT DO UPDATE so existing public.picks rows
 * keep pointing at the same set IDs across re-imports.
 *
 * Auth: relies on the existing is_admin() RLS policies (see 0002_rls.sql)
 * — the standard server client carries the admin's session cookie and
 * Postgres enforces write-eligibility. The /admin route is already
 * gated to non-admins by middleware (404 rewrite).
 */

import { createClient } from "@/lib/supabase/server";
import {
  MDF_2026_SLUG,
  scrapeMdf2026,
  type ParseError,
} from "../../../../scripts/scrape-mdf-2026";

export type UpsertCounts = {
  inserted: number;
  updated: number;
  unchanged: number;
};

export type ImportResult = {
  ok: boolean;
  message?: string;
  /** True when the scraper returned 0 sets — likely a JS-rendered page. */
  likelyJsRendered: boolean;
  bands: UpsertCounts;
  stages: UpsertCounts;
  sets: UpsertCounts;
  parseErrors: ParseError[];
  /** Database errors hit during upsert (separate from parse errors). */
  dbErrors: string[];
};

const EMPTY_COUNTS: UpsertCounts = { inserted: 0, updated: 0, unchanged: 0 };

function emptyResult(overrides: Partial<ImportResult> = {}): ImportResult {
  return {
    ok: true,
    likelyJsRendered: false,
    bands: { ...EMPTY_COUNTS },
    stages: { ...EMPTY_COUNTS },
    sets: { ...EMPTY_COUNTS },
    parseErrors: [],
    dbErrors: [],
    ...overrides,
  };
}

export async function runImport(): Promise<ImportResult> {
  const supabase = await createClient();

  // 1. Verify auth and admin gate. Middleware already 404s non-admins on
  // the route itself, but server actions can be invoked directly so we
  // recheck here.
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return emptyResult({
      ok: false,
      message: "Not signed in.",
    });
  }
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    return emptyResult({ ok: false, message: "Not authorized." });
  }

  // 2. Find the MDF 2026 festival row (seeded by 0003_seed_mdf2026.sql).
  const { data: festival, error: fErr } = await supabase
    .from("festivals")
    .select("id")
    .eq("slug", MDF_2026_SLUG)
    .maybeSingle();
  if (fErr) {
    return emptyResult({ ok: false, message: `Festival lookup failed: ${fErr.message}` });
  }
  if (!festival) {
    return emptyResult({
      ok: false,
      message:
        "MDF 2026 festival row missing. Apply migration 0003_seed_mdf2026.sql.",
    });
  }
  const festivalId = festival.id as string;

  // 3. Scrape the source page.
  let scrape;
  try {
    scrape = await scrapeMdf2026();
  } catch (err) {
    return emptyResult({
      ok: false,
      message: `Scrape failed: ${(err as Error).message}`,
    });
  }

  const result: ImportResult = emptyResult({
    likelyJsRendered: scrape.likelyJsRendered,
    parseErrors: scrape.errors,
  });

  if (scrape.likelyJsRendered) {
    // Don't try to delete the existing rows — bail with a clear note so
    // the admin can decide whether to escalate to Playwright.
    result.ok = false;
    result.message =
      "No sets parsed from deathfests.com. The page may be JS-rendered. " +
      "File a follow-up to add Playwright before importing.";
    return result;
  }

  // 4. Upsert stages. Snapshot pre-state so we can compute insert vs.
  // update counts (Supabase doesn't return this directly).
  const stagesBefore = await supabase
    .from("stages")
    .select("id, name")
    .eq("festival_id", festivalId);
  if (stagesBefore.error) {
    result.dbErrors.push(`stages select: ${stagesBefore.error.message}`);
  }
  const existingStageNames = new Set(
    (stagesBefore.data ?? []).map((s: { name: string }) => s.name),
  );

  const stageRows = scrape.stages.map((s) => ({
    festival_id: festivalId,
    name: s.name,
    sort_order: s.sortOrder,
  }));
  const stagesUpsert = await supabase
    .from("stages")
    .upsert(stageRows, { onConflict: "festival_id,name" })
    .select("id, name");
  if (stagesUpsert.error) {
    result.dbErrors.push(`stages upsert: ${stagesUpsert.error.message}`);
    result.ok = false;
    return result;
  }
  const stagesNow = stagesUpsert.data ?? [];
  for (const s of stagesNow) {
    if (existingStageNames.has(s.name as string)) result.stages.updated += 1;
    else result.stages.inserted += 1;
  }
  const stageIdByName = new Map<string, string>(
    stagesNow.map((s) => [s.name as string, s.id as string]),
  );

  // 5. Upsert bands. Same insert/update tracking.
  const bandsBefore = await supabase
    .from("bands")
    .select("id, slug")
    .eq("festival_id", festivalId);
  if (bandsBefore.error) {
    result.dbErrors.push(`bands select: ${bandsBefore.error.message}`);
  }
  const existingBandSlugs = new Set(
    (bandsBefore.data ?? []).map((b: { slug: string }) => b.slug),
  );

  const bandRows = scrape.bands.map((b) => ({
    festival_id: festivalId,
    name: b.name,
    slug: b.slug,
  }));
  const bandsUpsert = await supabase
    .from("bands")
    .upsert(bandRows, { onConflict: "festival_id,slug" })
    .select("id, slug");
  if (bandsUpsert.error) {
    result.dbErrors.push(`bands upsert: ${bandsUpsert.error.message}`);
    result.ok = false;
    return result;
  }
  const bandsNow = bandsUpsert.data ?? [];
  for (const b of bandsNow) {
    if (existingBandSlugs.has(b.slug as string)) result.bands.updated += 1;
    else result.bands.inserted += 1;
  }
  const bandIdBySlug = new Map<string, string>(
    bandsNow.map((b) => [b.slug as string, b.id as string]),
  );

  // 6. Upsert sets. The natural key is (band_id, stage_id, start_time).
  // Pre-snapshot the set keys so we can classify each upsert outcome.
  const bandIds = Array.from(bandIdBySlug.values());
  const setsBefore = bandIds.length
    ? await supabase
        .from("sets")
        .select("id, band_id, stage_id, start_time")
        .in("band_id", bandIds)
    : { data: [], error: null as null | { message: string } };
  if (setsBefore.error) {
    result.dbErrors.push(`sets select: ${setsBefore.error.message}`);
  }
  const existingSetKeys = new Set(
    (setsBefore.data ?? []).map(
      (s: { band_id: string; stage_id: string; start_time: string }) =>
        `${s.band_id}|${s.stage_id}|${new Date(s.start_time).toISOString()}`,
    ),
  );

  type SetRow = {
    band_id: string;
    stage_id: string;
    start_time: string;
    end_time: string;
  };
  const setRows: SetRow[] = [];
  for (const s of scrape.sets) {
    const bandId = bandIdBySlug.get(s.bandSlug);
    const stageId = stageIdByName.get(s.stageName);
    if (!bandId || !stageId) {
      result.parseErrors.push({
        band: s.bandName,
        stage: s.stageName,
        message: "Missing band or stage row after upsert — should not happen",
      });
      continue;
    }
    setRows.push({
      band_id: bandId,
      stage_id: stageId,
      start_time: s.startUtc,
      end_time: s.endUtc,
    });
  }

  if (setRows.length > 0) {
    const setsUpsert = await supabase
      .from("sets")
      .upsert(setRows, { onConflict: "band_id,stage_id,start_time" })
      .select("id, band_id, stage_id, start_time");
    if (setsUpsert.error) {
      result.dbErrors.push(`sets upsert: ${setsUpsert.error.message}`);
      result.ok = false;
      return result;
    }
    for (const s of setsUpsert.data ?? []) {
      const key = `${s.band_id}|${s.stage_id}|${new Date(s.start_time as string).toISOString()}`;
      if (existingSetKeys.has(key)) result.sets.updated += 1;
      else result.sets.inserted += 1;
    }
  }

  return result;
}

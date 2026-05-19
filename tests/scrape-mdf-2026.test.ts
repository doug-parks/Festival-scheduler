/**
 * Unit tests for the MDF 2026 scraper. Run with `pnpm test`.
 *
 * Spec note: these are the highest-value regression net for re-imports —
 * if deathfests.com cosmetically updates its markup, the snapshot drift
 * here will surface before the live import quietly mangles set times.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  localToUtc,
  normalizeBandName,
  parseSetTimes,
  slugifyBand,
} from "../scripts/scrape-mdf-2026.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, "fixtures/mdf-2026.html"), "utf-8");

describe("slugifyBand", () => {
  it("lowercases and hyphenates", () => {
    assert.equal(slugifyBand("Cradle of Filth"), "cradle-of-filth");
  });
  it("is case-insensitive", () => {
    assert.equal(slugifyBand("Cradle Of Filth"), "cradle-of-filth");
  });
  it("trims surrounding whitespace", () => {
    assert.equal(slugifyBand("  Cradle of Filth  "), "cradle-of-filth");
  });
  it("treats nbsp as a normal space", () => {
    // U+00A0 NO-BREAK SPACE
    assert.equal(slugifyBand("Cradle of Filth"), "cradle-of-filth");
  });
  it("strips combining accents", () => {
    assert.equal(slugifyBand("Sarcófago"), "sarcofago");
  });
  it("keeps numeric prefixes intact", () => {
    assert.equal(slugifyBand("1914"), "1914");
  });
});

describe("normalizeBandName", () => {
  it("strips ' | Signing' suffix and flags the row", () => {
    const r = normalizeBandName("God Dethroned | Signing");
    assert.equal(r.name, "God Dethroned");
    assert.equal(r.isSigning, true);
  });
  it("decodes HTML entities for curly punctuation", () => {
    const r = normalizeBandName("Old Man&#8217;s Child");
    assert.equal(r.name, "Old Man’s Child");
    assert.equal(r.isSigning, false);
  });
});

describe("localToUtc", () => {
  it("converts EDT correctly (May 2026, UTC-4)", () => {
    // 2026-05-22 20:00 America/New_York = 2026-05-23 00:00 UTC
    const utc = localToUtc("2026-05-22 20:00");
    assert.equal(utc.toISOString(), "2026-05-23T00:00:00.000Z");
  });
  it("converts EST correctly (Jan 2026, UTC-5)", () => {
    // 2026-01-15 20:00 America/New_York = 2026-01-16 01:00 UTC
    const utc = localToUtc("2026-01-15 20:00");
    assert.equal(utc.toISOString(), "2026-01-16T01:00:00.000Z");
  });
  it("is deterministic on repeat calls (idempotency check)", () => {
    const a = localToUtc("2026-05-22 20:00").toISOString();
    const b = localToUtc("2026-05-22 20:00").toISOString();
    assert.equal(a, b);
  });
});

describe("parseSetTimes (against the committed mdf-2026.html fixture)", () => {
  const result = parseSetTimes(fixture);

  it("does not flag the page as JS-rendered", () => {
    assert.equal(result.likelyJsRendered, false);
  });

  it("produces zero parse errors against the snapshot", () => {
    assert.deepEqual(result.errors, []);
  });

  it("discovers all six MDF stages", () => {
    const names = result.stages.map((s) => s.name).sort();
    assert.deepEqual(
      names,
      [
        "Angels Rock Bar",
        "Market Place",
        "Mosaic Nightclub",
        "Nevermore Hall",
        "Power Plant Live",
        "Soundstage",
      ],
    );
  });

  it("produces a non-empty set list", () => {
    assert.ok(result.sets.length > 50, `expected >50 sets, got ${result.sets.length}`);
  });

  it("dates Wednesday performances to May 20, 2026", () => {
    const napalm = result.sets.find((s) => s.bandSlug === "napalm-death");
    assert.ok(napalm, "Napalm Death not found");
    // Napalm Death is the Wednesday headliner. start_local should be May 20.
    assert.ok(
      napalm!.startLocal.startsWith("2026-05-20"),
      `expected start on 2026-05-20, got ${napalm!.startLocal}`,
    );
  });

  it("rolls over to the next calendar day for past-midnight sets", () => {
    // The last set should be early on Monday May 25 (post-midnight Sunday).
    const lastSet = result.sets[result.sets.length - 1];
    assert.ok(
      lastSet.endLocal.startsWith("2026-05-25"),
      `expected last set to end on 2026-05-25, got ${lastSet.endLocal}`,
    );
  });

  it("computes end_time = start_time + rowspan * 5 minutes", () => {
    // Pick any set; verify duration is a positive multiple of 5 minutes.
    for (const s of result.sets) {
      const startMs = Date.parse(s.startUtc);
      const endMs = Date.parse(s.endUtc);
      assert.ok(endMs > startMs, `set ${s.bandName} has non-positive duration`);
      const minutes = (endMs - startMs) / 60_000;
      assert.equal(minutes % 5, 0, `set ${s.bandName} duration ${minutes} not multiple of 5`);
    }
  });

  it("treats the (band_slug, stage, start_time) tuple as the natural key", () => {
    // Idempotency check: parsing twice yields identical conflict keys.
    const a = parseSetTimes(fixture);
    const b = parseSetTimes(fixture);
    const keyA = a.sets
      .map((s) => `${s.bandSlug}|${s.stageName}|${s.startUtc}`)
      .sort()
      .join("\n");
    const keyB = b.sets
      .map((s) => `${s.bandSlug}|${s.stageName}|${s.startUtc}`)
      .sort()
      .join("\n");
    assert.equal(keyA, keyB);
  });

  it("reports per-row errors rather than throwing on a broken cell", () => {
    // Synthesize broken markup: a band cell with an invalid rowspan.
    // The day header uses a space (not <br>) so the date parser succeeds
    // and we exercise the row-level error path.
    const broken = `<!doctype html><html><body>
      <h2>Wednesday May 20, 2026</h2>
      <table><tbody>
        <tr><td></td><td>Test Stage</td></tr>
        <tr><td>Doors</td><td>Doors 6:00PM</td></tr>
        <tr><td>16:30</td><td rowspan="not-a-number">Broken Band</td></tr>
        <tr><td>16:35</td><td></td></tr>
      </tbody></table>
      </body></html>`;
    const r = parseSetTimes(broken);
    assert.ok(r.errors.length >= 1, "expected at least one parse error");
    assert.ok(
      r.errors.some((e) => /rowspan/i.test(e.message)),
      "expected an error mentioning rowspan, got: " +
        JSON.stringify(r.errors),
    );
  });
});

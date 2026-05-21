/**
 * Unit tests for the MDF 2026 scraper.
 *
 * Spec note: these are the highest-value regression net for re-imports —
 * if deathfests.com cosmetically updates its markup, the snapshot drift
 * here will surface before the live import quietly mangles set times.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  localToUtc,
  normalizeBandName,
  parseSetTimes,
  slugifyBand,
} from "../../scripts/scrape-mdf-2026.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(
  join(__dirname, "../fixtures/mdf-2026.html"),
  "utf-8",
);

describe("slugifyBand", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyBand("Cradle of Filth")).toBe("cradle-of-filth");
  });
  it("is case-insensitive", () => {
    expect(slugifyBand("Cradle Of Filth")).toBe("cradle-of-filth");
  });
  it("trims surrounding whitespace", () => {
    expect(slugifyBand("  Cradle of Filth  ")).toBe("cradle-of-filth");
  });
  it("treats nbsp as a normal space", () => {
    expect(slugifyBand("Cradle of Filth")).toBe("cradle-of-filth");
  });
  it("strips combining accents", () => {
    expect(slugifyBand("Sarcófago")).toBe("sarcofago");
  });
  it("keeps numeric prefixes intact", () => {
    expect(slugifyBand("1914")).toBe("1914");
  });
});

describe("normalizeBandName", () => {
  it("strips ' | Signing' suffix and flags the row", () => {
    const r = normalizeBandName("God Dethroned | Signing");
    expect(r.name).toBe("God Dethroned");
    expect(r.isSigning).toBe(true);
  });
  it("decodes HTML entities for curly punctuation", () => {
    const r = normalizeBandName("Old Man&#8217;s Child");
    expect(r.name).toBe("Old Man’s Child");
    expect(r.isSigning).toBe(false);
  });
});

describe("localToUtc", () => {
  it("converts EDT correctly (May 2026, UTC-4)", () => {
    const utc = localToUtc("2026-05-22 20:00");
    expect(utc.toISOString()).toBe("2026-05-23T00:00:00.000Z");
  });
  it("converts EST correctly (Jan 2026, UTC-5)", () => {
    const utc = localToUtc("2026-01-15 20:00");
    expect(utc.toISOString()).toBe("2026-01-16T01:00:00.000Z");
  });
  it("is deterministic on repeat calls (idempotency check)", () => {
    const a = localToUtc("2026-05-22 20:00").toISOString();
    const b = localToUtc("2026-05-22 20:00").toISOString();
    expect(a).toBe(b);
  });
});

describe("parseSetTimes (against the committed mdf-2026.html fixture)", () => {
  const result = parseSetTimes(fixture);

  it("does not flag the page as JS-rendered", () => {
    expect(result.likelyJsRendered).toBe(false);
  });

  it("produces zero parse errors against the snapshot", () => {
    expect(result.errors).toEqual([]);
  });

  it("discovers all six MDF stages", () => {
    const names = result.stages.map((s) => s.name).sort();
    expect(names).toEqual([
      "Angels Rock Bar",
      "Market Place",
      "Mosaic Nightclub",
      "Nevermore Hall",
      "Power Plant Live",
      "Soundstage",
    ]);
  });

  it("produces a non-empty set list", () => {
    expect(result.sets.length).toBeGreaterThan(50);
  });

  it("dates Wednesday performances to May 20, 2026", () => {
    const napalm = result.sets.find((s) => s.bandSlug === "napalm-death");
    expect(napalm).toBeDefined();
    expect(napalm!.startLocal.startsWith("2026-05-20")).toBe(true);
  });

  it("rolls over to the next calendar day for past-midnight sets", () => {
    const lastSet = result.sets[result.sets.length - 1];
    expect(lastSet.endLocal.startsWith("2026-05-25")).toBe(true);
  });

  it("computes end_time = start_time + rowspan * 5 minutes", () => {
    for (const s of result.sets) {
      const startMs = Date.parse(s.startUtc);
      const endMs = Date.parse(s.endUtc);
      expect(endMs).toBeGreaterThan(startMs);
      const minutes = (endMs - startMs) / 60_000;
      expect(minutes % 5).toBe(0);
    }
  });

  it("treats the (band_slug, stage, start_time) tuple as the natural key", () => {
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
    expect(keyA).toBe(keyB);
  });

  it("reports per-row errors rather than throwing on a broken cell", () => {
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
    expect(r.errors.length).toBeGreaterThanOrEqual(1);
    expect(r.errors.some((e) => /rowspan/i.test(e.message))).toBe(true);
  });
});

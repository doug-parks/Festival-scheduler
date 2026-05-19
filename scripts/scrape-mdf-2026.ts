/**
 * MDF 2026 scraper — fetches https://deathfests.com/set-times/ and parses
 * bands, stages, and set times into a normalized shape suitable for upsert
 * into public.bands / public.stages / public.sets.
 *
 * Page structure (verified against the live page on 2026-05-18):
 *   - Each day is introduced by an <h2>Weekday<br />Month D, YYYY</h2>.
 *   - Each day has a single <table> containing N stage columns.
 *     - Row 0 = header row with stage names; first cell is empty (time col).
 *     - Row 1 = "Doors" row.
 *     - Subsequent rows = 5-minute time slots. The first <td> has the 24h
 *       time (e.g. "16:30"). Past midnight slots (00:00 onward) belong to
 *       the *following* calendar day; we detect the rollover when the
 *       parsed hour drops back to 0 after being >= 20.
 *     - A band performance is rendered as a <td rowspan="N"> in its stage
 *       column. The cell text is "BandName<br />H:MM-H:MM" (12h informal,
 *       no AM/PM). We take the slot start time from the FIRST timeslot
 *       row the cell spans and compute end_time = start_time + N*5 minutes.
 *
 * The parser is intentionally lenient: any row it can't make sense of is
 * recorded as a ParseError rather than aborting the whole import.
 */

import { load, type CheerioAPI } from "cheerio";
import { fromZonedTime } from "date-fns-tz";

// Local alias for the cheerio-returned wrap type. We keep `any` for the
// table-cell type parameter because cheerio's exported `Cheerio<T>` is
// generic over domhandler's `AnyNode`, which is only a transitive dep
// here. The runtime behaviour we care about is purely string-shaped
// (`.text()`, `.attr()`, `.find()`).
type CheerioWrap = ReturnType<CheerioAPI>;

export const MDF_2026_URL = "https://deathfests.com/set-times/";
export const MDF_2026_TZ = "America/New_York";
export const MDF_2026_SLUG = "mdf-2026";

export type ParsedStage = {
  name: string;
  sortOrder: number;
};

export type ParsedBand = {
  name: string;
  slug: string;
};

export type ParsedSet = {
  bandName: string;
  bandSlug: string;
  stageName: string;
  startUtc: string; // ISO
  endUtc: string; // ISO
  // Local-time fields kept for debugging / display in the result summary.
  startLocal: string; // "YYYY-MM-DD HH:mm" in America/New_York
  endLocal: string;
};

export type ParseError = {
  day?: string;
  stage?: string;
  band?: string;
  rawTime?: string;
  message: string;
};

export type ScrapeResult = {
  bands: ParsedBand[];
  stages: ParsedStage[];
  sets: ParsedSet[];
  errors: ParseError[];
  /**
   * True when fetch+cheerio succeeded but found zero performances. Treated
   * as a signal that the page may be JS-rendered (or that the markup
   * changed in a way the parser doesn't recognize) — the admin UI surfaces
   * this distinctly from a normal "nothing changed" run.
   */
  likelyJsRendered: boolean;
};

const DAY_HEADER_RE = /^([A-Za-z]+)\s*(.*\d{4})\s*$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

/**
 * Stable slug for band names. Lowercase, ASCII-ish, hyphenated. Treats
 * unicode spaces / nbsp / trim variants identically so re-runs don't
 * fork the conflict key.
 */
export function slugifyBand(name: string): string {
  return name
    .normalize("NFKD")
    // Strip combining marks (accents)
    .replace(/[̀-ͯ]/g, "")
    // Collapse all whitespace (incl. nbsp  ) to a single space
    .replace(/[\s ]+/g, " ")
    .trim()
    .toLowerCase()
    // Replace anything not alnum / space with " "
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * Normalize a band name pulled from a cell. Strips signing-session suffixes
 * (the page renders "Band Name | Signing" rows) and collapses whitespace.
 */
export function normalizeBandName(raw: string): { name: string; isSigning: boolean } {
  const collapsed = raw
    .replace(/[\s ]+/g, " ")
    .replace(/&#8217;/g, "’")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .trim();

  // "Band Name | Signing" → ("Band Name", true)
  const signingMatch = collapsed.match(/^(.*?)\s*\|\s*Signing\s*$/i);
  if (signingMatch) {
    return { name: signingMatch[1].trim(), isSigning: true };
  }
  return { name: collapsed, isSigning: false };
}

/**
 * Convert "YYYY-MM-DD HH:mm" interpreted in America/New_York to a UTC
 * instant. Exported for unit testing the timezone path independently
 * of the parser — this is the most fragile part of idempotency.
 */
export function localToUtc(localDateTime: string, tz = MDF_2026_TZ): Date {
  // fromZonedTime treats the input as a wall-clock time in `tz` and
  // returns the corresponding UTC Date.
  return fromZonedTime(localDateTime, tz);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatLocal(date: { year: number; month: number; day: number }, hh: number, mm: number) {
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)} ${pad2(hh)}:${pad2(mm)}`;
}

function addDays(date: { year: number; month: number; day: number }, n: number) {
  // Use UTC arithmetic on a Date so we don't get bitten by local DST on the
  // host running the importer — these are pure calendar-date increments.
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day));
  d.setUTCDate(d.getUTCDate() + n);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function parseHeaderDate(headerText: string): { year: number; month: number; day: number } | null {
  // headerText looks like "Wednesday May 20, 2026" (with whitespace normalized)
  const match = headerText.match(DAY_HEADER_RE);
  if (!match) return null;
  const datePart = match[2].trim();
  const parsed = Date.parse(datePart);
  if (Number.isNaN(parsed)) return null;
  const d = new Date(parsed);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/**
 * Parse the deathfests.com set-times HTML.
 *
 * The parser walks each day's schedule table cell-by-cell. Because the
 * markup uses HTML rowspans to indicate set duration, we maintain a
 * per-stage "rowspan remaining" counter so each timeslot row consumes
 * exactly one <td> per stage (either a new cell or the continuation of
 * a multi-row band cell).
 */
export function parseSetTimes(html: string): ScrapeResult {
  const $ = load(html);
  const bands = new Map<string, ParsedBand>(); // slug -> band
  const stages = new Map<string, ParsedStage>(); // name -> stage
  const sets: ParsedSet[] = [];
  const errors: ParseError[] = [];

  // Build a unified, in-document-order list of (kind, node) entries from
  // <h2> and <table> elements. We walk it linearly to associate each day
  // header with the first matching schedule table that follows it.
  type Entry =
    | { kind: "h2"; text: string; node: unknown }
    | { kind: "table"; node: unknown };
  const entries: Entry[] = [];
  $("h2, table").each((_, el) => {
    if ((el as { name?: string }).name === "h2") {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      entries.push({ kind: "h2", text, node: el });
    } else {
      entries.push({ kind: "table", node: el });
    }
  });

  const isDayHeader = (text: string) =>
    /\d{4}/.test(text) && /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/i.test(text);

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.kind !== "h2" || !isDayHeader(e.text)) continue;
    const dayHeaderText = e.text;
    const dayDate = parseHeaderDate(dayHeaderText);
    if (!dayDate) {
      errors.push({ day: dayHeaderText, message: "Could not parse date header" });
      continue;
    }
    // Find the next schedule table before any subsequent day header.
    let scheduleTableNode: unknown = null;
    for (let j = i + 1; j < entries.length; j++) {
      const next = entries[j];
      if (next.kind === "h2" && isDayHeader(next.text)) break;
      if (next.kind === "table") {
        // The schedule table is the first table with >= 2 columns in row 0
        // (time col + at least 1 stage col). The fixture has a couple of
        // trivial single-column tables that should be skipped.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tbl = $(next.node as any);
        const firstRow = tbl.find("tr").first();
        if (firstRow.find("td").length >= 2) {
          scheduleTableNode = next.node;
          break;
        }
      }
    }
    if (!scheduleTableNode) {
      errors.push({ day: dayHeaderText, message: "No schedule table found" });
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parseDayTable($, $(scheduleTableNode as any), dayDate, dayHeaderText, {
      bands,
      stages,
      sets,
      errors,
    });
  }

  return {
    bands: Array.from(bands.values()),
    stages: Array.from(stages.values()).sort((a, b) => a.sortOrder - b.sortOrder),
    sets,
    errors,
    likelyJsRendered: sets.length === 0,
  };
}

function parseDayTable(
  $: CheerioAPI,
  table: CheerioWrap,
  initialDate: { year: number; month: number; day: number },
  dayHeaderText: string,
  acc: {
    bands: Map<string, ParsedBand>;
    stages: Map<string, ParsedStage>;
    sets: ParsedSet[];
    errors: ParseError[];
  },
) {
  const rows = table.find("tr").toArray();
  if (rows.length < 2) {
    acc.errors.push({ day: dayHeaderText, message: "Day table has <2 rows" });
    return;
  }

  // Row 0: header — first <td> is empty (time col), rest are stage names.
  const headerCells = $(rows[0]).find("td").toArray();
  const stageNames: string[] = [];
  for (let i = 1; i < headerCells.length; i++) {
    const name = $(headerCells[i]).text().replace(/\s+/g, " ").trim();
    if (!name) {
      acc.errors.push({
        day: dayHeaderText,
        message: `Empty stage name in header column ${i}`,
      });
      stageNames.push(""); // placeholder so column index alignment is preserved
      continue;
    }
    stageNames.push(name);
    if (!acc.stages.has(name)) {
      acc.stages.set(name, { name, sortOrder: acc.stages.size });
    }
  }

  // Per-stage rowspan tracker. While > 0, that column's <td> for the
  // current time row is being "consumed" by an earlier band cell and
  // should not appear in the row's cell list.
  const remaining: number[] = stageNames.map(() => 0);

  // Track date rollover past midnight.
  let date = initialDate;
  let lastHour: number | null = null;

  // Iterate time-slot rows (skip header + "Doors" row).
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const cells = $(row).find("td").toArray();
    if (cells.length === 0) continue;

    const firstCellText = $(cells[0]).text().replace(/\s+/g, " ").trim();

    // "Doors" row — first cell text is "Doors" (case-insensitive).
    if (/^doors$/i.test(firstCellText)) {
      continue;
    }

    const timeMatch = firstCellText.match(TIME_RE);
    if (!timeMatch) {
      // Not a time row — skip silently. (Rare; mostly defensive.)
      continue;
    }

    const hh = parseInt(timeMatch[1], 10);
    const mm = parseInt(timeMatch[2], 10);

    // Detect midnight rollover: previous hour was >= 20 (any time in the
    // late evening), current hour is < 6. Advance the date by 1.
    if (lastHour !== null && hh < 6 && lastHour >= 20) {
      date = addDays(date, 1);
    }
    lastHour = hh;

    // Walk the stage columns. The "extra" cells in this row (beyond cells[0])
    // fill the columns where `remaining` is 0; columns where `remaining` is
    // > 0 are being spanned by an earlier band cell and have no <td> in
    // this row.
    let extraIdx = 1; // index into cells[]
    for (let s = 0; s < stageNames.length; s++) {
      if (remaining[s] > 0) {
        remaining[s] -= 1;
        continue;
      }
      if (extraIdx >= cells.length) {
        // Row has fewer cells than expected — likely a parser/markup mismatch.
        // Record once per occurrence and move on.
        acc.errors.push({
          day: dayHeaderText,
          stage: stageNames[s],
          rawTime: firstCellText,
          message: "Row has fewer <td>s than active stages",
        });
        break;
      }
      const cell = cells[extraIdx];
      extraIdx += 1;
      const stageName = stageNames[s];
      const text = $(cell).text().trim();
      if (!text) continue; // empty slot

      const rowspanAttr = $(cell).attr("rowspan");
      const span = rowspanAttr ? parseInt(rowspanAttr, 10) : 1;
      if (Number.isNaN(span) || span < 1) {
        acc.errors.push({
          day: dayHeaderText,
          stage: stageName,
          rawTime: firstCellText,
          message: `Bad rowspan: ${rowspanAttr ?? "(none)"}`,
        });
        continue;
      }
      // Mark this column as consumed for the next (span - 1) rows.
      remaining[s] = span - 1;

      if (!stageName) {
        // Header was unparseable; skip with no further error (already logged).
        continue;
      }

      // First non-empty line of the cell is the band name; further lines
      // (after <br>) are the printed display time and ignored — we use
      // the row's 24h time + rowspan as the authoritative interval.
      const firstLine = text.split(/\r?\n/)[0]?.trim() ?? text;
      const { name } = normalizeBandName(firstLine);
      if (!name) {
        acc.errors.push({
          day: dayHeaderText,
          stage: stageName,
          rawTime: firstCellText,
          message: `Empty band name in cell: "${text.slice(0, 60)}"`,
        });
        continue;
      }

      const slug = slugifyBand(name);
      if (!slug) {
        acc.errors.push({
          day: dayHeaderText,
          stage: stageName,
          band: name,
          rawTime: firstCellText,
          message: "Band name slugifies to empty string",
        });
        continue;
      }

      if (!acc.bands.has(slug)) {
        acc.bands.set(slug, { name, slug });
      }

      const durationMinutes = span * 5;
      const startMinutes = hh * 60 + mm;
      const endMinutes = startMinutes + durationMinutes;
      const endHH = Math.floor(endMinutes / 60);
      const endMM = endMinutes % 60;

      // The set's start belongs to `date`; the end may roll over past
      // midnight, in which case its date is one day later than start.
      const startLocal = formatLocal(date, hh, mm);
      let endDate = date;
      let endHHnorm = endHH;
      if (endHH >= 24) {
        endDate = addDays(date, 1);
        endHHnorm = endHH - 24;
      }
      const endLocal = formatLocal(endDate, endHHnorm, endMM);

      try {
        const startUtc = localToUtc(startLocal).toISOString();
        const endUtc = localToUtc(endLocal).toISOString();
        acc.sets.push({
          bandName: name,
          bandSlug: slug,
          stageName,
          startUtc,
          endUtc,
          startLocal,
          endLocal,
        });
      } catch (err) {
        acc.errors.push({
          day: dayHeaderText,
          stage: stageName,
          band: name,
          rawTime: firstCellText,
          message: `Failed to convert local→UTC: ${(err as Error).message}`,
        });
      }
    }
  }
}

/**
 * Fetch the live deathfests.com set-times page. Separated from the parser
 * so the parser can be unit-tested against a committed HTML fixture.
 */
export async function fetchSetTimesHtml(url = MDF_2026_URL): Promise<string> {
  const res = await fetch(url, {
    // The default Next.js fetch is fine; we want a fresh pull, not the
    // ISR cache, since this is invoked from an admin action.
    cache: "no-store",
    headers: {
      // Some hosts 403 the default Node UA; mimic a desktop browser.
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/**
 * Convenience: fetch + parse. Used by the admin server action.
 */
export async function scrapeMdf2026(url = MDF_2026_URL): Promise<ScrapeResult> {
  const html = await fetchSetTimesHtml(url);
  return parseSetTimes(html);
}

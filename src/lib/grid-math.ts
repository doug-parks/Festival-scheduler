import {
  GRID_DURATION_MIN,
  GRID_START_HOUR,
  MIN_TILE_HEIGHT,
  PX_PER_MIN,
} from "@/lib/constants";

/**
 * Pure helpers for calendar-grid pixel math. PX_PER_MIN comes from
 * src/lib/constants.ts — DO NOT redefine it here.
 */

/**
 * Festival-local "day of" for an instant. Used to bucket sets into day
 * columns when grid start is 10:00 AM — a set at 1:00 AM still belongs to
 * the previous calendar day's festival schedule.
 *
 * Returns a yyyy-mm-dd string in the festival timezone.
 */
export function festivalDayKey(iso: string, timezone: string): string {
  const date = new Date(iso);
  // Shift the instant back by GRID_START_HOUR so anything before the grid
  // start counts as the previous festival day.
  const shifted = new Date(date.getTime() - GRID_START_HOUR * 60 * 60 * 1000);
  // Format in the festival timezone, yyyy-mm-dd.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(shifted);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Minutes from the day's grid start (10:00 AM festival-local) for an instant.
 * Negative values are clamped to 0; sets ending after midnight produce
 * values greater than 24 * 60.
 */
export function minutesFromGridStart(
  iso: string,
  dayKey: string,
  timezone: string,
): number {
  const event = new Date(iso).getTime();
  const gridStart = gridStartMs(dayKey, timezone);
  return Math.round((event - gridStart) / 60000);
}

/**
 * Returns the UTC ms for `dayKey` at GRID_START_HOUR in `timezone`.
 *
 * Implementation note: Intl APIs let us format an instant in a timezone but
 * not the inverse. We bracket the target wall-clock by guessing UTC and
 * iterating: compute the offset that the guess produces, then correct once.
 */
export function gridStartMs(dayKey: string, timezone: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  // First guess: treat the wall-clock as UTC.
  const guess = Date.UTC(y, (m ?? 1) - 1, d ?? 1, GRID_START_HOUR, 0, 0);
  const offset = tzOffsetMin(guess, timezone);
  // Correct by the offset of that guess.
  const corrected = guess - offset * 60_000;
  // Re-check offset at the corrected time (handles DST boundary edge case).
  const offset2 = tzOffsetMin(corrected, timezone);
  if (offset2 !== offset) {
    return guess - offset2 * 60_000;
  }
  return corrected;
}

/** Offset in minutes that `timezone` is *ahead* of UTC at the given instant. */
function tzOffsetMin(utcMs: number, timezone: string): number {
  const date = new Date(utcMs);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - utcMs) / 60_000);
}

/**
 * Top offset (px) for a tile starting at `iso` on `dayKey`. Clamped to 0.
 */
export function tileTop(
  iso: string,
  dayKey: string,
  timezone: string,
  pxPerMin: number = PX_PER_MIN,
): number {
  const min = minutesFromGridStart(iso, dayKey, timezone);
  return Math.max(0, min) * pxPerMin;
}

/**
 * Tile height (px) — never below MIN_TILE_HEIGHT, regardless of duration.
 */
export function tileHeight(
  startIso: string,
  endIso: string,
  pxPerMin: number = PX_PER_MIN,
): number {
  const durationMin = Math.max(
    0,
    Math.round(
      (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000,
    ),
  );
  return Math.max(MIN_TILE_HEIGHT, durationMin * pxPerMin);
}

/** Total grid body height in px for a single day. */
export function gridBodyHeight(pxPerMin: number = PX_PER_MIN): number {
  return GRID_DURATION_MIN * pxPerMin;
}

/**
 * Format a time-column label, e.g. "10 AM", "11:30", "12 PM", "1 AM".
 * Half-hour rows drop the AM/PM for brevity.
 */
export function formatHourLabel(
  minuteOffset: number,
  dayKey: string,
  timezone: string,
): string {
  const ms = gridStartMs(dayKey, timezone) + minuteOffset * 60_000;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(ms));
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const dayPeriod = (
    parts.find((p) => p.type === "dayPeriod")?.value ?? ""
  ).toUpperCase();
  if (minute === "00") return `${hour} ${dayPeriod}`;
  return `${hour}:${minute}`;
}

/**
 * Compact time-range label for a tile, e.g. "8:00–9:00 PM" or
 * "11:30 PM–12:45 AM" when the period crosses.
 */
export function formatTileRange(
  startIso: string,
  endIso: string,
  timezone: string,
): string {
  const startParts = formatHM(startIso, timezone);
  const endParts = formatHM(endIso, timezone);
  if (startParts.period === endParts.period) {
    return `${startParts.compact}–${endParts.compact} ${endParts.period}`;
  }
  return `${startParts.compact} ${startParts.period}–${endParts.compact} ${endParts.period}`;
}

function formatHM(
  iso: string,
  timezone: string,
): { compact: string; period: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(iso));
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const period = (
    parts.find((p) => p.type === "dayPeriod")?.value ?? ""
  ).toUpperCase();
  return { compact: `${hour}:${minute}`, period };
}

/** Generate hour tick offsets (minutes from grid start) for the time column. */
export function hourTickOffsets(): number[] {
  const ticks: number[] = [];
  for (let m = 0; m <= GRID_DURATION_MIN; m += 60) ticks.push(m);
  return ticks;
}

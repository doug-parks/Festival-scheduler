/**
 * Festival-window helpers for the overlap view (issue #7).
 *
 * The festival is fixed America/New_York for MDF 2026. The PM spec calls out
 * that the context-sensitive default filter (during vs outside festival run
 * dates) must be evaluated against the festival timezone — comparing UTC
 * server time directly to `festivals.start_date` would flip the boundary at
 * 19:00–20:00 ET (UTC midnight) instead of at local midnight.
 *
 * The `end_date` is treated as **inclusive** (the last festival day still
 * counts as "during festival") — see PR body for the gap rationale.
 */

type DateLike = string | Date;

function toDate(v: DateLike): Date {
  return v instanceof Date ? v : new Date(v);
}

/**
 * Return the current local-date string ("YYYY-MM-DD") in the festival timezone.
 * Falls back to the server's locale if the runtime can't resolve the tz.
 */
export function nowLocalDate(timezone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) return at.toISOString().slice(0, 10);
  return `${y}-${m}-${d}`;
}

/**
 * True when `at` falls on or between start_date and end_date in the festival
 * timezone (both bounds inclusive).
 */
export function isWithinFestival(
  festival: { start_date: DateLike; end_date: DateLike; timezone: string },
  at: Date = new Date(),
): boolean {
  const today = nowLocalDate(festival.timezone, at);
  const start = nowLocalDate(festival.timezone, toDate(festival.start_date));
  const end = nowLocalDate(festival.timezone, toDate(festival.end_date));
  return today >= start && today <= end;
}

/**
 * UTC timestamps for the start and end of "today" in the festival timezone.
 * Used as the server-side bounds for the "Today" filter so the boundary lands
 * at local midnight, not UTC midnight.
 */
export function todayBoundsUtc(
  timezone: string,
  at: Date = new Date(),
): { since: Date; until: Date } {
  const localDate = nowLocalDate(timezone, at);
  // We don't know the timezone offset from the runtime without a third-party
  // tz library, so approximate by parsing local midnight as if it were UTC,
  // then probing the offset. This is good enough for a fixed-tz festival.
  const probe = new Date(`${localDate}T00:00:00Z`);
  // The probe is UTC midnight of `localDate`. The actual local midnight at
  // `timezone` is offset from that. Compute the offset by formatting the probe
  // in the target tz and reading back the hour.
  const offsetMinutes = tzOffsetMinutes(timezone, probe);
  const since = new Date(probe.getTime() + offsetMinutes * 60_000);
  const until = new Date(since.getTime() + 24 * 60 * 60_000);
  return { since, until };
}

/**
 * Minutes to add to a UTC instant to reach the same wall-clock time at `timezone`.
 * E.g. America/New_York in May is UTC-4, so this returns -240.
 *
 * We invert the sign so callers can do `utcInstant + offset` to land on the
 * local-midnight UTC instant for the *same calendar date*.
 */
function tzOffsetMinutes(timezone: string, at: Date): number {
  // Format the instant in the target tz to extract wall-clock components.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(at).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  // Positive when local is *behind* UTC (e.g. ET in May → wall clock is 4h
  // behind UTC → asUtc < at.getTime() → diff is negative → return negative)
  return -(at.getTime() - asUtc) / 60_000;
}

/**
 * UTC bounds for "Now & next" — `at` to `at + windowHours`.
 * The window is intentionally computed off the server clock for reliability
 * across timezones (PM gap: server-time chosen — see PR body).
 */
export function nowAndNextBounds(
  windowHours = 2,
  at: Date = new Date(),
): { since: Date; until: Date } {
  return {
    since: at,
    until: new Date(at.getTime() + windowHours * 60 * 60_000),
  };
}

export type OverlapFilter = "all" | "today" | "now-next";

export function defaultFilter(args: { withinFestival: boolean }): OverlapFilter {
  // During festival run, default to "today" (most aggressive narrowing).
  // Outside the window, "all" — there's no useful "today" to look at.
  return args.withinFestival ? "today" : "all";
}

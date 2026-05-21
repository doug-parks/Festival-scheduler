/**
 * Calendar grid constants — single source of truth.
 *
 * IMPORTANT: PX_PER_MIN must be defined here and imported everywhere it is
 * needed. Defining it in multiple places causes the "now" line to drift
 * relative to set tiles (see Research § anti-patterns on Notion page for
 * issue #4).
 */

/** Base pixels per minute. A 60-min set at 1× zoom = 120px tall. */
export const PX_PER_MIN = 2;

/** Minimum tile height (px) — Fitts + Apple HIG 44pt tap target. */
export const MIN_TILE_HEIGHT = 44;

/** Stage column width (px) — mobile-first. */
export const STAGE_COL_WIDTH = 120;

/** Left time-label panel width (px). */
export const TIME_COL_WIDTH = 56;

/** Stage header row height (px). */
export const HEADER_HEIGHT = 40;

/**
 * Grid starts at 10:00 AM festival-local time (America/New_York for MDF).
 * Spans 18 hours so cross-midnight sets (e.g. headliner 11:30 PM → 12:45 AM)
 * fit without wraparound. See acceptance criteria: "cross-midnight set
 * returns positive top offset extending past the day's nominal end."
 */
export const GRID_START_HOUR = 10;
export const GRID_DURATION_MIN = 18 * 60;

/**
 * Festival metadata — hardcoded. Fest Planner is a single-festival app for
 * Maryland Deathfest 2026 in Baltimore. Multi-festival generality used to
 * live in the database; it was stripped in the "simplify to MDF only"
 * refactor. To onboard a different festival, edit these constants, replace
 * `tests/fixtures/mdf-2026.html`, and re-run the generator at
 * `scripts/generate-mdf-2026-data.ts`.
 */
export const FESTIVAL = {
  slug: "mdf-2026",
  name: "Maryland Deathfest 2026",
  shortName: "MDF 2026",
  city: "Baltimore",
  state: "MD",
  timezone: "America/New_York",
  start_date: "2026-05-20",
  end_date: "2026-05-24",
} as const;


/** Zoom multipliers applied to PX_PER_MIN. */
export const ZOOM_LEVELS = [1, 2, 3] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];
export const DEFAULT_ZOOM: ZoomLevel = 1;
export const ZOOM_STORAGE_KEY = "fest-planner:calendar-zoom";

export type ViewMode = "day" | "weekend";
export type PickState = "green" | "yellow" | "red";

/**
 * RYG indicator mapping — color + icon (WCAG 1.4.1 — never color alone).
 * The icon characters render as text inside the tile; the accessible name
 * on the button carries the same state for screen readers.
 */
export const PICK_INDICATOR: Record<
  PickState,
  { icon: string; label: string; tileBg: string; tileBorder: string }
> = {
  green: {
    icon: "✓", // ✓
    label: "Going",
    tileBg: "bg-pick-green/20",
    tileBorder: "border-pick-green",
  },
  yellow: {
    icon: "?",
    label: "Maybe",
    tileBg: "bg-pick-yellow/20",
    tileBorder: "border-pick-yellow",
  },
  red: {
    icon: "×", // ×
    label: "Skip",
    tileBg: "bg-pick-red/20",
    tileBorder: "border-pick-red",
  },
};

/** Tile styling when the user has no pick yet. */
export const NO_PICK_TILE_CLASS = "bg-neutral-800 border-neutral-700";

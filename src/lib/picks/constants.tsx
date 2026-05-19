// Single source of truth for the RYG pick state machine.
//
// `PickState` is the public.pick_state enum exactly. `PickValue` adds the
// client-only "none" sentinel — a missing picks row. The cycle order matches
// PRD §6.4: none → green → yellow → red → none.
//
// All UI labels, colors, and icons hang off this file so the calendar tile,
// the bottom-sheet picker, the detail screen, and screen-reader copy stay in
// lockstep.

import type { ReactNode } from "react";

export const PICK_STATES = ["green", "yellow", "red"] as const;

/** Matches the `public.pick_state` Postgres enum exactly. */
export type PickState = (typeof PICK_STATES)[number];

/** Client-only union: a row state, or "none" meaning no row exists. */
export type PickValue = PickState | "none";

export const PICK_LABEL: Record<PickValue, string> = {
  none: "Not picked",
  green: "Going",
  yellow: "Maybe",
  red: "Not going",
};

/** Short past-tense for the undo toast: "Marked [Band] as Going. Undo" */
export const PICK_TOAST_LABEL: Record<PickValue, string> = {
  none: "Cleared pick for",
  green: "Marked Going:",
  yellow: "Marked Maybe:",
  red: "Marked Not going:",
};

/**
 * Cycle reducer — exhaustive over PickValue. A fifth state would fail the
 * compile-time exhaustiveness check (`_exhaustive: never`).
 */
export function cyclePick(current: PickValue): PickValue {
  switch (current) {
    case "none":
      return "green";
    case "green":
      return "yellow";
    case "yellow":
      return "red";
    case "red":
      return "none";
    default: {
      const _exhaustive: never = current;
      return _exhaustive;
    }
  }
}

/**
 * Icons rendered as inline SVG (per UX spec — unicode glyphs render
 * inconsistently across iOS/Android). 12px viewBox; sized via Tailwind.
 */
export const PICK_ICONS: Record<PickState, ReactNode> = {
  green: (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 6.5l2.5 2.5 4.5-5" />
    </svg>
  ),
  yellow: (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4.5a2 2 0 1 1 2.5 2c-.5.2-.5.7-.5 1.2" />
      <circle cx="6" cy="9.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  red: (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3l6 6M9 3l-6 6" />
    </svg>
  ),
};

/**
 * Tailwind tokens for each pick state. `tile*` classes apply to the set tile
 * background + border; `swatch*` apply to inline indicators.
 *
 * Color values resolve to `pick.green` etc. defined in `tailwind.config.ts`.
 * Contrast verified in UX spec: ≥3:1 for non-text on `#0a0a0a` (WCAG 1.4.11).
 */
export const PICK_STYLES: Record<PickValue, { tile: string; swatch: string }> =
  {
    none: {
      tile: "bg-neutral-900 border border-neutral-700 text-neutral-200",
      swatch: "text-neutral-500",
    },
    green: {
      tile: "bg-pick-green/20 border-2 border-pick-green text-white",
      swatch: "text-pick-green",
    },
    yellow: {
      tile: "bg-pick-yellow/20 border-2 border-pick-yellow text-white",
      swatch: "text-pick-yellow",
    },
    red: {
      tile: "bg-pick-red/20 border-2 border-pick-red text-white",
      swatch: "text-pick-red",
    },
  };

/**
 * Returns the `aria-label` for the tile button. Pattern follows UX spec —
 * "[Band], [Stage], [Time]. Currently [State]. Tap to mark as [Next]."
 */
export function pickAriaLabel(opts: {
  bandName: string;
  state: PickValue;
  context?: string;
}): string {
  const next = cyclePick(opts.state);
  const nextVerb =
    next === "none"
      ? "Tap to clear pick."
      : `Tap to mark as ${PICK_LABEL[next]}.`;
  const current =
    opts.state === "none"
      ? "Not picked."
      : `Currently ${PICK_LABEL[opts.state]}.`;
  const ctx = opts.context ? `${opts.context}. ` : "";
  return `${opts.bandName}. ${ctx}${current} ${nextVerb}`;
}

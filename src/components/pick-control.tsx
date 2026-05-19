// One-tap RYG pick control.
//
// Composable as a standalone tile (the calendar grid wraps this around the
// set tile) OR via render-prop `children` for cases where the visual chrome
// is owned by the caller (e.g. the detail screen uses `<PickButtons>` instead).
//
// Responsibilities:
//   - Tap → cycle pick via `cyclePick`. Optimistic `useOptimistic` dispatch.
//   - Long-press → open `<PickerSheet>`. Selecting an option dispatches that
//     state directly (does NOT call cycle).
//   - Optimistic write: `useTransition` + `startTransition` invoke the async
//     `writePick`. On failure: rollback the optimistic state, show error
//     toast, do NOT show undo (you didn't actually change anything).
//   - On success: show 5s undo toast. Undo runs the same optimistic-write
//     path with the prior state.
//   - The `optimisticState` is the source of truth for what's rendered. When
//     the parent feeds a fresher `state` prop (e.g. after a server refetch),
//     the optimistic state resets via the `useOptimistic` base argument.
//
// iOS Safari notes:
//   - `-webkit-touch-callout: none` on the button so iOS doesn't show the
//     share/copy menu when long-pressing.
//   - `select-none` so the long-press doesn't start a text selection.
//   - `onContextMenu` is suppressed to avoid the Android long-press menu.

"use client";

import {
  useCallback,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  cyclePick,
  pickAriaLabel,
  PICK_ICONS,
  PICK_STYLES,
  PICK_TOAST_LABEL,
  type PickValue,
} from "@/lib/picks/constants";
import { writePick } from "@/lib/picks/write";
import { useLongPress } from "@/lib/picks/use-long-press";
import { PickerSheet } from "./picker-sheet";

export type PickControlProps = {
  userId: string;
  setId: string;
  bandName: string;
  /** The server-truth pick state. The component overrides with its optimistic
   * state on tap; if this prop updates (e.g. a parent refetch), the optimistic
   * baseline resets — see `useOptimistic` semantics. */
  state: PickValue;
  /** Optional extra context for the aria-label, e.g. "Mainstage, 9:00 PM". */
  ariaContext?: string;
  /** Optional class override for the tile (calendar grid passes positioning). */
  className?: string;
  /** Optional content rendered inside the tile button (band name / time / etc.). */
  children?: React.ReactNode;
  /** Called whenever an optimistic update is dispatched. Lets the parent
   * record local edits so Realtime echoes don't override them. */
  onOptimisticChange?: (next: PickValue) => void;
};

export function PickControl({
  userId,
  setId,
  bandName,
  state,
  ariaContext,
  className,
  children,
  onOptimisticChange,
}: PickControlProps) {
  const supabase = createClient();
  const [, startTransition] = useTransition();

  // `useOptimistic` base is the server-truth `state`. Each dispatched value
  // overrides until the next render that flushes a new base. The base updates
  // whenever the `state` prop changes (parent refetch or Realtime echo).
  const [optimisticState, setOptimistic] = useOptimistic<PickValue, PickValue>(
    state,
    (_prev, next) => next,
  );

  const [sheetOpen, setSheetOpen] = useState(false);

  // Tracks the most recent intent so rapid taps coalesce correctly: only the
  // last write "wins." `seq` increments on every dispatch; writes whose
  // sequence is no longer current become no-ops on the user-visible state.
  const seqRef = useRef(0);

  const longPress = useLongPress(() => setSheetOpen(true), {
    thresholdMs: 500,
    moveThresholdPx: 10,
  });

  const apply = useCallback(
    (next: PickValue, prior: PickValue, source: "tap" | "explicit") => {
      const mySeq = ++seqRef.current;
      // Optimistic UI must dispatch inside `startTransition` per React 19.
      startTransition(async () => {
        setOptimistic(next);
        onOptimisticChange?.(next);
        try {
          await writePick(supabase, { userId, setId, state: next });
          if (mySeq !== seqRef.current) return; // staler write — newer in flight.

          // Success toast: undo restores `prior` via the same path.
          const verb = PICK_TOAST_LABEL[next];
          toast(`${verb} ${bandName}`, {
            duration: 5000,
            action: {
              label: "Undo",
              onClick: () => apply(prior, next, source),
            },
          });
        } catch (err) {
          if (mySeq !== seqRef.current) return; // a newer write already took over.
          // Rollback: roll back to the prior pre-tap state. No undo toast on
          // failure — we didn't actually do anything to undo.
          setOptimistic(prior);
          onOptimisticChange?.(prior);
          // Log full error to console for debugging; show short message in toast.
          console.error("[pick-control] writePick failed", err);
          const msg =
            (err as { message?: string })?.message ??
            "Couldn't save your pick — check your connection.";
          toast.error(`Couldn't save: ${msg}`, { duration: 5000 });
        }
      });
    },
    [bandName, onOptimisticChange, setId, setOptimistic, supabase, userId],
  );

  const onTap = useCallback(() => {
    if (longPress.consumeClickIfLongPress()) return;
    const prior = optimisticState;
    const next = cyclePick(prior);
    apply(next, prior, "tap");
  }, [apply, longPress, optimisticState]);

  const onSheetSelect = useCallback(
    (next: PickValue) => {
      setSheetOpen(false);
      const prior = optimisticState;
      if (next === prior) return; // no-op; don't trigger an undo toast for nothing.
      apply(next, prior, "explicit");
    },
    [apply, optimisticState],
  );

  const style = PICK_STYLES[optimisticState];

  return (
    <>
      <button
        type="button"
        aria-label={pickAriaLabel({
          bandName,
          state: optimisticState,
          context: ariaContext,
        })}
        onClick={onTap}
        onContextMenu={(e) => e.preventDefault()}
        {...longPress.handlers}
        className={cn(
          "relative flex w-full min-h-[44px] select-none items-stretch rounded-md text-left text-sm transition-colors",
          // Stop iOS Safari from showing the share/copy callout on long-press.
          "[-webkit-touch-callout:none] [-webkit-user-select:none]",
          // Stop double-tap-zoom on iOS — we own the gesture here.
          "touch-manipulation",
          style.tile,
          className,
        )}
      >
        <span className="flex flex-1 flex-col gap-0.5 px-3 py-2">
          {children ?? (
            <span className="font-medium leading-tight">{bandName}</span>
          )}
        </span>
        {optimisticState !== "none" && (
          <span
            aria-hidden
            className={cn(
              "absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/40",
              style.swatch,
            )}
          >
            {PICK_ICONS[optimisticState]}
          </span>
        )}
      </button>
      <PickerSheet
        open={sheetOpen}
        bandName={bandName}
        current={optimisticState}
        onSelect={onSheetSelect}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}

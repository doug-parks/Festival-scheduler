// Explicit Green / Yellow / Red pick buttons for the band/set detail screen.
//
// Same optimistic-write contract as the tile control. Tapping a button that
// matches the current state clears the pick (cycles back to "none"). This is
// the keyboard- and screen-reader-friendly path that doesn't require
// long-press.

"use client";

import { useCallback, useOptimistic, useRef, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  PICK_ICONS,
  PICK_LABEL,
  PICK_STATES,
  PICK_STYLES,
  PICK_TOAST_LABEL,
  type PickState,
  type PickValue,
} from "@/lib/picks/constants";
import { writePick } from "@/lib/picks/write";

export type PickButtonsProps = {
  userId: string;
  setId: string;
  bandName: string;
  state: PickValue;
};

export function PickButtons({ userId, setId, bandName, state }: PickButtonsProps) {
  const supabase = createClient();
  const [, startTransition] = useTransition();
  const [optimisticState, setOptimistic] = useOptimistic<PickValue, PickValue>(
    state,
    (_prev, next) => next,
  );
  const seqRef = useRef(0);

  const apply = useCallback(
    (next: PickValue, prior: PickValue) => {
      const mySeq = ++seqRef.current;
      startTransition(async () => {
        setOptimistic(next);
        try {
          await writePick(supabase, { userId, setId, state: next });
          if (mySeq !== seqRef.current) return;
          const verb = PICK_TOAST_LABEL[next];
          toast(`${verb} ${bandName}`, {
            duration: 5000,
            action: {
              label: "Undo",
              onClick: () => apply(prior, next),
            },
          });
        } catch {
          if (mySeq !== seqRef.current) return;
          setOptimistic(prior);
          toast.error("Couldn't save your pick — check your connection.", {
            duration: 3000,
          });
        }
      });
    },
    [bandName, setId, setOptimistic, supabase, userId],
  );

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {(PICK_STATES as readonly PickState[]).map((opt) => {
        const isActive = optimisticState === opt;
        const style = PICK_STYLES[opt];
        const label = PICK_LABEL[opt];
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={isActive}
            onClick={() => {
              // Tapping the active option clears the pick — UX spec.
              apply(isActive ? "none" : opt, optimisticState);
            }}
            className={cn(
              "flex min-h-[48px] items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors",
              isActive
                ? style.tile
                : "border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800",
            )}
          >
            <span className={cn("inline-flex", isActive ? "" : style.swatch)}>
              {PICK_ICONS[opt]}
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

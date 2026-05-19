// Long-press detector tuned for the iOS Safari grid scroll case.
//
// Acceptance: a press that lasts ≥ thresholdMs without moving more than
// `moveThresholdPx` fires `onLongPress`. Movement, lift, or cancel within
// that window suppresses the long-press. The hook also marks the gesture as
// "handled" so the regular `onClick` can be suppressed on the synthetic
// release event (otherwise iOS fires click + bottom-sheet at the same time).
//
// Why a custom hook: the canonical iOS regression (QA spec §Regression risks)
// is firing the long-press while the user is mid-scroll. Anchoring cancel to
// `onPointerMove > 10px` keeps the grid scrollable.

"use client";

import { useCallback, useRef } from "react";

type Pointer = { x: number; y: number };

export function useLongPress(
  onLongPress: () => void,
  opts?: { thresholdMs?: number; moveThresholdPx?: number },
) {
  const thresholdMs = opts?.thresholdMs ?? 500;
  const moveThresholdPx = opts?.moveThresholdPx ?? 10;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<Pointer | null>(null);
  // True if the press fired a long-press — the subsequent `click` should be
  // suppressed by the consumer.
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      firedRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        onLongPress();
      }, thresholdMs);
    },
    [onLongPress, thresholdMs],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const start = startRef.current;
      if (!start || !timerRef.current) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) > moveThresholdPx) clear();
    },
    [clear, moveThresholdPx],
  );

  const onPointerUp = useCallback(() => clear(), [clear]);
  const onPointerCancel = useCallback(() => clear(), [clear]);

  /** Consumer hooks this into `onClick` to swallow the synthetic click that
   * fires after a long-press release. */
  const consumeClickIfLongPress = useCallback(() => {
    if (firedRef.current) {
      firedRef.current = false;
      return true;
    }
    return false;
  }, []);

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
    consumeClickIfLongPress,
  };
}

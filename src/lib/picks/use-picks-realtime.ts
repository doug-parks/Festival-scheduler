// Realtime subscription to `public.picks` for a single festival, scoped to
// the signed-in user's visibility window (their own + friends' + co-group
// members'). RLS enforces the visibility; this hook just funnels events into
// a throttled handler.
//
// Channel naming: `picks:festival:<festival_id>` — deterministic so unit
// tests can pin it without inspecting internals (per QA spec hand-off note).
//
// Throttling: PRD §6.4 requires ~250ms throttle. We coalesce events by
// (user_id, set_id) — the most recent state wins. The consumer receives a
// flush of all changed picks at the end of each window. This protects against
// re-render storms when the entire crew updates picks in the same minute.
//
// Cleanup: unconditional `removeChannel` on unmount and on festivalId change.
// QA spec calls this out specifically — subscription leaks are silent.

"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { PickState } from "./constants";

export type RealtimePickEvent = {
  setId: string;
  userId: string;
  /** "none" when the row was deleted (pick cleared). */
  state: PickState | "none";
};

type Row = { user_id: string; set_id: string; state: PickState };

export function usePicksRealtime(
  festivalId: string | null | undefined,
  onPicks: (events: RealtimePickEvent[]) => void,
  opts?: { throttleMs?: number },
) {
  const throttleMs = opts?.throttleMs ?? 250;

  // Stash the latest callback in a ref so we don't need it in the effect
  // deps — otherwise consumers must memoize their handler or we leak.
  const onPicksRef = useRef(onPicks);
  useEffect(() => {
    onPicksRef.current = onPicks;
  }, [onPicks]);

  useEffect(() => {
    if (!festivalId) return;

    const supabase = createClient();
    const channelName = `picks:festival:${festivalId}`;

    // Coalesce events in a Map keyed by `${userId}:${setId}` so the freshest
    // state per (user, set) wins inside the throttle window.
    const pending = new Map<string, RealtimePickEvent>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    function schedule() {
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        if (pending.size === 0) return;
        const batch = Array.from(pending.values());
        pending.clear();
        onPicksRef.current(batch);
      }, throttleMs);
    }

    function queue(event: RealtimePickEvent) {
      pending.set(`${event.userId}:${event.setId}`, event);
      schedule();
    }

    // NOTE: postgres_changes filters can't traverse joins (sets → festival),
    // so we subscribe to *all* picks events and let RLS pre-filter the wire.
    // For MVP's single festival (MDF 2026) this is fine; multi-festival users
    // can revisit (PRD §10 — non-goal).
    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "picks" },
        (payload) => {
          const row = payload.new as Row;
          queue({ setId: row.set_id, userId: row.user_id, state: row.state });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "picks" },
        (payload) => {
          const row = payload.new as Row;
          queue({ setId: row.set_id, userId: row.user_id, state: row.state });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "picks" },
        (payload) => {
          const row = payload.old as Partial<Row>;
          if (!row.set_id || !row.user_id) return;
          queue({ setId: row.set_id, userId: row.user_id, state: "none" });
        },
      )
      .subscribe();

    return () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      pending.clear();
      // `removeChannel` performs the unsubscribe + drops the local ref.
      void supabase.removeChannel(channel);
    };
  }, [festivalId, throttleMs]);
}

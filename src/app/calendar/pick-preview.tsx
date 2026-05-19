// Client-side preview list of <PickControl> tiles for the lineup. Renders one
// row per set, wires the Realtime subscription, and tracks the signed-in
// user's own optimistic state plus friends' picks separately.
//
// This is a temporary host for the pick control until issue #4 (calendar
// grid) lands. The grid PR can replace this file with the absolute-positioned
// stage × time layout while reusing the same <PickControl> and
// `usePicksRealtime` hook.

"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { PickControl } from "@/components/pick-control";
import { usePicksRealtime } from "@/lib/picks/use-picks-realtime";
import type { PickValue } from "@/lib/picks/constants";

export type CalendarTile = {
  setId: string;
  bandName: string;
  startTime: string;
  endTime: string;
  stageName: string;
  state: PickValue;
};

export function CalendarPickPreview({
  userId,
  festivalId,
  tiles,
}: {
  userId: string;
  festivalId: string | null;
  tiles: CalendarTile[];
}) {
  // Local copy of *my* picks. Optimistic updates from <PickControl> bubble
  // up via `onOptimisticChange`. Realtime events for OTHER users land in
  // `friendPicks` and never touch this state — that's the architectural
  // invariant that prevents the tile-flash bug.
  const [myPicks, setMyPicks] = useState<Record<string, PickValue>>(() => {
    const init: Record<string, PickValue> = {};
    for (const t of tiles) init[t.setId] = t.state;
    return init;
  });

  // Friend-pick counts per setId — feeds the (placeholder) friend-avatar
  // cluster. Issue #4 wires the real avatar component; for now we render a
  // simple count so the Realtime path is observable on the preview.
  const [friendPicks, setFriendPicks] = useState<
    Record<string, Record<string, PickValue>> // setId → { userId → state }
  >({});

  const handleRealtime = useCallback(
    (events: Parameters<Parameters<typeof usePicksRealtime>[1]>[0]) => {
      setFriendPicks((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const e of events) {
          // Ignore echoes of our own picks — the optimistic state is canonical
          // for the current user, and the server write already settled here.
          if (e.userId === userId) continue;
          const bucket = { ...(next[e.setId] ?? {}) };
          if (e.state === "none") {
            if (!(e.userId in bucket)) continue;
            delete bucket[e.userId];
          } else {
            if (bucket[e.userId] === e.state) continue;
            bucket[e.userId] = e.state;
          }
          next[e.setId] = bucket;
          changed = true;
        }
        return changed ? next : prev;
      });
    },
    [userId],
  );

  usePicksRealtime(festivalId, handleRealtime);

  // Group tiles by day for readable preview.
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarTile[]>();
    for (const t of tiles) {
      const day = new Date(t.startTime).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
      const arr = map.get(day) ?? [];
      arr.push(t);
      map.set(day, arr);
    }
    return Array.from(map.entries());
  }, [tiles]);

  return (
    <div className="space-y-6">
      {grouped.map(([day, dayTiles]) => (
        <section key={day}>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            {day}
          </h2>
          <ul className="space-y-2">
            {dayTiles.map((tile) => {
              const friends = friendPicks[tile.setId];
              const friendCount = friends ? Object.keys(friends).length : 0;
              const start = new Date(tile.startTime).toLocaleTimeString(
                undefined,
                { hour: "numeric", minute: "2-digit" },
              );
              return (
                <li key={tile.setId} className="relative">
                  <PickControl
                    userId={userId}
                    setId={tile.setId}
                    bandName={tile.bandName}
                    state={myPicks[tile.setId] ?? "none"}
                    ariaContext={`${tile.stageName}, ${start}`}
                    onOptimisticChange={(next) =>
                      setMyPicks((prev) => ({ ...prev, [tile.setId]: next }))
                    }
                  >
                    <span className="font-medium leading-tight">
                      {tile.bandName}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {tile.stageName} · {start}
                    </span>
                  </PickControl>
                  {/* Friend avatar cluster placeholder — Realtime updates here
                      MUST NOT cause the tile button to re-render visibly. */}
                  {friendCount > 0 && (
                    <span
                      aria-label={`${friendCount} friend${friendCount === 1 ? "" : "s"} also picked`}
                      className="pointer-events-none absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-neutral-200"
                    >
                      +{friendCount}
                    </span>
                  )}
                  <Link
                    href={`/sets/${tile.setId}`}
                    className="sr-only focus:not-sr-only focus:absolute focus:right-2 focus:top-2 focus:rounded focus:bg-neutral-800 focus:px-2 focus:py-1 focus:text-xs"
                  >
                    See {tile.bandName} details and change pick
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

"use client";

import { STAGE_COL_WIDTH } from "@/lib/constants";
import { formatTileRange, tileHeight, tileTop } from "@/lib/grid-math";
import type { CalendarSet } from "@/lib/types";
import { FriendAvatarCluster } from "@/components/friend-avatar-cluster";
import { PickControl } from "@/components/pick-control";
import type { PickValue } from "@/lib/picks/constants";

type Props = {
  set: CalendarSet;
  stageName: string;
  dayKey: string;
  timezone: string;
  pxPerMin: number;
  /** Tile width including a 4px inset gutter on each side. */
  columnWidth?: number;
  userId: string;
};

export function SetTile({
  set,
  stageName,
  dayKey,
  timezone,
  pxPerMin,
  columnWidth = STAGE_COL_WIDTH,
  userId,
}: Props) {
  const top = tileTop(set.start_time, dayKey, timezone, pxPerMin);
  const height = tileHeight(set.start_time, set.end_time, pxPerMin);
  const range = formatTileRange(set.start_time, set.end_time, timezone);
  const initialState: PickValue = set.my_pick ?? "none";

  return (
    <div
      className="absolute"
      style={{
        top,
        height,
        left: 4,
        width: columnWidth - 8,
      }}
    >
      <PickControl
        userId={userId}
        setId={set.id}
        bandName={set.band.name}
        state={initialState}
        ariaContext={`${stageName}, ${range}`}
        className="h-full"
      >
        <span className="truncate text-xs font-semibold text-neutral-100">
          {set.band.name}
        </span>
        <span className="truncate text-[10px] text-neutral-400">{range}</span>
        {set.friends.length > 0 && (
          <span className="mt-auto pt-0.5">
            <FriendAvatarCluster friends={set.friends} />
          </span>
        )}
      </PickControl>
    </div>
  );
}

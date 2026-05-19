"use client";

import { cn } from "@/lib/utils";
import {
  NO_PICK_TILE_CLASS,
  PICK_INDICATOR,
  STAGE_COL_WIDTH,
} from "@/lib/constants";
import { formatTileRange, tileHeight, tileTop } from "@/lib/grid-math";
import type { CalendarSet } from "@/lib/types";
import { FriendAvatarCluster } from "@/components/friend-avatar-cluster";

type Props = {
  set: CalendarSet;
  stageName: string;
  dayKey: string;
  timezone: string;
  pxPerMin: number;
  /** Tile width including a 4px inset gutter on each side. */
  columnWidth?: number;
};

export function SetTile({
  set,
  stageName,
  dayKey,
  timezone,
  pxPerMin,
  columnWidth = STAGE_COL_WIDTH,
}: Props) {
  const top = tileTop(set.start_time, dayKey, timezone, pxPerMin);
  const height = tileHeight(set.start_time, set.end_time, pxPerMin);
  const range = formatTileRange(set.start_time, set.end_time, timezone);
  const indicator = set.my_pick ? PICK_INDICATOR[set.my_pick] : null;

  const pickLabel = indicator?.label ?? "No pick";
  const ariaLabel = `${set.band.name}, ${stageName}, ${range}, ${pickLabel}`;

  return (
    <button
      type="button"
      // Keep tab order on the filter chips / scroll region — too many tiles
      // to traverse linearly. VoiceOver and arrow-key navigation still
      // reach tiles via the parent scroll region's role="region".
      tabIndex={-1}
      aria-label={ariaLabel}
      className={cn(
        "absolute left-1 right-1 flex flex-col gap-0.5 overflow-hidden rounded border p-1 text-left transition-opacity",
        "motion-safe:transition-[transform,box-shadow] motion-safe:duration-150",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-200",
        indicator
          ? cn(indicator.tileBg, indicator.tileBorder)
          : NO_PICK_TILE_CLASS,
      )}
      style={{
        top,
        height,
        width: columnWidth - 8, // left-1 + right-1 inset
      }}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="truncate text-xs font-semibold text-neutral-100">
          {set.band.name}
        </span>
        {indicator && (
          <span
            aria-hidden="true"
            className="shrink-0 text-[10px] font-bold leading-none text-neutral-100"
          >
            {indicator.icon}
          </span>
        )}
      </div>
      <span className="truncate text-[10px] text-neutral-400">{range}</span>
      {set.friends.length > 0 && (
        <div className="mt-auto pt-0.5">
          <FriendAvatarCluster friends={set.friends} />
        </div>
      )}
    </button>
  );
}

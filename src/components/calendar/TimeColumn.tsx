"use client";

import { forwardRef } from "react";
import { HEADER_HEIGHT, TIME_COL_WIDTH } from "@/lib/constants";
import { formatHourLabel, gridBodyHeight, hourTickOffsets } from "@/lib/grid-math";

type Props = {
  dayKey: string;
  timezone: string;
  pxPerMin: number;
};

/**
 * Left panel of the two-panel sticky layout. The outer container hides
 * overflow; the inner inline content is offset by a CSS variable
 * `--time-shift` that CalendarGrid keeps in sync with the right panel's
 * vertical scroll. Transform-based mirroring avoids browser quirks around
 * setting scrollTop on overflow:hidden elements.
 */
export const TimeColumn = forwardRef<HTMLDivElement, Props>(function TimeColumn(
  { dayKey, timezone, pxPerMin },
  ref,
) {
  const ticks = hourTickOffsets();
  const bodyHeight = gridBodyHeight(pxPerMin);

  return (
    <div
      className="relative flex shrink-0 flex-col border-r border-neutral-800 bg-neutral-950"
      style={{ width: TIME_COL_WIDTH }}
    >
      {/* Header spacer aligns with sticky stage header in the right panel. */}
      <div
        className="shrink-0 border-b border-neutral-800 bg-neutral-950"
        style={{ height: HEADER_HEIGHT }}
        aria-hidden="true"
      />
      <div className="relative grow overflow-hidden" aria-hidden="true">
        <div
          ref={ref}
          className="absolute inset-x-0 top-0 will-change-transform"
          style={{
            height: bodyHeight,
            transform: "translateY(0)",
          }}
        >
          {ticks.map((minuteOffset) => (
            <div
              key={minuteOffset}
              className="absolute right-1 text-[10px] text-neutral-400"
              style={{ top: minuteOffset * pxPerMin - 6 }}
            >
              {formatHourLabel(minuteOffset, dayKey, timezone)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

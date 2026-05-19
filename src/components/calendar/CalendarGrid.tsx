"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_ZOOM,
  GRID_DURATION_MIN,
  HEADER_HEIGHT,
  PX_PER_MIN,
  STAGE_COL_WIDTH,
  TIME_COL_WIDTH,
  ZOOM_LEVELS,
  ZOOM_STORAGE_KEY,
  type ViewMode,
  type ZoomLevel,
} from "@/lib/constants";
import {
  festivalDayKey,
  gridBodyHeight,
  gridStartMs,
  hourTickOffsets,
} from "@/lib/grid-math";
import type { CalendarSet, Festival, Stage } from "@/lib/types";
import { cn } from "@/lib/utils";

import { DaySelector, type DayOption } from "@/components/calendar/DaySelector";
import { SetTile } from "@/components/calendar/SetTile";
import { StageFilterChips } from "@/components/calendar/StageFilterChips";
import { TimeColumn } from "@/components/calendar/TimeColumn";
import { TodayButton } from "@/components/calendar/TodayButton";
import { ViewToggle } from "@/components/calendar/ViewToggle";

type Props = {
  festival: Festival;
  stages: Stage[];
  sets: CalendarSet[];
  /**
   * Map of festival day key (yyyy-mm-dd festival-local) to a friendly label,
   * pre-computed by the server using the festival timezone so SSR and CSR
   * agree without timezone API drift on the client.
   */
  dayOptions: DayOption[];
  /** Initial day key — server-chosen "today if in range, else first day." */
  initialDayKey: string;
  /** True when device clock falls within the festival range. */
  isFestivalLive: boolean;
};

/**
 * Two-panel stage × time grid.
 *
 * Sticky-axis approach (the load-bearing implementation choice for this
 * story): a fixed-width left panel containing only time labels, and a
 * right panel that scrolls in both directions. CSS `position: sticky`
 * inside the right panel keeps the stage header row pinned at the top.
 * The left panel's `scrollTop` is mirrored from the right panel via a
 * passive scroll listener. We deliberately do not attempt to sticky two
 * axes inside a single overflow container — iOS Safari loses the stick
 * on rubber-band overscroll when nested under a flex/grid + overflow
 * parent.
 */
export function CalendarGrid({
  festival,
  stages,
  sets,
  dayOptions,
  initialDayKey,
  isFestivalLive,
}: Props) {
  const [mode, setMode] = useState<ViewMode>("day");
  const [activeDayKey, setActiveDayKey] = useState(initialDayKey);
  const [hiddenStages, setHiddenStages] = useState<Set<string>>(
    () => new Set(),
  );
  const [zoom, setZoom] = useState<ZoomLevel>(DEFAULT_ZOOM);

  // Restore persisted zoom on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(ZOOM_STORAGE_KEY);
    const parsed = Number(raw);
    if (
      Number.isFinite(parsed) &&
      (ZOOM_LEVELS as readonly number[]).includes(parsed)
    ) {
      setZoom(parsed as ZoomLevel);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
  }, [zoom]);

  const pxPerMin = PX_PER_MIN * zoom;

  const visibleStages = useMemo(
    () => stages.filter((s) => !hiddenStages.has(s.id)),
    [stages, hiddenStages],
  );

  // Bucket sets by festival day key + stage for O(1) per-tile lookup.
  const setsByDay = useMemo(() => {
    const map = new Map<string, CalendarSet[]>();
    for (const s of sets) {
      const key = festivalDayKey(s.start_time, festival.timezone);
      const bucket = map.get(key) ?? [];
      bucket.push(s);
      map.set(key, bucket);
    }
    return map;
  }, [sets, festival.timezone]);

  const toggleStage = (stageId: string) => {
    setHiddenStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  };

  // ── Two-panel sync scroll ────────────────────────────────────────────────
  // Right panel is the source of truth for vertical scroll. We mirror its
  // scrollTop to the left panel's interior on each scroll event (passive).
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const timeBodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const right = rightPanelRef.current;
    const time = timeBodyRef.current;
    if (!right || !time) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      // Transform-mirror the time labels by negating the right panel's
      // vertical scroll. Cheap, GPU-accelerated, and works on iOS Safari
      // where setting scrollTop on overflow:hidden is unreliable.
      time.style.transform = `translateY(${-right.scrollTop}px)`;
    };
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(apply);
    };
    right.addEventListener("scroll", onScroll, { passive: true });
    apply();
    return () => {
      right.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [mode, activeDayKey, zoom, visibleStages.length]);

  // ── Today / Now line ────────────────────────────────────────────────────
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    if (!isFestivalLive) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [isFestivalLive]);

  const scrollToNow = () => {
    const right = rightPanelRef.current;
    if (!right) return;
    const dayKey = isFestivalLive
      ? festivalDayKey(new Date().toISOString(), festival.timezone)
      : activeDayKey;
    if (mode === "day" && dayKey !== activeDayKey) {
      setActiveDayKey(dayKey);
    }
    const start = gridStartMs(dayKey, festival.timezone);
    const minutesIn = Math.max(0, (Date.now() - start) / 60_000);
    const offsetPx = Math.min(
      minutesIn * pxPerMin,
      gridBodyHeight(pxPerMin),
    );
    // Center the now line ~1/3 from the top of the visible viewport.
    const target = Math.max(0, offsetPx - right.clientHeight / 3);
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    right.scrollTo({
      top: target,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  };

  // ── Render branches ─────────────────────────────────────────────────────
  if (stages.length === 0 || sets.length === 0) {
    return <EmptyState mode={mode} setMode={setMode} festival={festival} />;
  }

  const dayKeysToRender =
    mode === "day" ? [activeDayKey] : dayOptions.map((d) => d.key);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 bg-neutral-950 px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-neutral-100">
            {festival.name}
          </h1>
          <ViewToggle mode={mode} onChange={setMode} />
        </div>
        <div className="hidden items-center gap-1 md:flex" aria-label="Zoom">
          {ZOOM_LEVELS.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              aria-pressed={zoom === z}
              aria-label={`Zoom ${z} times`}
              className={cn(
                "rounded border px-2 py-0.5 text-xs",
                zoom === z
                  ? "border-neutral-200 bg-neutral-200 text-black"
                  : "border-neutral-700 text-neutral-300 hover:bg-neutral-800",
              )}
            >
              {z}×
            </button>
          ))}
        </div>
      </div>
      {mode === "day" && (
        <DaySelector
          days={dayOptions}
          activeKey={activeDayKey}
          onSelect={setActiveDayKey}
        />
      )}
      <StageFilterChips
        stages={stages}
        hidden={hiddenStages}
        onToggle={toggleStage}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <TimeColumn
          ref={timeBodyRef}
          dayKey={mode === "day" ? activeDayKey : dayOptions[0]?.key ?? activeDayKey}
          timezone={festival.timezone}
          pxPerMin={pxPerMin}
        />
        <div
          ref={rightPanelRef}
          tabIndex={0}
          role="region"
          aria-label="Festival lineup grid"
          className="relative grow overflow-auto overscroll-contain focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-neutral-200"
        >
          {visibleStages.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-400">
              All stages hidden. Tap a chip above to show one.
            </div>
          ) : (
            <GridBody
              dayKeysToRender={dayKeysToRender}
              dayOptions={dayOptions}
              visibleStages={visibleStages}
              setsByDay={setsByDay}
              timezone={festival.timezone}
              pxPerMin={pxPerMin}
              nowMs={nowMs}
              mode={mode}
            />
          )}
        </div>
      </div>

      {isFestivalLive && <TodayButton onClick={scrollToNow} />}
    </div>
  );
}

// ── Grid body ──────────────────────────────────────────────────────────────

function GridBody({
  dayKeysToRender,
  dayOptions,
  visibleStages,
  setsByDay,
  timezone,
  pxPerMin,
  nowMs,
  mode,
}: {
  dayKeysToRender: string[];
  dayOptions: DayOption[];
  visibleStages: Stage[];
  setsByDay: Map<string, CalendarSet[]>;
  timezone: string;
  pxPerMin: number;
  nowMs: number | null;
  mode: ViewMode;
}) {
  const ticks = hourTickOffsets();
  const bodyHeight = gridBodyHeight(pxPerMin);
  const totalWidth = visibleStages.length * STAGE_COL_WIDTH;
  const dayLabelByKey = new Map(dayOptions.map((d) => [d.key, d.label]));

  return (
    <div style={{ width: totalWidth }}>
      {/* Sticky stage header row */}
      <div
        className="sticky top-0 z-20 flex border-b border-neutral-800 bg-neutral-950"
        style={{ height: HEADER_HEIGHT }}
      >
        {visibleStages.map((stage) => (
          <div
            key={stage.id}
            className="flex shrink-0 items-center border-r border-neutral-800 px-2 text-xs font-semibold uppercase tracking-wide text-neutral-200"
            style={{ width: STAGE_COL_WIDTH }}
            title={stage.name}
          >
            <span className="truncate">{stage.name}</span>
          </div>
        ))}
      </div>

      {/* Per-day grid body — each day renders its own scrollable strip. */}
      {dayKeysToRender.map((dayKey, idx) => {
        const setsForDay = setsByDay.get(dayKey) ?? [];
        return (
          <div key={dayKey}>
            {mode === "weekend" && (
              <div
                className="sticky z-10 border-b border-neutral-800 bg-neutral-900/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-300 backdrop-blur"
                style={{ top: HEADER_HEIGHT }}
              >
                {dayLabelByKey.get(dayKey) ?? dayKey}
              </div>
            )}
            <div
              className="relative"
              style={{ height: bodyHeight, width: totalWidth }}
            >
              {/* Hour grid lines */}
              {ticks.map((minuteOffset) => (
                <div
                  key={minuteOffset}
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-x-0 border-t",
                    minuteOffset % 60 === 0
                      ? "border-neutral-800"
                      : "border-neutral-900",
                  )}
                  style={{ top: minuteOffset * pxPerMin }}
                />
              ))}

              {/* Stage column dividers */}
              {visibleStages.map((stage, colIdx) => (
                <div
                  key={stage.id}
                  aria-hidden="true"
                  className="absolute top-0 bottom-0 border-r border-neutral-800/60"
                  style={{
                    left: colIdx * STAGE_COL_WIDTH,
                    width: STAGE_COL_WIDTH,
                  }}
                />
              ))}

              {/* Set tiles, per column */}
              {visibleStages.map((stage, colIdx) => {
                const stageSets = setsForDay.filter(
                  (s) => s.stage_id === stage.id,
                );
                return (
                  <div
                    key={stage.id}
                    className="absolute top-0 bottom-0"
                    style={{
                      left: colIdx * STAGE_COL_WIDTH,
                      width: STAGE_COL_WIDTH,
                    }}
                  >
                    {stageSets.map((s) => (
                      <SetTile
                        key={s.id}
                        set={s}
                        stageName={stage.name}
                        dayKey={dayKey}
                        timezone={timezone}
                        pxPerMin={pxPerMin}
                      />
                    ))}
                  </div>
                );
              })}

              {/* Now line — only for the festival-local today's bucket */}
              {nowMs !== null &&
                festivalDayKey(new Date(nowMs).toISOString(), timezone) ===
                  dayKey && (
                  <NowLine
                    nowMs={nowMs}
                    dayKey={dayKey}
                    timezone={timezone}
                    pxPerMin={pxPerMin}
                  />
                )}
            </div>
            {idx < dayKeysToRender.length - 1 && (
              <div
                className="border-t border-neutral-700"
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function NowLine({
  nowMs,
  dayKey,
  timezone,
  pxPerMin,
}: {
  nowMs: number;
  dayKey: string;
  timezone: string;
  pxPerMin: number;
}) {
  const start = gridStartMs(dayKey, timezone);
  const minutesIn = (nowMs - start) / 60_000;
  if (minutesIn < 0 || minutesIn > GRID_DURATION_MIN) return null;
  return (
    <div
      role="separator"
      aria-label="Current time"
      className="pointer-events-none absolute inset-x-0 z-10 h-px bg-neutral-400/80 shadow-[0_0_4px_rgba(255,255,255,0.4)]"
      style={{ top: minutesIn * pxPerMin }}
    />
  );
}

// ── Empty state ───────────────────────────────────────────────────────────

function EmptyState({
  mode,
  setMode,
  festival,
}: {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  festival: Festival;
}) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-2">
        <h1 className="text-sm font-semibold text-neutral-100">
          {festival?.name ?? "Lineup"}
        </h1>
        <ViewToggle mode={mode} onChange={setMode} />
      </div>
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <div>
          <p className="text-base font-medium text-neutral-200">
            No lineup yet
          </p>
          <p className="mt-2 text-sm text-neutral-400">
            Check back soon — the {festival?.name ?? "festival"} lineup is on
            its way.
          </p>
        </div>
      </div>
    </div>
  );
}

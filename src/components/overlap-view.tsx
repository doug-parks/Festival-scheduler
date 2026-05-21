"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { FriendAvatarCluster } from "@/components/friend-avatar-cluster";
import { PickControl } from "@/components/pick-control";
import { type PickState } from "@/lib/picks/constants";
import type { FriendOnSet } from "@/lib/types";
import type { OverlapFilter } from "@/lib/festival";
import { cn } from "@/lib/utils";

export type OverlapRow = {
  set_id: string;
  band_name: string;
  stage_name: string;
  stage_color: string | null;
  start_time: string; // ISO
  end_time: string; // ISO
  overlap_count: number;
  friend_ids: string[];
  friend_names: string[];
  friend_avatars: (string | null)[];
  self_state: PickState;
};

export type OverlapViewProps = {
  initialRows: Record<OverlapFilter, OverlapRow[]>;
  initialFilter: OverlapFilter;
  festivalTimezone: string;
  nowAndNextWindowHours: number;
  userId: string;
};

const CHIPS: { id: OverlapFilter; label: string; aria: string }[] = [
  { id: "all", label: "All", aria: "All friends, all days" },
  { id: "today", label: "Today", aria: "Sets on today's date" },
  {
    id: "now-next",
    label: "Now & next",
    aria: "Sets in the next 2 hours",
  },
];

export function OverlapView(props: OverlapViewProps) {
  const [filter, setFilter] = useState<OverlapFilter>(props.initialFilter);
  const [rowsByFilter, setRowsByFilter] = useState(props.initialRows);
  const [pending, startTransition] = useTransition();
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rows = rowsByFilter[filter] ?? [];

  // aria-live count announcement on filter change.
  const announcement = useMemo(() => {
    const chip = CHIPS.find((c) => c.id === filter)?.label ?? filter;
    if (rows.length === 0) {
      return `${chip} filter: no overlapping sets.`;
    }
    return `${chip} filter: showing ${rows.length} set${
      rows.length === 1 ? "" : "s"
    } with 2 or more friend overlaps.`;
  }, [filter, rows.length]);

  // Realtime: re-fetch the active filter when a friend updates a pick.
  // PM gap: "debounce window unspecified, default 500ms" — documented in PR body.
  useEffect(() => {
    let cancelled = false;

    // Local import to avoid pulling supabase-js into the server bundle.
    let subscription: { unsubscribe: () => void } | null = null;
    (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const channel = supabase
        .channel("overlap-picks")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "picks" },
          () => {
            if (cancelled) return;
            if (refetchTimer.current) clearTimeout(refetchTimer.current);
            refetchTimer.current = setTimeout(() => {
              refetchActive();
            }, 500);
          },
        )
        .subscribe();
      subscription = {
        unsubscribe: () => {
          supabase.removeChannel(channel);
        },
      };
    })();

    return () => {
      cancelled = true;
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      subscription?.unsubscribe();
    };
    // refetchActive is stable in this scope; we intentionally don't re-subscribe
    // on filter change because the channel covers all filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refetchActive() {
    startTransition(async () => {
      try {
        const res = await fetch(`/overlap/api?filter=${filter}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const fresh = (await res.json()) as OverlapRow[];
        setRowsByFilter((prev) => ({ ...prev, [filter]: fresh }));
      } catch {
        // swallow — next pick event will retry
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Overlap</h1>
        <p className="text-xs text-neutral-500">
          Sorted by friend overlap, then time.
        </p>
      </header>

      <FilterChips value={filter} onChange={setFilter} />

      <p
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        // key forces SR re-read on filter change even if text is similar
        key={`${filter}-${rows.length}`}
      >
        {announcement}
      </p>

      <p className="mt-3 text-xs text-neutral-400">
        {pending ? "Updating…" : announcement}
      </p>

      {rows.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <ul role="list" className="mt-4 space-y-2">
          {rows.map((r) => (
            <OverlapRowItem
              key={r.set_id}
              row={r}
              timezone={props.festivalTimezone}
              userId={props.userId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChips({
  value,
  onChange,
}: {
  value: OverlapFilter;
  onChange: (next: OverlapFilter) => void;
}) {
  // Keyboard nav: arrow keys move the active chip (radiogroup contract).
  const order = CHIPS.map((c) => c.id);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = order.indexOf(value);
    if (i < 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(order[(i + 1) % order.length]);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(order[(i - 1 + order.length) % order.length]);
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(order[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(order[order.length - 1]);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Overlap filter"
      onKeyDown={onKeyDown}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
    >
      {CHIPS.map((chip) => {
        const active = chip.id === value;
        return (
          <button
            key={chip.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={chip.aria}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(chip.id)}
            className={cn(
              "inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
              active
                ? "border-white bg-white text-neutral-950"
                : "border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-neutral-500",
            )}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

function OverlapRowItem({
  row,
  timezone,
  userId,
}: {
  row: OverlapRow;
  timezone: string;
  userId: string;
}) {
  const friends: FriendOnSet[] = row.friend_ids.map((id, i) => ({
    user_id: id,
    display_name: row.friend_names[i] ?? "Friend",
    avatar_url: row.friend_avatars[i] ?? null,
    state: "green",
  }));

  const timeLabel = formatRangeInTz(row.start_time, row.end_time, timezone);

  return (
    <li
      role="listitem"
      className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: row.stage_color ?? "#525252" }}
            aria-hidden
          />
          <p className="truncate text-sm font-semibold">{row.band_name}</p>
        </div>
        <p className="mt-0.5 text-xs text-neutral-400">
          <span className="text-neutral-300">{row.stage_name}</span>
          <span className="mx-1.5 text-neutral-600">·</span>
          <span>{timeLabel}</span>
        </p>
        <div className="mt-2 flex items-center gap-2">
          <FriendAvatarCluster friends={friends} size={24} />
          <span className="text-xs text-neutral-400">
            {row.overlap_count} friend
            {row.overlap_count === 1 ? "" : "s"} going
          </span>
        </div>
      </div>
      <PickControl
        userId={userId}
        setId={row.set_id}
        bandName={row.band_name}
        state={row.self_state ?? "none"}
        ariaContext={`${row.stage_name}, ${timeLabel}`}
      />
    </li>
  );
}

function EmptyState({ filter }: { filter: OverlapFilter }) {
  const copy =
    filter === "now-next"
      ? "Nothing in the next 2 hours yet."
      : filter === "today"
        ? "No friend overlap for today."
        : "No overlapping picks yet — invite friends to start seeing overlaps.";

  return (
    <div className="mt-6 rounded-lg border border-dashed border-neutral-700 bg-neutral-900/40 p-6 text-center">
      <p className="text-sm text-neutral-300">{copy}</p>
      <Link
        href="/friends"
        className="mt-3 inline-block rounded-full bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
      >
        Invite your crew
      </Link>
    </div>
  );
}

function formatRangeInTz(
  startIso: string,
  endIso: string,
  timezone: string,
): string {
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    const startStr = fmt.format(start);
    const endFmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    });
    return `${startStr} – ${endFmt.format(end)}`;
  } catch {
    return `${startIso} – ${endIso}`;
  }
}

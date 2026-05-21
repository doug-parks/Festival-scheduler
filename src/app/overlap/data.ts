import type { createClient } from "@/lib/supabase/server";
import {
  nowAndNextBounds,
  todayBoundsUtc,
  type OverlapFilter,
} from "@/lib/festival";
import type { OverlapRow } from "@/components/overlap-view";
import { FESTIVAL } from "@/lib/constants";

export const NOW_AND_NEXT_HOURS = 2;

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/**
 * Hardcoded festival metadata so callers don't need to thread it through.
 * Mirrors the `Festival` shape the overlap view used to receive from the
 * (now-dropped) festivals table.
 */
export const FESTIVAL_META = {
  id: FESTIVAL.slug,
  name: FESTIVAL.name,
  timezone: FESTIVAL.timezone,
  start_date: FESTIVAL.start_date,
  end_date: FESTIVAL.end_date,
};

export async function fetchOverlapRows(
  supabase: SupabaseServer,
  args: {
    filter: OverlapFilter;
    timezone: string;
  },
): Promise<OverlapRow[]> {
  const bounds = boundsForFilter(args.filter, args.timezone);

  const { data, error } = await supabase.rpc("get_overlap_sets", {
    p_since: bounds.since?.toISOString() ?? null,
    p_until: bounds.until?.toISOString() ?? null,
    p_min_overlap: 2,
  });
  if (error || !data) return [];
  return data as OverlapRow[];
}

export async function fetchAllFilters(
  supabase: SupabaseServer,
  args: { timezone: string },
): Promise<Record<OverlapFilter, OverlapRow[]>> {
  const [all, today, nowNext] = await Promise.all([
    fetchOverlapRows(supabase, { ...args, filter: "all" }),
    fetchOverlapRows(supabase, { ...args, filter: "today" }),
    fetchOverlapRows(supabase, { ...args, filter: "now-next" }),
  ]);
  return { all, today, "now-next": nowNext };
}

function boundsForFilter(
  filter: OverlapFilter,
  timezone: string,
): { since: Date | null; until: Date | null } {
  if (filter === "today") return todayBoundsUtc(timezone);
  if (filter === "now-next") return nowAndNextBounds(NOW_AND_NEXT_HOURS);
  return { since: null, until: null };
}

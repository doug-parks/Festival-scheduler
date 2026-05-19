import type { createClient } from "@/lib/supabase/server";
import { nowAndNextBounds, todayBoundsUtc, type OverlapFilter } from "@/lib/festival";
import type { OverlapRow } from "@/components/overlap-view";

export const NOW_AND_NEXT_HOURS = 2;

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

export type FestivalRow = {
  id: string;
  name: string;
  timezone: string;
  start_date: string;
  end_date: string;
};

/**
 * Pick the festival to scope the overlap view to.
 * Strategy: today's-within-bounds first, then soonest upcoming, then most-recent past.
 * The MVP only has one festival (MDF 2026); this is for future-proofing.
 */
export async function pickActiveFestival(
  supabase: SupabaseServer,
): Promise<FestivalRow | null> {
  const today = new Date().toISOString().slice(0, 10);

  const current = await supabase
    .from("festivals")
    .select("id, name, timezone, start_date, end_date")
    .lte("start_date", today)
    .gte("end_date", today)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (current.data) return current.data as FestivalRow;

  const upcoming = await supabase
    .from("festivals")
    .select("id, name, timezone, start_date, end_date")
    .gt("start_date", today)
    .order("start_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (upcoming.data) return upcoming.data as FestivalRow;

  const past = await supabase
    .from("festivals")
    .select("id, name, timezone, start_date, end_date")
    .lt("end_date", today)
    .order("end_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (past.data as FestivalRow | null) ?? null;
}

/**
 * Returns the caller's group_id for this festival, if any. Used to scope the
 * "This crew" filter and to drive the context-sensitive default.
 */
export async function getPrimaryGroupId(
  supabase: SupabaseServer,
  userId: string,
  festivalId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("festival_group_memberships")
    .select("group_id, festival_groups!inner(festival_id)")
    .eq("user_id", userId);

  const match = (data ?? []).find(
    (m: { festival_groups: unknown }) => {
      const fg = Array.isArray(m.festival_groups)
        ? m.festival_groups[0]
        : (m.festival_groups as { festival_id: string } | undefined);
      return fg?.festival_id === festivalId;
    },
  ) as { group_id: string } | undefined;

  return match?.group_id ?? null;
}

export async function fetchOverlapRows(
  supabase: SupabaseServer,
  args: {
    festivalId: string;
    filter: OverlapFilter;
    groupId: string | null;
    timezone: string;
  },
): Promise<OverlapRow[]> {
  const bounds = boundsForFilter(args.filter, args.timezone);
  const useGroup = args.filter === "crew" && !!args.groupId;

  const { data, error } = await supabase.rpc("get_overlap_sets", {
    p_festival_id: args.festivalId,
    p_group_id: useGroup ? args.groupId : null,
    p_since: bounds.since?.toISOString() ?? null,
    p_until: bounds.until?.toISOString() ?? null,
    p_min_overlap: 2,
  });
  if (error || !data) return [];
  return data as OverlapRow[];
}

export async function fetchAllFilters(
  supabase: SupabaseServer,
  args: { festivalId: string; groupId: string | null; timezone: string },
): Promise<Record<OverlapFilter, OverlapRow[]>> {
  const [all, crew, today, nowNext] = await Promise.all([
    fetchOverlapRows(supabase, { ...args, filter: "all" }),
    fetchOverlapRows(supabase, { ...args, filter: "crew" }),
    fetchOverlapRows(supabase, { ...args, filter: "today" }),
    fetchOverlapRows(supabase, { ...args, filter: "now-next" }),
  ]);
  return { all, crew, today, "now-next": nowNext };
}

function boundsForFilter(
  filter: OverlapFilter,
  timezone: string,
): { since: Date | null; until: Date | null } {
  if (filter === "today") return todayBoundsUtc(timezone);
  if (filter === "now-next") return nowAndNextBounds(NOW_AND_NEXT_HOURS);
  return { since: null, until: null };
}

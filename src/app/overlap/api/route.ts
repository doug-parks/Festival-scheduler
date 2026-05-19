import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchOverlapRows,
  getPrimaryGroupId,
  pickActiveFestival,
} from "@/app/overlap/data";
import type { OverlapFilter } from "@/lib/festival";

const FILTERS = ["all", "crew", "today", "now-next"] as const;

/**
 * GET /overlap/api?filter=all|crew|today|now-next
 *
 * Re-fetch endpoint for the Realtime subscription on the overlap view. The
 * subscription debounces incoming pick events (~500ms) and calls this route to
 * refresh just the active filter's rows. RLS + `security invoker` on the RPC
 * mean we never trust the caller's user id — we re-derive it server side.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json([], { status: 401 });

  const rawFilter = req.nextUrl.searchParams.get("filter") ?? "all";
  const filter: OverlapFilter = (
    FILTERS.includes(rawFilter as OverlapFilter) ? rawFilter : "all"
  ) as OverlapFilter;

  const festival = await pickActiveFestival(supabase);
  if (!festival) return NextResponse.json([]);

  const groupId = await getPrimaryGroupId(supabase, user.id, festival.id);

  const rows = await fetchOverlapRows(supabase, {
    festivalId: festival.id,
    filter,
    groupId,
    timezone: festival.timezone,
  });

  return NextResponse.json(rows, {
    headers: { "Cache-Control": "no-store" },
  });
}

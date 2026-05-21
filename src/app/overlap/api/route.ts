import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FESTIVAL_META, fetchOverlapRows } from "@/app/overlap/data";
import type { OverlapFilter } from "@/lib/festival";

const FILTERS = ["all", "today", "now-next"] as const;

/**
 * GET /overlap/api?filter=all|today|now-next
 *
 * Re-fetch endpoint for the Realtime subscription on the overlap view.
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

  const rows = await fetchOverlapRows(supabase, {
    filter,
    timezone: FESTIVAL_META.timezone,
  });

  return NextResponse.json(rows, {
    headers: { "Cache-Control": "no-store" },
  });
}

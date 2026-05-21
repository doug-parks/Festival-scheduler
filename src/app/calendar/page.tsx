import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CalendarEmpty } from "@/components/calendar/CalendarEmpty";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import type { DayOption } from "@/components/calendar/DaySelector";
import { FESTIVAL } from "@/lib/constants";
import { festivalDayKey } from "@/lib/grid-math";
import { createClient } from "@/lib/supabase/server";
import type {
  CalendarSet,
  Festival,
  FriendOnSet,
  Stage,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "MDF 2026 lineup",
};

type StageRow = {
  id: string;
  name: string;
  sort_order: number;
  display_color: string | null;
};

type BandRow = {
  id: string;
  name: string;
};

type SetRow = {
  id: string;
  band_id: string;
  stage_id: string;
  start_time: string;
  end_time: string;
  bands: BandRow | BandRow[] | null;
};

type PickRow = {
  user_id: string;
  set_id: string;
  state: "green" | "yellow" | "red";
};

type UserRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

// Hardcoded festival — see src/lib/constants.ts. The festivals table was
// dropped in 0008_simplify_to_mdf2026.sql; nothing reads from it anymore.
const FESTIVAL_OBJ: Festival = {
  id: FESTIVAL.slug,
  slug: FESTIVAL.slug,
  name: FESTIVAL.name,
  timezone: FESTIVAL.timezone,
  start_date: FESTIVAL.start_date,
  end_date: FESTIVAL.end_date,
};

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const isAdmin =
    !!process.env.NEXT_PUBLIC_ADMIN_EMAIL &&
    user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  // 1) Stages (single festival; the festival_id column was dropped).
  const { data: stageRows } = await supabase
    .from("stages")
    .select("id, name, sort_order, display_color")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .returns<StageRow[]>();

  const stages: Stage[] = (stageRows ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    sort_order: s.sort_order,
    display_color: s.display_color,
  }));

  // 2) Sets + bands.
  const stageIds = stages.map((s) => s.id);
  let sets: CalendarSet[] = [];

  if (stageIds.length > 0) {
    const { data: setRows } = await supabase
      .from("sets")
      .select("id, band_id, stage_id, start_time, end_time, bands(id, name)")
      .in("stage_id", stageIds)
      .order("start_time", { ascending: true })
      .returns<SetRow[]>();

    const rows = setRows ?? [];

    // 3) Picks visible to me (RLS gates this via can_see_user).
    const setIds = rows.map((r) => r.id);
    let picks: PickRow[] = [];
    let friendUsers: UserRow[] = [];
    if (setIds.length > 0) {
      const { data: pickRows } = await supabase
        .from("picks")
        .select("user_id, set_id, state")
        .in("set_id", setIds)
        .returns<PickRow[]>();
      picks = pickRows ?? [];

      const otherUserIds = Array.from(
        new Set(picks.map((p) => p.user_id).filter((id) => id !== user.id)),
      );
      if (otherUserIds.length > 0) {
        const { data: userRows } = await supabase
          .from("users")
          .select("id, display_name, avatar_url")
          .in("id", otherUserIds)
          .returns<UserRow[]>();
        friendUsers = userRows ?? [];
      }
    }

    const friendsById = new Map(friendUsers.map((u) => [u.id, u]));
    const myPickBySet = new Map<string, "green" | "yellow" | "red">();
    const friendsBySet = new Map<string, FriendOnSet[]>();

    for (const p of picks) {
      if (p.user_id === user.id) {
        myPickBySet.set(p.set_id, p.state);
      } else {
        const friend = friendsById.get(p.user_id);
        if (!friend) continue;
        const bucket = friendsBySet.get(p.set_id) ?? [];
        bucket.push({
          user_id: friend.id,
          display_name: friend.display_name,
          avatar_url: friend.avatar_url,
          state: p.state,
        });
        friendsBySet.set(p.set_id, bucket);
      }
    }

    sets = rows.map((r) => {
      const band: BandRow = Array.isArray(r.bands)
        ? r.bands[0] ?? { id: r.band_id, name: "Unknown band" }
        : r.bands ?? { id: r.band_id, name: "Unknown band" };
      return {
        id: r.id,
        band: { id: band.id, name: band.name },
        stage_id: r.stage_id,
        start_time: r.start_time,
        end_time: r.end_time,
        my_pick: myPickBySet.get(r.id) ?? null,
        friends: friendsBySet.get(r.id) ?? [],
      };
    });
  }

  // 4) Day options — derived from the hardcoded festival dates.
  const dayOptions = buildDayOptions(FESTIVAL_OBJ);

  // 5) Initial day: today if device clock is within range, else first day.
  const nowKey = festivalDayKey(new Date().toISOString(), FESTIVAL_OBJ.timezone);
  const isFestivalLive = dayOptions.some((d) => d.key === nowKey);
  const initialDayKey =
    dayOptions.find((d) => d.key === nowKey)?.key ?? dayOptions[0]?.key ?? "";

  if (dayOptions.length === 0 || stages.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
        <CalendarEmpty isAdmin={isAdmin} />
      </div>
    );
  }

  return (
    <CalendarGrid
      festival={FESTIVAL_OBJ}
      stages={stages}
      sets={sets}
      dayOptions={dayOptions}
      initialDayKey={initialDayKey}
      isFestivalLive={isFestivalLive}
      userId={user.id}
    />
  );
}

/**
 * Build day picker options from festival start/end dates in the festival
 * timezone. Both server and client read the same string keys to avoid SSR
 * hydration drift.
 */
function buildDayOptions(festival: Festival): DayOption[] {
  const out: DayOption[] = [];
  const [sy, sm, sd] = festival.start_date.split("-").map(Number);
  const [ey, em, ed] = festival.end_date.split("-").map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return out;

  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));

  const shortFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: festival.timezone,
    weekday: "short",
  });
  const longFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: festival.timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  for (
    let cursor = start.getTime();
    cursor <= end.getTime();
    cursor += 24 * 60 * 60 * 1000
  ) {
    const d = new Date(cursor);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const midday = new Date(`${y}-${m}-${day}T12:00:00Z`);
    out.push({
      key: `${y}-${m}-${day}`,
      label: shortFmt.format(midday),
      longLabel: longFmt.format(midday),
    });
  }
  return out;
}

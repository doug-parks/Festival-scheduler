import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OverlapView } from "@/components/overlap-view";
import { defaultFilter, isWithinFestival } from "@/lib/festival";
import {
  NOW_AND_NEXT_HOURS,
  fetchAllFilters,
  getPrimaryGroupId,
  pickActiveFestival,
} from "@/app/overlap/data";

// Always server-render fresh: overlap counts change as friends update picks.
export const dynamic = "force-dynamic";

export default async function OverlapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const festival = await pickActiveFestival(supabase);
  if (!festival) return <NoFestivalEmpty />;

  const primaryGroupId = await getPrimaryGroupId(supabase, user.id, festival.id);
  const userHasGroup = primaryGroupId !== null;
  const initial = defaultFilter({
    withinFestival: isWithinFestival(festival),
    userHasGroup,
  });

  // Pre-fetch all four filters so chip switches are instant (PM: "no spinner on
  // filter change"). Four RPC calls in parallel is cheap at MDF scale.
  const initialRows = await fetchAllFilters(supabase, {
    festivalId: festival.id,
    groupId: primaryGroupId,
    timezone: festival.timezone,
  });

  return (
    <OverlapView
      initialRows={initialRows}
      initialFilter={initial}
      userHasGroup={userHasGroup}
      festivalTimezone={festival.timezone}
      nowAndNextWindowHours={NOW_AND_NEXT_HOURS}
      userId={user.id}
    />
  );
}

function NoFestivalEmpty() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Overlap</h1>
      <p className="mt-2 text-sm text-neutral-400">
        No festivals in the database yet. Once the admin importer runs, this
        view will show sets where 2+ of your crew are going.
      </p>
    </div>
  );
}

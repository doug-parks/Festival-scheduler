import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OverlapView } from "@/components/overlap-view";
import { defaultFilter, isWithinFestival } from "@/lib/festival";
import {
  NOW_AND_NEXT_HOURS,
  FESTIVAL_META,
  fetchAllFilters,
} from "@/app/overlap/data";

// Always server-render fresh: overlap counts change as friends update picks.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Overlap — MDF 2026",
};

export default async function OverlapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const initial = defaultFilter({
    withinFestival: isWithinFestival(FESTIVAL_META),
  });

  // Pre-fetch all filters so chip switches are instant.
  const initialRows = await fetchAllFilters(supabase, {
    timezone: FESTIVAL_META.timezone,
  });

  return (
    <OverlapView
      initialRows={initialRows}
      initialFilter={initial}
      festivalTimezone={FESTIVAL_META.timezone}
      nowAndNextWindowHours={NOW_AND_NEXT_HOURS}
      userId={user.id}
    />
  );
}

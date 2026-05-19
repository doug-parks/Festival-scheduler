import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PagePlaceholder } from "@/components/page-placeholder";
import { CalendarPickPreview } from "./pick-preview";
import type { PickState, PickValue } from "@/lib/picks/constants";

type SetRow = {
  id: string;
  start_time: string;
  end_time: string;
  bands: { id: string; name: string; festival_id: string } | null;
  stages: { id: string; name: string } | null;
};

type PickRow = { set_id: string; state: PickState };

// Until the calendar grid (issue #4) lands, this page renders a vertical
// list of every set the user can see, each wrapped in <PickControl>. That
// lets us exercise one-tap + long-press + Realtime end-to-end on Vercel
// preview without blocking on the grid PR.
export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: sets } = await supabase
    .from("sets")
    .select(
      "id, start_time, end_time, bands ( id, name, festival_id ), stages ( id, name )",
    )
    .order("start_time", { ascending: true })
    .limit(200)
    .returns<SetRow[]>();

  const setRows: SetRow[] = (sets ?? []).filter(
    (s): s is SetRow & { bands: NonNullable<SetRow["bands"]> } => !!s.bands,
  );

  if (setRows.length === 0) {
    return (
      <PagePlaceholder
        title="Lineup"
        blurb="MDF 2026 — weekend and day views with one-tap RYG picks."
        next={[
          "Run the admin importer to populate bands, stages, and sets",
          "Render stage × time grid with absolutely-positioned set tiles",
          "Pick control is live — once sets are imported, the list appears here",
          "Subscribe to Supabase Realtime for friend picks",
        ]}
      />
    );
  }

  // Pull existing picks for this user in one round-trip.
  const { data: picks } = await supabase
    .from("picks")
    .select("set_id, state")
    .eq("user_id", user.id)
    .returns<PickRow[]>();

  const pickBySetId = new Map<string, PickValue>();
  for (const p of picks ?? []) pickBySetId.set(p.set_id, p.state);

  // Single-festival MVP — derive the festival id from the first set.
  const festivalId = setRows[0]?.bands?.festival_id ?? null;

  const tiles = setRows.map((s) => ({
    setId: s.id,
    bandName: s.bands!.name,
    startTime: s.start_time,
    endTime: s.end_time,
    stageName: s.stages?.name ?? "Stage TBD",
    state: pickBySetId.get(s.id) ?? "none",
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Lineup</h1>
        <Link
          href="/my-schedule"
          className="text-sm text-neutral-400 hover:text-neutral-200"
        >
          My schedule →
        </Link>
      </header>
      <CalendarPickPreview
        userId={user.id}
        festivalId={festivalId}
        tiles={tiles}
      />
    </div>
  );
}

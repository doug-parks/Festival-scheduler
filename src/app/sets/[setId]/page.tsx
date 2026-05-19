// Band/set detail screen. Reachable from the calendar tile (long-press →
// "Band details" link, or the visually-hidden direct link rendered inside
// the tile for AT users — wired by the calendar grid PR).
//
// Renders the explicit Green/Yellow/Red `<PickButtons>` as the deliberate,
// keyboard-friendly path to changing a pick.

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PickButtons } from "@/components/pick-buttons";
import type { PickState, PickValue } from "@/lib/picks/constants";

type SetRow = {
  id: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  bands: { id: string; name: string; bio: string | null } | null;
  stages: { id: string; name: string } | null;
};

type PickRow = { state: PickState };

export default async function SetDetailPage({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: setRow } = await supabase
    .from("sets")
    .select(
      "id, start_time, end_time, notes, bands ( id, name, bio ), stages ( id, name )",
    )
    .eq("id", setId)
    .maybeSingle<SetRow>();

  if (!setRow || !setRow.bands) notFound();

  const { data: pickRow } = await supabase
    .from("picks")
    .select("state")
    .eq("set_id", setId)
    .eq("user_id", user.id)
    .maybeSingle<PickRow>();

  const currentPick: PickValue = pickRow?.state ?? "none";
  const start = new Date(setRow.start_time);
  const end = new Date(setRow.end_time);
  const timeRange = `${start.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  })} – ${end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <Link
        href="/calendar"
        className="text-sm text-neutral-400 hover:text-neutral-200"
      >
        ← Back to lineup
      </Link>
      <h1 className="mt-4 text-3xl font-semibold">{setRow.bands.name}</h1>
      <p className="mt-1 text-sm text-neutral-400">
        {setRow.stages?.name ?? "Stage TBD"} · {timeRange}
      </p>

      <section aria-labelledby="your-pick" className="mt-8">
        <h2
          id="your-pick"
          className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400"
        >
          Your pick
        </h2>
        <PickButtons
          userId={user.id}
          setId={setRow.id}
          bandName={setRow.bands.name}
          state={currentPick}
        />
      </section>

      {setRow.bands.bio && (
        <section className="mt-8">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
            About
          </h2>
          <p className="text-sm leading-relaxed text-neutral-300">
            {setRow.bands.bio}
          </p>
        </section>
      )}

      {setRow.notes && (
        <p className="mt-6 text-xs text-neutral-500">{setRow.notes}</p>
      )}
    </div>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PagePlaceholder } from "@/components/page-placeholder";

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return (
    <PagePlaceholder
      title="Lineup"
      blurb="MDF 2026 — weekend and day views with one-tap RYG picks."
      next={[
        "Run the admin importer to populate bands, stages, and sets",
        "Render stage × time grid with absolutely-positioned set tiles",
        "Wire one-tap RYG cycle (none → green → yellow → red)",
        "Subscribe to Supabase Realtime for friend picks",
      ]}
    />
  );
}

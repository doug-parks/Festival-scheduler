import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PagePlaceholder } from "@/components/page-placeholder";

export default async function OverlapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return (
    <PagePlaceholder
      title="Overlap"
      blurb="Sets where 2+ friends are green, sorted by overlap count."
      next={[
        "Query visible friends + group members",
        "Aggregate green picks per set; filter >= 2",
        "Filter chips: All / This crew / Today / Now & next",
      ]}
    />
  );
}

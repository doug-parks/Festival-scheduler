import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PagePlaceholder } from "@/components/page-placeholder";

export default async function MySchedulePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return (
    <PagePlaceholder
      title="My schedule"
      blurb="Your greens (and optionally yellows), grouped by day, with conflict warnings."
      next={[
        "Query Picks where user_id = me, state = green",
        "Group by festival day; sort chronologically",
        "Detect overlapping greens; render inline warning",
      ]}
    />
  );
}

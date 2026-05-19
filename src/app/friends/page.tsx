import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PagePlaceholder } from "@/components/page-placeholder";

export default async function FriendsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return (
    <PagePlaceholder
      title="Friends"
      blurb="Per-festival invite link for the crew. Mutual follow for everyone else."
      next={[
        "Generate / revoke FestivalGroupInvite tokens",
        "Username search + email search (gated by email_searchable)",
        "FriendEdge create/accept/decline flow",
      ]}
    />
  );
}

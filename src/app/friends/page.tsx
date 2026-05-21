import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { loadFriendsPageData } from "@/lib/friends/queries";
import { InviteLinkSection } from "@/components/friends/invite-link-section";
import { FindFriend } from "@/components/friends/find-friend";
import { FriendsList } from "@/components/friends/friends-list";
import { PendingRequests } from "@/components/friends/pending-requests";

export const metadata: Metadata = {
  title: "Friends — MDF 2026",
};

/**
 * Friends page — three vertically stacked sections:
 *   1. Share an invite link (personal follow-link)
 *   2. Mutual follows (friends list + Find a friend search)
 *   3. Friend requests (only when count > 0)
 */
export default async function FriendsPage() {
  const hdrs = await headers();
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const origin = envOrigin ?? (host ? `${proto}://${host}` : "");

  const data = await loadFriendsPageData(origin);
  if (!data) redirect("/");

  const existingFriendIds = new Set(data.friends.map((f) => f.user_id));
  const pendingOutgoingIds = new Set(
    data.pendingOutgoing.map((p) => p.user_id),
  );
  const pendingIncomingIds = new Set(
    data.pendingIncoming.map((p) => p.user_id),
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Friends</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Share an invite link, or follow individual friends by username.
        </p>
      </header>

      <InviteLinkSection inviteUrl={data.inviteUrl} />

      <hr className="my-8 border-neutral-800" />

      <section aria-labelledby="follows-heading">
        <h2 id="follows-heading" className="mb-4 text-lg font-semibold">
          Mutual follows
        </h2>
        <div className="space-y-6">
          <FindFriend
            existingFriendIds={existingFriendIds}
            pendingOutgoingIds={pendingOutgoingIds}
            pendingIncomingIds={pendingIncomingIds}
          />
          <FriendsList
            friends={data.friends}
            outgoing={data.pendingOutgoing}
          />
        </div>
      </section>

      {data.pendingIncoming.length > 0 && (
        <>
          <hr className="my-8 border-neutral-800" />
          <PendingRequests pending={data.pendingIncoming} />
        </>
      )}
    </div>
  );
}

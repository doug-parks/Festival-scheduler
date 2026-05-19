import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { loadFriendsPageData } from "@/lib/friends/queries";
import { InviteLinkSection } from "@/components/friends/invite-link-section";
import { FindFriend } from "@/components/friends/find-friend";
import { FriendsList } from "@/components/friends/friends-list";
import { PendingRequests } from "@/components/friends/pending-requests";

/**
 * Friends page — three vertically stacked sections per UX spec:
 *   1. Your MDF 2026 crew (invite link + member list)
 *   2. Mutual follows (friends list + Find a friend search)
 *   3. Friend requests (only when count > 0)
 *
 * All data is fetched server-side under the caller's RLS so the page is
 * safe to render even if a client component bug tries to over-fetch.
 */
export default async function FriendsPage() {
  // Reconstruct the request origin server-side so client components don't
  // have to know how to build invite URLs. NEXT_PUBLIC_SITE_URL wins when
  // present (production); otherwise we derive from the request host headers.
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
          Share an invite link with your crew, or follow individual friends
          by username.
        </p>
      </header>

      <InviteLinkSection
        groupName={data.groupName}
        inviteUrl={data.inviteUrl}
        crew={data.crew}
        currentUserId={data.userId}
      />

      <hr className="my-8 border-neutral-800" />

      <section aria-labelledby="follows-heading">
        <h2
          id="follows-heading"
          className="mb-4 text-lg font-semibold"
        >
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

import type { PendingIncoming } from "@/lib/friends/queries";
import { FriendAvatar } from "./avatar";
import {
  acceptFriendRequestForm,
  declineFriendRequestForm,
} from "@/lib/friends/actions";

/**
 * Incoming friend requests for the current user. Renders Accept and
 * Decline buttons that post to server actions. Section is only shown
 * when at least one request is pending (callers gate this).
 */
export function PendingRequests({
  pending,
}: {
  pending: PendingIncoming[];
}) {
  if (pending.length === 0) return null;
  return (
    <section aria-labelledby="pending-heading">
      <h2 id="pending-heading" className="mb-4 text-lg font-semibold">
        Friend requests
        <span className="ml-2 rounded-full bg-pick-red px-2 py-0.5 text-xs text-white">
          {pending.length}
        </span>
      </h2>
      <ul role="list" className="divide-y divide-neutral-800">
        {pending.map((p) => {
          const name = p.display_name ?? p.username ?? "Someone";
          return (
            <li
              key={p.edge_id}
              role="listitem"
              className="flex items-center gap-3 py-3"
            >
              <FriendAvatar url={p.avatar_url} name={name} />
              <div className="flex-1 text-sm">
                <p className="text-neutral-200">
                  <span className="font-medium">{name}</span>
                  {p.username && (
                    <span className="text-neutral-500"> @{p.username}</span>
                  )}
                </p>
                <p className="text-xs text-neutral-500">
                  wants to follow you.
                </p>
              </div>
              <form action={acceptFriendRequestForm} className="inline">
                <input
                  type="hidden"
                  name="edge_id"
                  value={p.edge_id}
                />
                <button
                  type="submit"
                  aria-label={`Accept ${name}'s friend request`}
                  className="rounded bg-white px-3 py-1 text-sm font-medium text-black hover:bg-neutral-200"
                >
                  Accept
                </button>
              </form>
              <form action={declineFriendRequestForm} className="inline">
                <input
                  type="hidden"
                  name="edge_id"
                  value={p.edge_id}
                />
                <button
                  type="submit"
                  aria-label={`Decline ${name}'s friend request`}
                  className="rounded border border-neutral-700 px-3 py-1 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  Decline
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

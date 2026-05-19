import type { FriendRow, PendingOutgoing } from "@/lib/friends/queries";
import { FriendAvatar } from "./avatar";
import { cancelFriendRequestForm } from "@/lib/friends/actions";

/**
 * Accepted mutual follows + the user's own outstanding outgoing requests.
 * Outgoing requests show the "Request sent — waiting for @username" copy
 * the PM spec calls out for sender pending visibility.
 */
export function FriendsList({
  friends,
  outgoing,
}: {
  friends: FriendRow[];
  outgoing: PendingOutgoing[];
}) {
  return (
    <div className="space-y-6">
      {friends.length === 0 && outgoing.length === 0 ? (
        <p className="text-sm text-neutral-500">
          You haven&apos;t added anyone yet. Use the search above to find
          friends by @username.
        </p>
      ) : null}

      {friends.length > 0 && (
        <ul role="list" className="divide-y divide-neutral-800">
          {friends.map((f) => (
            <li
              key={f.user_id}
              className="flex items-center gap-3 py-3"
              role="listitem"
            >
              <FriendAvatar
                url={f.avatar_url}
                name={f.display_name ?? f.username ?? "?"}
              />
              <div className="text-sm">
                <span className="text-neutral-200">
                  {f.display_name ?? f.username ?? "Unknown"}
                </span>
                {f.username && (
                  <span className="ml-2 text-neutral-500">
                    @{f.username}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {outgoing.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-neutral-300">
            Awaiting response
          </h3>
          <ul role="list" className="divide-y divide-neutral-800">
            {outgoing.map((p) => (
              <li
                key={p.edge_id}
                className="flex items-center gap-3 py-3"
                role="listitem"
              >
                <FriendAvatar
                  url={p.avatar_url}
                  name={p.display_name ?? p.username ?? "?"}
                />
                <div className="flex-1 text-sm">
                  <p className="text-neutral-300">
                    Request sent — waiting for{" "}
                    <span className="text-neutral-200">
                      @{p.username ?? "user"}
                    </span>{" "}
                    to accept.
                  </p>
                </div>
                <form action={cancelFriendRequestForm}>
                  <input
                    type="hidden"
                    name="edge_id"
                    value={p.edge_id}
                  />
                  <button
                    type="submit"
                    aria-label={`Cancel request to @${p.username ?? "user"}`}
                    className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

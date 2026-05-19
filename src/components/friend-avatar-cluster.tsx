import type { FriendOnSet } from "@/lib/types";

/**
 * Renders up to 3 friend avatars + a "+N more" pill. Lazy-loaded images.
 * Shared between the calendar grid (item 4) and the overlap view (item 6).
 */
export function FriendAvatarCluster({
  friends,
  size = 16,
}: {
  friends: FriendOnSet[];
  size?: number;
}) {
  if (friends.length === 0) return null;
  const visible = friends.slice(0, 3);
  const overflow = friends.length - visible.length;
  return (
    <div
      className="flex items-center -space-x-1"
      aria-label={`${friends.length} ${
        friends.length === 1 ? "friend" : "friends"
      } picked this set`}
    >
      {visible.map((f) => (
        <span
          key={f.user_id}
          className="inline-block overflow-hidden rounded-full border border-neutral-900 bg-neutral-700"
          style={{ width: size, height: size }}
          title={f.display_name}
        >
          {f.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={f.avatar_url}
              alt=""
              loading="lazy"
              width={size}
              height={size}
              className="h-full w-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-full w-full items-center justify-center text-[8px] font-medium uppercase text-neutral-200"
            >
              {initials(f.display_name)}
            </span>
          )}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="ml-1 rounded-full bg-neutral-700 px-1 text-[9px] font-medium text-neutral-200"
          aria-hidden="true"
        >
          +{overflow} more
        </span>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");
}

/**
 * Small avatar tile used in crew / friends / search lists.
 * Falls back to an initial circle when no avatar_url is set.
 */
export function FriendAvatar({
  url,
  name,
  size = 32,
}: {
  url?: string | null;
  name?: string | null;
  size?: number;
}) {
  const initial = (name?.trim().charAt(0) || "?").toUpperCase();

  if (url) {
    return (
      // Remote-only avatars; next/image optimization deferred — MVP.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="rounded-full bg-neutral-800 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center rounded-full bg-neutral-800 text-xs font-medium text-neutral-300"
      style={{ width: size, height: size }}
    >
      {initial}
    </div>
  );
}

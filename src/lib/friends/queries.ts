import { createClient } from "@/lib/supabase/server";

export type FriendRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type PendingIncoming = FriendRow & { edge_id: string };
export type PendingOutgoing = FriendRow & { edge_id: string };

export type FriendsPageData = {
  userId: string;
  inviteToken: string | null;
  inviteUrl: string | null;
  friends: FriendRow[];
  pendingIncoming: PendingIncoming[];
  pendingOutgoing: PendingOutgoing[];
};

export function buildInviteUrl(origin: string, token: string): string {
  return `${origin}/join/${token}`;
}

/**
 * Loads everything the /friends page needs in one shot. Designed for a
 * Server Component — uses the authed Supabase server client so RLS
 * applies to every read.
 *
 * Post-simplification: the festival_groups concept is gone. The "crew"
 * model collapses to mutual-follow + a single per-user invite link that
 * mints a follow request to the owner on accept.
 */
export async function loadFriendsPageData(
  origin: string,
): Promise<FriendsPageData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Active invite link for this user (most recent, not revoked).
  const { data: invite } = await supabase
    .from("invite_links")
    .select("token")
    .eq("owner_user_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const inviteToken = invite?.token ?? null;
  const inviteUrl = inviteToken ? buildInviteUrl(origin, inviteToken) : null;

  // Friend edges. RLS scopes to edges where the user is an endpoint.
  type UserSlice = {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
  type EdgeRow = {
    id: string;
    user_a_id: string;
    user_b_id: string;
    status: "pending" | "accepted" | "declined" | "blocked";
    requested_by_user_id: string;
    a: UserSlice | UserSlice[] | null;
    b: UserSlice | UserSlice[] | null;
  };

  const { data: edgesRaw } = await supabase
    .from("friend_edges")
    .select(
      "id, user_a_id, user_b_id, status, requested_by_user_id, " +
        "a:user_a_id(id, username, display_name, avatar_url), " +
        "b:user_b_id(id, username, display_name, avatar_url)",
    )
    .in("status", ["pending", "accepted"]);
  const edges = (edgesRaw as unknown as EdgeRow[] | null) ?? [];

  const friends: FriendRow[] = [];
  const pendingIncoming: PendingIncoming[] = [];
  const pendingOutgoing: PendingOutgoing[] = [];

  for (const e of edges) {
    const otherIsA = e.user_b_id === user.id;
    const otherRel = otherIsA ? e.a : e.b;
    const otherUser = Array.isArray(otherRel) ? (otherRel[0] ?? null) : otherRel;
    if (!otherUser) continue;
    const row: FriendRow = {
      user_id: otherUser.id,
      username: otherUser.username,
      display_name: otherUser.display_name,
      avatar_url: otherUser.avatar_url,
    };
    if (e.status === "accepted") {
      friends.push(row);
    } else if (e.status === "pending") {
      if (e.requested_by_user_id === user.id) {
        pendingOutgoing.push({ ...row, edge_id: e.id });
      } else {
        pendingIncoming.push({ ...row, edge_id: e.id });
      }
    }
  }

  return {
    userId: user.id,
    inviteToken,
    inviteUrl,
    friends,
    pendingIncoming,
    pendingOutgoing,
  };
}

/**
 * Count of incoming pending friend requests — used for the nav badge.
 * Cheap query; called on every authed request from the nav.
 */
export async function getPendingIncomingCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from("friend_edges")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .neq("requested_by_user_id", user.id)
    .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`);

  return count ?? 0;
}

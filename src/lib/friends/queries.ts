import { createClient } from "@/lib/supabase/server";
import { FESTIVAL_SLUG, DEFAULT_GROUP_NAME } from "./constants";

export type CrewMember = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  display_name: string | null;
  role: "owner" | "member";
};

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
  festivalId: string | null;
  groupId: string | null;
  groupName: string;
  inviteToken: string | null;
  inviteUrl: string | null;
  crew: CrewMember[];
  friends: FriendRow[];
  pendingIncoming: PendingIncoming[];
  pendingOutgoing: PendingOutgoing[];
};

/**
 * Resolve the canonical festival id for this single-festival MVP.
 * Returns null if no festival has been seeded yet (admin hasn't imported).
 */
export async function getFestivalId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("festivals")
    .select("id")
    .eq("slug", FESTIVAL_SLUG)
    .maybeSingle();
  return data?.id ?? null;
}

export function buildInviteUrl(origin: string, token: string): string {
  return `${origin}/join/${token}`;
}

/**
 * Pretty group name used in UI copy. Falls back to "MDF 2026 crew" when
 * the row exists but `name` is null (PM spec).
 */
export function groupDisplayName(name: string | null | undefined): string {
  return name && name.trim().length > 0 ? name : DEFAULT_GROUP_NAME;
}

/**
 * Loads everything the /friends page needs in one shot. Designed for a
 * Server Component — uses the authed Supabase server client so RLS
 * applies to every read.
 */
export async function loadFriendsPageData(
  origin: string,
): Promise<FriendsPageData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const festivalId = await getFestivalId();

  let groupId: string | null = null;
  let groupName: string = DEFAULT_GROUP_NAME;
  let inviteToken: string | null = null;
  let inviteUrl: string | null = null;
  const crew: CrewMember[] = [];

  if (festivalId) {
    // Find the user's group for this festival (if any). They can be in
    // exactly one (no UI to create more in v1), so pick the first.
    type FgSlice = {
      id: string;
      name: string | null;
      festival_id: string;
    };
    type MyGroupRow = {
      group_id: string;
      festival_groups: FgSlice | FgSlice[] | null;
    };
    const { data: myGroupRaw } = await supabase
      .from("festival_group_memberships")
      .select("group_id, festival_groups!inner(id, name, festival_id)")
      .eq("user_id", user.id)
      .eq("festival_groups.festival_id", festivalId)
      .limit(1)
      .maybeSingle();
    const myGroup = myGroupRaw as unknown as MyGroupRow | null;

    const fgRel = myGroup?.festival_groups ?? null;
    const fg: FgSlice | null = Array.isArray(fgRel)
      ? (fgRel[0] ?? null)
      : fgRel;

    if (fg) {
      groupId = fg.id;
      groupName = groupDisplayName(fg.name);

      // Active invite (most recent, not revoked).
      const { data: invite } = await supabase
        .from("festival_group_invites")
        .select("token")
        .eq("group_id", groupId)
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (invite?.token) {
        inviteToken = invite.token;
        inviteUrl = buildInviteUrl(origin, invite.token);
      }

      // Crew members. Supabase types the embedded `users` relation as
      // an array even though it's a single FK; we normalize via `unknown`.
      type MemberRow = {
        user_id: string;
        role: "owner" | "member";
        users:
          | {
              username: string | null;
              display_name: string | null;
              avatar_url: string | null;
            }
          | {
              username: string | null;
              display_name: string | null;
              avatar_url: string | null;
            }[]
          | null;
      };

      const { data: membersRaw } = await supabase
        .from("festival_group_memberships")
        .select(
          "user_id, role, users:user_id(username, display_name, avatar_url)",
        )
        .eq("group_id", groupId);

      const members = (membersRaw as unknown as MemberRow[] | null) ?? [];
      for (const m of members) {
        const u = Array.isArray(m.users) ? (m.users[0] ?? null) : m.users;
        crew.push({
          user_id: m.user_id,
          role: m.role,
          username: u?.username ?? null,
          display_name: u?.display_name ?? null,
          avatar_url: u?.avatar_url ?? null,
        });
      }
    }
  }

  // Friend edges. RLS scopes to edges where the user is an endpoint.
  // Order matters: accepted -> friends list; pending split by requester.
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
    festivalId,
    groupId,
    groupName,
    inviteToken,
    inviteUrl,
    crew,
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

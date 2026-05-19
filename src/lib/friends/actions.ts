"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFestivalId, buildInviteUrl, groupDisplayName } from "./queries";
import { DEFAULT_GROUP_NAME } from "./constants";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Generate (or fetch existing) invite link for the user's MDF 2026 crew.
 *
 * If the user has no group for the festival yet:
 *   1. create the group (festival_groups)
 *   2. add the caller as owner (festival_group_memberships)
 *   3. create the invite (festival_group_invites)
 *
 * If a group exists but has no active invite, just create the invite.
 * If an active invite exists, return it — calling "Generate" twice in
 * a row is a no-op rather than a flood of stale tokens.
 */
export async function generateInviteLink(
  origin: string,
): Promise<ActionResult<{ token: string; url: string; groupName: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const festivalId = await getFestivalId();
  if (!festivalId) {
    return {
      ok: false,
      error: "No festival is configured yet. Ask an admin to import the lineup.",
    };
  }

  // 1. Find or create the user's group for this festival.
  let groupId: string | null = null;
  let groupName: string = DEFAULT_GROUP_NAME;

  type FgSlice = { id: string; name: string | null };
  type ExistingMembershipRow = {
    group_id: string;
    festival_groups: FgSlice | FgSlice[] | null;
  };
  const { data: existingMembershipRaw } = await supabase
    .from("festival_group_memberships")
    .select("group_id, festival_groups!inner(id, name, festival_id)")
    .eq("user_id", user.id)
    .eq("festival_groups.festival_id", festivalId)
    .limit(1)
    .maybeSingle();
  const existingMembership =
    existingMembershipRaw as unknown as ExistingMembershipRow | null;

  const fgRel = existingMembership?.festival_groups ?? null;
  const existingGroup: FgSlice | null = Array.isArray(fgRel)
    ? (fgRel[0] ?? null)
    : fgRel;

  if (existingGroup) {
    groupId = existingGroup.id;
    groupName = groupDisplayName(existingGroup.name);
  } else {
    const { data: newGroup, error: groupErr } = await supabase
      .from("festival_groups")
      .insert({
        festival_id: festivalId,
        name: null, // Display falls back to "MDF 2026 crew".
        created_by_user_id: user.id,
      })
      .select("id, name")
      .single();
    if (groupErr || !newGroup) {
      return {
        ok: false,
        error: `Couldn't create your crew: ${groupErr?.message ?? "unknown"}`,
      };
    }
    groupId = newGroup.id;
    groupName = groupDisplayName(newGroup.name);

    const { error: memErr } = await supabase
      .from("festival_group_memberships")
      .insert({
        group_id: groupId,
        user_id: user.id,
        role: "owner",
      });
    if (memErr) {
      // Best-effort rollback so we don't leave an orphan group with no
      // owner. We just inserted via `created_by_user_id = auth.uid()`,
      // so the delete RLS (`fg_delete_owner`) won't pass — but the user
      // *is* about to become the owner. As a fallback, the orphan group
      // is harmless: it has no invites and only the creator can see it.
      await supabase.from("festival_groups").delete().eq("id", groupId);
      return {
        ok: false,
        error: `Couldn't add you to the crew: ${memErr.message}`,
      };
    }
  }

  // 2. Reuse an active invite if one exists. (Per-spec QA note: a re-call
  //    doesn't flood new tokens — old links remain usable.)
  const { data: activeInvite } = await supabase
    .from("festival_group_invites")
    .select("token")
    .eq("group_id", groupId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeInvite?.token) {
    revalidatePath("/friends");
    return {
      ok: true,
      data: {
        token: activeInvite.token,
        url: buildInviteUrl(origin, activeInvite.token),
        groupName,
      },
    };
  }

  // 3. Mint a fresh invite token.
  const token = crypto.randomUUID();
  const { error: invErr } = await supabase
    .from("festival_group_invites")
    .insert({
      group_id: groupId,
      token,
      created_by_user_id: user.id,
      // expires_at left null — non-expiring in v1 per PRD.
    });
  if (invErr) {
    return {
      ok: false,
      error: `Couldn't create invite link: ${invErr.message}`,
    };
  }

  revalidatePath("/friends");
  return {
    ok: true,
    data: { token, url: buildInviteUrl(origin, token), groupName },
  };
}

/**
 * Revoke the active invite link for the user's group. After this, the old
 * URL renders the "no longer valid" page. A new link can be minted by
 * calling `generateInviteLink` again.
 */
export async function revokeInviteLink(token: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!token) return { ok: false, error: "Missing invite token." };

  // RLS (fgi_member) gates this update to group members — sufficient guard.
  const { error } = await supabase
    .from("festival_group_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token", token)
    .is("revoked_at", null);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/friends");
  return { ok: true, data: undefined };
}

/**
 * Accept an invite token. Uses the `accept_group_invite` SECURITY DEFINER
 * RPC (see 0005_friend_search.sql) so it works for *strangers* who aren't
 * yet members of the group. RLS on festival_group_invites would otherwise
 * block their lookup.
 *
 * Returns:
 *   ok=true   → joined or already_member
 *   ok=false  → 'invalid' | 'revoked' | rpc error
 */
export async function acceptInvite(
  token: string,
): Promise<ActionResult<{ groupName: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data, error } = await supabase.rpc("accept_group_invite", {
    invite_token: token,
  });

  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: "invalid" };

  if (row.status === "invalid") return { ok: false, error: "invalid" };
  if (row.status === "revoked") return { ok: false, error: "revoked" };

  // joined | already_member → success.
  revalidatePath("/friends");
  return {
    ok: true,
    data: { groupName: groupDisplayName(row.group_name) },
  };
}

/**
 * Create a pending friend_edge from the caller to `targetUserId`.
 *
 * Honors the `user_a_id < user_b_id` check constraint by canonicalizing
 * the pair before insert. Sender identity goes in `requested_by_user_id`.
 */
export async function sendFriendRequest(
  targetUserId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!targetUserId) return { ok: false, error: "Missing target." };
  if (targetUserId === user.id)
    return { ok: false, error: "Can't friend yourself." };

  // Canonicalize: user_a_id < user_b_id (lexicographic UUID compare).
  const [aId, bId] =
    user.id < targetUserId ? [user.id, targetUserId] : [targetUserId, user.id];

  // If an edge already exists for this pair, the unique constraint will
  // reject the insert. Check first so we can give a friendly error and
  // handle the declined→re-request case.
  const { data: existing } = await supabase
    .from("friend_edges")
    .select("id, status, requested_by_user_id")
    .eq("user_a_id", aId)
    .eq("user_b_id", bId)
    .maybeSingle();

  if (existing) {
    if (existing.status === "accepted") {
      return { ok: false, error: "Already friends." };
    }
    if (existing.status === "pending") {
      return { ok: false, error: "Request already pending." };
    }
    if (existing.status === "blocked") {
      return { ok: false, error: "Can't send a request to this user." };
    }
    // declined — allow re-send by deleting and re-inserting. Simpler than
    // an UPDATE because the RLS for update is recipient-only and we may
    // be either side of the pair.
    const { error: delErr } = await supabase
      .from("friend_edges")
      .delete()
      .eq("id", existing.id);
    if (delErr) return { ok: false, error: delErr.message };
  }

  const { error } = await supabase.from("friend_edges").insert({
    user_a_id: aId,
    user_b_id: bId,
    status: "pending",
    requested_by_user_id: user.id,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/friends");
  return { ok: true, data: undefined };
}

/**
 * Recipient accepts a pending friend request. RLS (fe_update_recipient)
 * enforces that only the non-requester endpoint can flip status.
 */
export async function acceptFriendRequest(
  edgeId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("friend_edges")
    .update({
      status: "accepted",
      responded_at: new Date().toISOString(),
    })
    .eq("id", edgeId)
    .eq("status", "pending");

  if (error) return { ok: false, error: error.message };

  revalidatePath("/friends");
  return { ok: true, data: undefined };
}

/**
 * Recipient declines a pending friend request.
 */
export async function declineFriendRequest(
  edgeId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("friend_edges")
    .update({
      status: "declined",
      responded_at: new Date().toISOString(),
    })
    .eq("id", edgeId)
    .eq("status", "pending");

  if (error) return { ok: false, error: error.message };

  revalidatePath("/friends");
  return { ok: true, data: undefined };
}

/**
 * Sender cancels a pending request they sent. (PM spec was silent on this;
 * we allow it — pending requests with nobody home shouldn't be stuck.)
 * RLS fe_delete_either permits delete by either endpoint, so this works
 * for the sender even though they can't UPDATE the row.
 */
export async function cancelFriendRequest(
  edgeId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("friend_edges")
    .delete()
    .eq("id", edgeId)
    .eq("requested_by_user_id", user.id)
    .eq("status", "pending");

  if (error) return { ok: false, error: error.message };

  revalidatePath("/friends");
  return { ok: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// Form-action wrappers.
//
// These accept FormData so they can be used with `<form action={...}>`
// without client JS. Each redirects back to /friends after the mutation
// so the page re-renders with fresh data.
// ─────────────────────────────────────────────────────────────────────────────

export async function revokeInviteFormAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (token) await revokeInviteLink(token);
  redirect("/friends");
}

export async function acceptFriendRequestForm(formData: FormData) {
  const edgeId = String(formData.get("edge_id") ?? "");
  if (edgeId) await acceptFriendRequest(edgeId);
  redirect("/friends");
}

export async function declineFriendRequestForm(formData: FormData) {
  const edgeId = String(formData.get("edge_id") ?? "");
  if (edgeId) await declineFriendRequest(edgeId);
  redirect("/friends");
}

export async function cancelFriendRequestForm(formData: FormData) {
  const edgeId = String(formData.get("edge_id") ?? "");
  if (edgeId) await cancelFriendRequest(edgeId);
  redirect("/friends");
}

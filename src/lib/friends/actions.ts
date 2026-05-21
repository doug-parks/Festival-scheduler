"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildInviteUrl } from "./queries";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Generate (or fetch existing) personal invite link.
 *
 * Post-simplification: there is no group entity anymore. Each user has at
 * most one active invite_link; anyone hitting /join/<token> while signed in
 * gets a pending friend request to the link owner. Calling this twice in a
 * row is a no-op rather than minting fresh tokens.
 */
export async function generateInviteLink(
  origin: string,
): Promise<ActionResult<{ token: string; url: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Reuse an active link if one exists.
  const { data: active } = await supabase
    .from("invite_links")
    .select("token")
    .eq("owner_user_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (active?.token) {
    revalidatePath("/friends");
    return {
      ok: true,
      data: { token: active.token, url: buildInviteUrl(origin, active.token) },
    };
  }

  // Mint a fresh invite token.
  const token = crypto.randomUUID();
  const { error } = await supabase.from("invite_links").insert({
    token,
    owner_user_id: user.id,
  });
  if (error)
    return { ok: false, error: `Couldn't create invite link: ${error.message}` };

  revalidatePath("/friends");
  return {
    ok: true,
    data: { token, url: buildInviteUrl(origin, token) },
  };
}

/**
 * Revoke the active invite link for the caller. After this, the old URL
 * renders the "no longer valid" page. A new link can be minted by calling
 * `generateInviteLink` again.
 */
export async function revokeInviteLink(token: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!token) return { ok: false, error: "Missing invite token." };

  // RLS (invite_links_owner_all) gates this update to the owner.
  const { error } = await supabase
    .from("invite_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token", token)
    .is("revoked_at", null);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/friends");
  return { ok: true, data: undefined };
}

export type AcceptInviteStatus =
  | "requested"
  | "already_friends"
  | "request_pending"
  | "self";

/**
 * Accept an invite token. Sends a pending friend_edge from the caller to the
 * link owner via the `accept_invite_link` SECURITY DEFINER RPC.
 */
export async function acceptInvite(
  token: string,
): Promise<
  ActionResult<{
    status: AcceptInviteStatus;
    ownerDisplayName: string;
  }>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data, error } = await supabase.rpc("accept_invite_link", {
    invite_token: token,
  });

  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: "invalid" };

  if (row.status === "invalid") return { ok: false, error: "invalid" };
  if (row.status === "revoked") return { ok: false, error: "revoked" };

  const ownerDisplayName =
    (row.owner_display_name as string | null) ??
    (row.owner_username as string | null) ??
    "your friend";

  return {
    ok: true,
    data: {
      status: row.status as AcceptInviteStatus,
      ownerDisplayName,
    },
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

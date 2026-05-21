import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { acceptInvite } from "@/lib/friends/actions";
import { JoinSignInButton } from "@/components/join-sign-in-button";

type RpcCtx = {
  owner_username: string | null;
  owner_display_name: string | null;
} | null;

/**
 * /join/[token] — the invite-link landing page.
 *
 * Behavior matrix:
 *   - signed out, valid token   → "Follow <owner> on MDF 2026" + Google button
 *   - signed out, invalid token → "Invite no longer valid"
 *   - signed in,  valid token   → run acceptInvite() → redirect to /friends
 *   - signed in,  invalid       → "Invite no longer valid"
 *
 * Post-simplification: the invite no longer joins a group; it sends a
 * pending friend request to the link owner. Mutual-follow happens when
 * the owner accepts back from their /friends page.
 */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const result = await acceptInvite(token);
    if (result.ok) {
      redirect(
        `/friends?requested=${encodeURIComponent(result.data.status)}&owner=${encodeURIComponent(result.data.ownerDisplayName)}`,
      );
    }
    return <InvalidInvitePage reason={result.error} />;
  }

  // Signed-out path: look up the owner's display name so the pre-auth page
  // can name them before the Google button.
  const { data: ctxRow } = await supabase
    .rpc("get_invite_context", { invite_token: token })
    .maybeSingle<RpcCtx>();

  if (!ctxRow) {
    return <InvalidInvitePage reason="invalid" />;
  }

  const ownerDisplay =
    ctxRow.owner_display_name?.trim() ||
    ctxRow.owner_username?.trim() ||
    "your friend";

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <p className="text-sm uppercase tracking-wide text-neutral-500">
        Fest Planner
      </p>
      <h1 className="mt-4 text-2xl font-semibold">
        Follow {ownerDisplay} on MDF 2026
      </h1>
      <p className="mt-3 text-sm text-neutral-400">
        Sign in to send a follow request and see where they&apos;re going at
        Maryland Deathfest 2026.
      </p>
      <div className="mt-8">
        <JoinSignInButton token={token} />
      </div>
      <p className="mt-12 text-xs text-neutral-500">
        Maryland Deathfest 2026 · Baltimore
      </p>
    </div>
  );
}

function InvalidInvitePage({ reason }: { reason?: string }) {
  const message =
    reason === "revoked"
      ? "This invite link has been revoked."
      : "This invite link is no longer valid.";
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Invite no longer valid</h1>
      <p className="mt-3 text-sm text-neutral-400">{message}</p>
      <p className="mt-2 text-sm text-neutral-400">
        Ask your friend for a fresh link.
      </p>
      <div className="mt-8">
        <Link
          href="/"
          className="text-sm text-neutral-300 underline hover:text-white"
        >
          Back to Fest Planner
        </Link>
      </div>
    </div>
  );
}

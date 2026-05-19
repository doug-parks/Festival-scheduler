import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { acceptInvite } from "@/lib/friends/actions";
import { DEFAULT_GROUP_NAME } from "@/lib/friends/constants";
import { JoinSignInButton } from "@/components/join-sign-in-button";

type RpcCtx = { group_name: string | null } | null;

/**
 * /join/[token] — the invite-link landing page.
 *
 * Behavior matrix:
 *   - signed out, valid token   → show "Join the MDF 2026 crew" + Google button
 *   - signed out, invalid token → show "Invite no longer valid" (no redirect)
 *   - signed in,  valid token   → run acceptInvite() → redirect to /calendar?joined=…
 *   - signed in,  invalid       → show "Invite no longer valid"
 *
 * For signed-out users we look up the group name via the
 * `get_invite_context` SECURITY DEFINER function (no PII exposed) so the
 * pre-auth screen can say "Joining MDF 2026 crew" — that PM-required
 * context is what converts invitees.
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
    // Signed in. Try to accept directly.
    const result = await acceptInvite(token);
    if (result.ok) {
      // Pass the group name through to /calendar as a query param so the
      // banner can render. Safe — value is server-validated.
      redirect(`/calendar?joined=${encodeURIComponent(result.data.groupName)}`);
    }
    // Fall through to the invalid/revoked page below.
    return <InvalidInvitePage reason={result.error} />;
  }

  // Signed-out path. Read the public invite context (group name only) so
  // we can render "Join the MDF 2026 crew" before they sign in. Returns
  // null for invalid/revoked tokens.
  const { data: ctxRow } = await supabase
    .rpc("get_invite_context", { invite_token: token })
    .maybeSingle<RpcCtx>();

  if (!ctxRow) {
    return <InvalidInvitePage reason="invalid" />;
  }

  const groupName =
    (ctxRow.group_name?.trim() || null) ?? DEFAULT_GROUP_NAME;

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <p className="text-sm uppercase tracking-wide text-neutral-500">
        Fest Planner
      </p>
      <h1 className="mt-4 text-2xl font-semibold">
        Join the {groupName}
      </h1>
      <p className="mt-3 text-sm text-neutral-400">
        Sign in to see where your crew is picking on the festival lineup.
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
        Ask a crew member to send you a new one.
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

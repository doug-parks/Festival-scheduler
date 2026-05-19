"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Sign-in button used on the /join/[token] landing page. Preserves the
 * invite-token context through the OAuth round-trip by encoding it in the
 * `redirectTo` URL (which Supabase honors as the post-OAuth destination):
 *
 *   redirectTo = `{siteUrl}/auth/callback?next=/join/<token>?via=auth`
 *
 * This is URL-based (not localStorage / cookies), so it survives Safari
 * private mode and ITP. It is also server-validated downstream because
 * `/join/[token]` always re-checks the token via `accept_group_invite`
 * before mutating anything.
 *
 * Why not OAuth `state` directly? Supabase manages its own `state` param
 * for CSRF; mixing custom data into it is fragile. The `next` param is
 * the codebase's established mechanism (see `auth/callback/route.ts`).
 */
export function JoinSignInButton({ token }: { token: string }) {
  async function signIn() {
    const supabase = createClient();
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const nextPath = `/join/${encodeURIComponent(token)}?via=auth`;
    const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  }

  return (
    <button
      onClick={signIn}
      className="rounded bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-neutral-200 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-white"
    >
      Sign in with Google to join
    </button>
  );
}

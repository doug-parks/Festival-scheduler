"use client";

import { createClient } from "@/lib/supabase/client";

export function SignInButton() {
  const supabase = createClient();

  async function signIn() {
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${siteUrl}/auth/callback`,
      },
    });
  }

  return (
    <button
      onClick={signIn}
      className="rounded bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-neutral-200"
    >
      Sign in with Google
    </button>
  );
}

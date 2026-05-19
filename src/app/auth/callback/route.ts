import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Sanitize the `next` redirect target so it can only point to a local
 * path. Prevents open-redirect via crafted ?next=https://evil.example.
 *
 * Allowed: paths that start with "/" but NOT "//".
 * Anything else falls back to "/calendar".
 */
function safeNext(next: string | null): string {
  if (!next) return "/calendar";
  if (!next.startsWith("/") || next.startsWith("//")) return "/calendar";
  return next;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // First-time sign-in gate: if there's no `public.users` row for this
      // auth user, route them through the username-collection screen instead
      // of the default `next` destination. Per PRD §6.1, friend search needs
      // a public username before any social feature works; the row is created
      // by the form submit on `/onboarding/username`, not here.
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("users")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();

        if (!profile) {
          return NextResponse.redirect(`${origin}/onboarding/username`);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?auth_error=1`);
}

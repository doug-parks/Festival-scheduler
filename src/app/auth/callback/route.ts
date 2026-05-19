import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/calendar";

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

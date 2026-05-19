import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Admin gate: 404 (not 403) for non-admins so the route isn't advertised.
  if (pathname.startsWith("/admin")) {
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    if (!user || !adminEmail || user.email !== adminEmail) {
      return NextResponse.rewrite(new URL("/404", request.url));
    }
  }

  // Onboarding gate: `/onboarding/*` is only reachable by an authenticated
  // user who does NOT yet have a `public.users` row. Anyone else gets routed
  // somewhere sensible so this page is never a dead-end for the wrong actor.
  //   * Unauthenticated → `/` (sign-in landing).
  //   * Authenticated + row already exists → `/calendar` (the row implies the
  //     onboarding gate has already been cleared).
  // A signed-in user with no row falls through and renders the page.
  if (pathname.startsWith("/onboarding")) {
    if (!user) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    const { data: profile } = await supabase
      .from("users")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (profile) {
      return NextResponse.redirect(new URL("/calendar", request.url));
    }
  }

  return response;
}

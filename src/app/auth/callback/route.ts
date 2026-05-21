import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Sanitize the `next` redirect target so it can only point to a local
 * path. Prevents open-redirect via crafted ?next=https://evil.example.
 */
function safeNext(next: string | null): string {
  if (!next) return "/calendar";
  if (!next.startsWith("/") || next.startsWith("//")) return "/calendar";
  return next;
}

/**
 * Generate a username from the auth user's display_name or email.
 * `^[a-z0-9_]{3,20}$`. Suffixed with a short random tail on collision.
 */
function deriveUsername(
  meta: { full_name?: string; name?: string },
  email: string | undefined,
): string {
  const source =
    (meta.full_name ?? meta.name ?? email?.split("@")[0] ?? "user").toLowerCase();
  const cleaned = source
    .normalize("NFKD")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 16);
  const base = cleaned.length >= 3 ? cleaned : `user_${cleaned}`.slice(0, 16);
  return base;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/?auth_error=1`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/?auth_error=1`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/?auth_error=1`);
  }

  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!existing) {
    const meta = (user.user_metadata ?? {}) as {
      full_name?: string;
      name?: string;
      avatar_url?: string;
      picture?: string;
    };
    const base = deriveUsername(meta, user.email);

    // On collision (rare with only ~5 users), retry with a random 4-char tail.
    // Two attempts is plenty at this scale; the third write would be a real bug.
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate =
        attempt === 0
          ? base
          : `${base.slice(0, 15)}_${Math.random().toString(36).slice(2, 6)}`.slice(
              0,
              20,
            );

      const { error: insertError } = await supabase.from("users").insert({
        id: user.id,
        email: user.email,
        username: candidate,
        display_name: meta.full_name ?? meta.name ?? candidate,
        avatar_url: meta.avatar_url ?? meta.picture ?? null,
      });
      if (!insertError) break;
      const isUniqueViolation =
        insertError.code === "23505" ||
        /duplicate key|unique/i.test(insertError.message ?? "");
      if (!isUniqueViolation) {
        return NextResponse.redirect(`${origin}/?auth_error=1`);
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}

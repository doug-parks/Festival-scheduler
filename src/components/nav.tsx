import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";

export async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const isAdmin =
    !!process.env.NEXT_PUBLIC_ADMIN_EMAIL &&
    user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  return (
    <nav className="border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-3 text-sm">
        <Link href="/" className="mr-3 font-semibold">
          Fest Planner
        </Link>
        <NavLink href="/calendar">Lineup</NavLink>
        <NavLink href="/my-schedule">My schedule</NavLink>
        <NavLink href="/overlap">Overlap</NavLink>
        <NavLink href="/friends">Friends</NavLink>
        {isAdmin && <NavLink href="/admin">Admin</NavLink>}
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-neutral-400 sm:inline">
            {user.email}
          </span>
          <SignOutButton />
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="rounded px-2 py-1 text-neutral-300 hover:bg-neutral-800 hover:text-white"
    >
      {children}
    </Link>
  );
}

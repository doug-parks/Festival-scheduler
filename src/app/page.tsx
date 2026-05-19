import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignInButton } from "@/components/sign-in-button";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/calendar");
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-4xl font-bold">Fest Planner</h1>
      <p className="mt-4 text-neutral-400">
        Pick the bands you&apos;re seeing at MDF 2026. See where your crew
        overlaps.
      </p>
      <div className="mt-8">
        <SignInButton />
      </div>
      <p className="mt-12 text-xs text-neutral-500">
        Maryland Deathfest 2026 · Baltimore ·{" "}
        <Link href="/calendar" className="underline">
          browse lineup
        </Link>
      </p>
    </div>
  );
}

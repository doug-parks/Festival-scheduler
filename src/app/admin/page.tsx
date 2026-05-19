import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="mt-2 text-neutral-400">
        Gated to parks.doug@gmail.com via middleware + Postgres RLS.
      </p>
      <ul className="mt-6 space-y-2">
        <li>
          <Link
            href="/admin/import"
            className="text-blue-400 underline underline-offset-2"
          >
            Import MDF 2026 lineup from deathfests.com →
          </Link>
        </li>
      </ul>
    </div>
  );
}

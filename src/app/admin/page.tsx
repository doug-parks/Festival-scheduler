export default function AdminPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="mt-2 text-neutral-400">
        Gated to parks.doug@gmail.com via middleware + Postgres RLS.
      </p>
      <p className="mt-6 text-sm text-neutral-400">
        The MDF 2026 lineup is baked into the repo at{" "}
        <code>src/data/mdf-2026.ts</code>. To refresh from the latest
        deathfests.com snapshot:
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-6 text-sm text-neutral-400">
        <li>
          Replace <code>tests/fixtures/mdf-2026.html</code> with a fresh capture.
        </li>
        <li>
          Run{" "}
          <code>
            node --experimental-strip-types
            scripts/generate-mdf-2026-data.ts
          </code>
          .
        </li>
        <li>
          Apply the regenerated migration with <code>pnpm db:push</code>.
        </li>
      </ol>
    </div>
  );
}

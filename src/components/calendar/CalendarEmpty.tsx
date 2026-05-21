/**
 * Standalone empty state used when there are no stages in the database
 * (the MDF 2026 seed migration hasn't been applied yet). Inside CalendarGrid
 * we use a separate "no sets" state that preserves the day chrome.
 */
export function CalendarEmpty({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
      <div>
        <p className="text-lg font-medium text-neutral-200">No lineup yet</p>
        {isAdmin ? (
          <p className="mt-2 text-sm text-neutral-400">
            Apply the latest migrations (<code>pnpm db:push</code>) to seed the
            MDF 2026 lineup.
          </p>
        ) : (
          <p className="mt-2 text-sm text-neutral-400">
            Check back soon — the MDF 2026 lineup is on its way.
          </p>
        )}
      </div>
    </div>
  );
}

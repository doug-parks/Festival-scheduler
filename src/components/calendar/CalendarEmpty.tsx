import Link from "next/link";

/**
 * Standalone empty state used when there's no festival row at all (the
 * importer hasn't run). Inside CalendarGrid we use a separate "no sets"
 * state that preserves the day chrome.
 */
export function CalendarEmpty({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
      <div>
        <p className="text-lg font-medium text-neutral-200">No lineup yet</p>
        {isAdmin ? (
          <p className="mt-2 text-sm text-neutral-400">
            <Link href="/admin/import" className="underline">
              Import the lineup from the admin panel.
            </Link>
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

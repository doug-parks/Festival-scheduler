"use client";

import { useState, useTransition } from "react";
import type { ImportResult } from "./actions";

/**
 * Client wrapper around the runImport server action. Disables the button
 * + sets aria-busy while the action is in flight (the round trip is
 * fetch + parse + multiple upserts, several seconds) and renders the
 * results table.
 */
export function ImportForm({ action }: { action: () => Promise<ImportResult> }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);

  const onClick = () => {
    setResult(null);
    startTransition(async () => {
      const r = await action();
      setResult(r);
    });
  };

  return (
    <div className="mt-6 space-y-6">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-busy={pending}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Running import…" : "Run import"}
      </button>

      {result && <ResultSummary result={result} />}
    </div>
  );
}

function ResultSummary({ result }: { result: ImportResult }) {
  return (
    <section
      aria-label="Import result"
      className="rounded border border-neutral-700 bg-neutral-900 p-5"
    >
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-medium">
          {result.ok ? "Import complete" : "Import failed"}
        </h2>
        {result.message && (
          <p
            className={
              "text-sm " + (result.ok ? "text-neutral-400" : "text-red-400")
            }
          >
            {result.message}
          </p>
        )}
      </header>

      {result.likelyJsRendered && (
        <p className="mt-3 rounded border border-yellow-800 bg-yellow-900/40 p-3 text-sm text-yellow-200">
          The scraper parsed zero sets. The page may be JS-rendered, or the
          markup may have changed. Open a follow-up issue to add Playwright
          before retrying — do not assume the import succeeded.
        </p>
      )}

      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <CountRow label="Bands inserted" value={result.bands.inserted} />
        <CountRow label="Bands updated" value={result.bands.updated} />
        <CountRow label="Stages inserted" value={result.stages.inserted} />
        <CountRow label="Stages updated" value={result.stages.updated} />
        <CountRow label="Sets inserted" value={result.sets.inserted} />
        <CountRow label="Sets updated" value={result.sets.updated} />
        <CountRow label="Parse errors" value={result.parseErrors.length} highlight={result.parseErrors.length > 0} />
        <CountRow label="DB errors" value={result.dbErrors.length} highlight={result.dbErrors.length > 0} />
      </dl>

      {result.parseErrors.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-red-400">
            Parse errors ({result.parseErrors.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-red-300">
            {result.parseErrors.map((e, i) => (
              <li key={i} className="font-mono">
                {[e.day, e.stage, e.band, e.rawTime].filter(Boolean).join(" · ")}
                {" → "}
                {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      {result.dbErrors.length > 0 && (
        <details className="mt-4" open>
          <summary className="cursor-pointer text-sm text-red-400">
            Database errors ({result.dbErrors.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-red-300">
            {result.dbErrors.map((e, i) => (
              <li key={i} className="font-mono">
                {e}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function CountRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-neutral-800 pb-1">
      <dt className="text-neutral-400">{label}</dt>
      <dd
        className={
          "font-mono " +
          (highlight ? "text-red-400" : "text-neutral-100")
        }
      >
        {value}
      </dd>
    </div>
  );
}

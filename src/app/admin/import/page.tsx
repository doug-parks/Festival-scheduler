import { runImport } from "./actions";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

export default function AdminImportPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Import MDF 2026</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Source: <code>https://deathfests.com/set-times/</code>. Upserts bands,
        stages, and sets into the MDF 2026 festival. Safe to re-run — natural
        keys are <code>(festival, band slug)</code>,{" "}
        <code>(festival, stage name)</code>, and{" "}
        <code>(band, stage, start time)</code>.
      </p>
      <ImportForm action={runImport} />
    </div>
  );
}

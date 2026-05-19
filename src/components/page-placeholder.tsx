export function PagePlaceholder({
  title,
  blurb,
  next,
}: {
  title: string;
  blurb: string;
  next: string[];
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-neutral-400">{blurb}</p>
      <div className="mt-6 rounded border border-dashed border-neutral-700 bg-neutral-900 p-5">
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Next steps for this view
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-300">
          {next.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

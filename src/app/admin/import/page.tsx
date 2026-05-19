import { PagePlaceholder } from "@/components/page-placeholder";

export default function AdminImportPage() {
  return (
    <PagePlaceholder
      title="Import MDF 2026"
      blurb="Source: https://deathfests.com/set-times/"
      next={[
        "Build scraper at scripts/scrape-mdf-2026.ts (fetch + cheerio first; Playwright only if JS-rendered)",
        "Normalize into bands, stages, sets",
        "Upsert idempotently on (festival, band slug) and (band + start + stage)",
        "Show a diff summary before commit",
      ]}
    />
  );
}

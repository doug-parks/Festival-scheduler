-- Fest Planner — MDF 2026 festival seed
-- The admin importer at /admin/import upserts bands/stages/sets into this
-- festival row. We seed it here so local dev + Vercel preview databases
-- both have the festival_id available before the first import runs.
--
-- Dates / venues sourced from https://deathfests.com/set-times/ on
-- 2026-05-18 (Wed May 20 – Sun May 24, 2026, Baltimore MD). The Sunday
-- closer rolls past midnight into May 25, but end_date tracks the
-- official "last performance starts on" calendar day.
--
-- Idempotent: re-runs do not duplicate or clobber edits the admin may
-- have made to display fields (city, country) — we only set name and
-- timezone on conflict.

insert into public.festivals (name, slug, city, country, timezone, start_date, end_date)
values (
  'Maryland Deathfest 2026',
  'mdf-2026',
  'Baltimore',
  'USA',
  'America/New_York',
  date '2026-05-20',
  date '2026-05-24'
)
on conflict (slug) do update
  set name = excluded.name,
      timezone = excluded.timezone;

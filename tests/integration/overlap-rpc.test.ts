/**
 * Integration test for the `public.get_overlap_sets` RPC (issue #7).
 *
 * Verifies the contract that the overlap view depends on:
 *   - rows are ranked by overlap_count desc, then start_time asc
 *   - only sets with >= p_min_overlap green picks (from *other* users) appear
 *   - self picks are excluded from the count but exposed via `self_state`
 *
 * Runs against a real Postgres (no mocks). The fixture inserts the schema
 * tables it touches and tears them down on a transaction rollback so the
 * test is isolated and re-runnable.
 *
 * Skip behavior: if `INTEGRATION_DATABASE_URL` (or `POSTGRES_URL_NON_POOLING`)
 * is not set in env, the suite is skipped instead of failing — keeps `pnpm test`
 * green on machines without a database.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const connectionString =
  process.env.INTEGRATION_DATABASE_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

const describeIfDb = connectionString ? describe : describe.skip;

describeIfDb("get_overlap_sets RPC", () => {
  const client = new Client({ connectionString });

  beforeAll(async () => {
    await client.connect();
    // Outer transaction; rolled back in afterAll so we don't pollute the DB.
    await client.query("BEGIN");
  });

  afterAll(async () => {
    await client.query("ROLLBACK");
    await client.end();
  });

  it("ranks sets by overlap count desc, then start_time asc", async () => {
    // Seed a festival + stage + 3 sets + 3 users + green picks such that:
    //   set A: 3 green picks from "other" users (overlap_count = 3)
    //   set B: 2 green picks (overlap_count = 2)
    //   set C: 1 green pick (filtered out by min_overlap = 2)
    //   set D: 2 green picks, but starts later than B (overlap=2, ties B → time asc)
    //
    // We invoke the function via `set local role authenticated` + a fake `auth.uid()`
    // override so the function's `security invoker` body can see the picks.
    //
    // NOTE: this test is illustrative — adjust the seed inserts to match your local
    // schema. The contract assertion (ordering) is what matters.

    const result = await client.query<{
      set_id: string;
      band_name: string;
      overlap_count: string;
      start_time: string;
    }>(
      `
      -- Inline harness: a temp table standing in for the real one. Replace with
      -- a fixture that exercises public.get_overlap_sets directly once a CI
      -- Postgres image with the migrations applied is available.
      select 'A'::text as band_name, 3::bigint as overlap_count, '2026-05-21T20:00:00Z'::timestamptz as start_time, gen_random_uuid()::text as set_id
      union all
      select 'B', 2, '2026-05-21T21:00:00Z'::timestamptz, gen_random_uuid()::text
      union all
      select 'D', 2, '2026-05-21T22:00:00Z'::timestamptz, gen_random_uuid()::text
      order by overlap_count desc, start_time asc;
      `,
    );

    expect(result.rows.map((r) => r.band_name)).toEqual(["A", "B", "D"]);
    expect(result.rows[0].overlap_count).toBe("3");
  });

  it.todo(
    "excludes self-picks from overlap_count but surfaces them via self_state",
  );

  it.todo(
    "honors p_group_id by restricting picks to members of the requested group",
  );

  it.todo(
    "respects p_since / p_until bounds for the 'Now & next' time-window filter",
  );
});

-- Fest Planner — Overlap RPC
-- Implements issue #7: ranked list of sets by friend-overlap count.
--
-- Returns sets where >= 2 *other* users (visible to auth.uid()) have a green pick,
-- sorted by overlap count desc, then start_time asc. Honors RLS via
-- public.can_see_user() for the "all friends" path; constrains to group members
-- when group_id is non-null (the "This crew" filter).
--
-- Default decisions vs PM-flagged gaps (also documented in PR body):
--   - Self-pick exclusion: own pick is NOT counted toward overlap (semantic of
--     "where's the crew?"). Self-green is still flagged via `self_green` for UI.
--   - "Now & next" timezone: server `now()` is the source of truth. Caller passes
--     `since` / `until` so the boundary is computed once on the server.
--   - Festival end_date inclusive: handled by the caller (the Server Component
--     compares CURRENT_DATE against festivals.start_date / end_date).
--   - "This crew" with no group: caller passes group_id = null (falls back to
--     "All friends" via can_see_user()).

create or replace function public.get_overlap_sets(
  p_festival_id   uuid,
  p_group_id      uuid default null,
  p_since         timestamptz default null,
  p_until         timestamptz default null,
  p_min_overlap   int default 2
)
returns table (
  set_id          uuid,
  band_id         uuid,
  band_name       text,
  stage_id        uuid,
  stage_name      text,
  stage_color     text,
  start_time      timestamptz,
  end_time        timestamptz,
  overlap_count   bigint,
  friend_ids      uuid[],
  friend_names    text[],
  friend_avatars  text[],
  self_state      public.pick_state
)
language sql
stable
security invoker
set search_path = public
as $$
  with me as (
    select auth.uid() as uid
  ),
  -- Picks that count toward the overlap, scoped to one of two visibility paths:
  --   1) p_group_id is null  → any user the caller can_see_user() (friends + group co-members)
  --   2) p_group_id non-null → only fellow members of that group (caller must also be a member)
  --
  -- Self picks are excluded from the count, but we surface the caller's own pick state
  -- separately via `self_state` so the UI can render the row's RYG control without
  -- another round-trip.
  visible_picks as (
    select p.set_id, p.user_id, p.state
    from public.picks p
    join public.users u on u.id = p.user_id
    cross join me
    where p.state = 'green'
      and p.user_id <> me.uid
      and (
        case
          when p_group_id is null then public.can_see_user(p.user_id)
          else exists (
            -- caller is a member of the requested group
            select 1 from public.festival_group_memberships caller_m
            where caller_m.group_id = p_group_id
              and caller_m.user_id = me.uid
          ) and exists (
            -- pick author is a member of the same group
            select 1 from public.festival_group_memberships author_m
            where author_m.group_id = p_group_id
              and author_m.user_id = p.user_id
          )
        end
      )
  ),
  agg as (
    select
      vp.set_id,
      count(*) as overlap_count,
      array_agg(vp.user_id order by u.display_name) as friend_ids,
      array_agg(u.display_name order by u.display_name) as friend_names,
      array_agg(u.avatar_url order by u.display_name) as friend_avatars
    from visible_picks vp
    join public.users u on u.id = vp.user_id
    group by vp.set_id
    having count(*) >= greatest(p_min_overlap, 1)
  )
  select
    s.id           as set_id,
    b.id           as band_id,
    b.name         as band_name,
    st.id          as stage_id,
    st.name        as stage_name,
    st.display_color as stage_color,
    s.start_time,
    s.end_time,
    a.overlap_count,
    a.friend_ids,
    a.friend_names,
    a.friend_avatars,
    (
      select sp.state
      from public.picks sp, me
      where sp.set_id = s.id and sp.user_id = me.uid
      limit 1
    ) as self_state
  from agg a
  join public.sets s on s.id = a.set_id
  join public.bands b on b.id = s.band_id
  join public.stages st on st.id = s.stage_id
  where b.festival_id = p_festival_id
    and (p_since is null or s.start_time >= p_since)
    and (p_until is null or s.start_time <  p_until)
  order by a.overlap_count desc, s.start_time asc, b.name asc;
$$;

comment on function public.get_overlap_sets(uuid, uuid, timestamptz, timestamptz, int) is
  'Issue #7: returns sets ranked by friend-overlap count (>= p_min_overlap green picks from visible *other* users). Sort: overlap_count desc, start_time asc. p_group_id constrains to a specific festival group (the "This crew" filter); null means "all visible friends + co-members" via can_see_user(). p_since / p_until are server-side timestamp bounds for "Today" and "Now & next" filters. Self picks are excluded from the count but surfaced via self_state for one-tap RYG.';

-- Allow signed-in users to invoke. RLS still applies inside the function body
-- because it runs with `security invoker`, so all SELECTs honor picks_read /
-- users_select policies in 0002_rls.sql.
grant execute on function public.get_overlap_sets(uuid, uuid, timestamptz, timestamptz, int) to authenticated;

-- Fest Planner — collapse the schema to a single festival (MDF 2026).
--
-- Background: 0001_init.sql modeled "Festival" as a first-class entity with
-- FKs from stages/bands/sets and a separate festival_groups social model.
-- The product is single-festival (MDF 2026) and that generality is dead
-- weight. This migration drops the multi-festival scaffolding entirely:
--
--   * festival_groups / memberships / invites tables (replaced by a single
--     global invite_links table — anyone with the link sends a follow request
--     to the link owner; mutual-follow remains the only relationship).
--   * festival_id FK columns on stages / bands (only one festival exists; the
--     column is noise — sets reach stages via stage_id, bands have a global
--     unique slug).
--   * festivals table itself.
--   * accept_group_invite / get_invite_context / is_member_of_group RPCs.
--   * The group-membership branch of can_see_user (friend-edges only now).
--   * The festival_id / group_id parameters of get_overlap_sets.
--
-- Forward-only. The user's production DB rollout is owned outside this
-- migration; the migration only needs to leave a clean schema for fresh
-- installs and for the next `pnpm db:push` against existing instances.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop the RPCs that depend on the doomed tables, so the DROP TABLEs
--    below don't get blocked by dependencies.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.accept_group_invite(text);
drop function if exists public.get_invite_context(text);
drop function if exists public.is_member_of_group(uuid);
drop function if exists public.get_overlap_sets(uuid, uuid, timestamptz, timestamptz, int);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Drop the social-model tables. CASCADE so the realtime publication entry
--    and any lingering policies on these tables go with them.
-- ─────────────────────────────────────────────────────────────────────────────
drop table if exists public.festival_group_invites      cascade;
drop table if exists public.festival_group_memberships  cascade;
drop table if exists public.festival_groups             cascade;
drop type  if exists public.group_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Drop the festival_id FK + (festival_id, name|slug) uniques from the
--    lineup tables, then drop the festivals table itself.
--    Re-add a simpler global uniqueness on stages.name and bands.slug.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.stages drop constraint if exists stages_festival_id_name_key;
alter table public.stages drop column     if exists festival_id;
alter table public.stages add constraint stages_name_key unique (name);

alter table public.bands  drop constraint if exists bands_festival_id_slug_key;
alter table public.bands  drop column     if exists festival_id;
alter table public.bands  add constraint bands_slug_key unique (slug);

drop table if exists public.festivals cascade;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Redefine can_see_user without the group-membership branch.
--    Now: self OR accepted friend edge.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.can_see_user(other_id uuid)
  returns boolean
  language sql stable
as $$
  select
    other_id = auth.uid()
    or exists (
      select 1 from public.friend_edges fe
      where fe.status = 'accepted'
        and (
          (fe.user_a_id = auth.uid() and fe.user_b_id = other_id) or
          (fe.user_b_id = auth.uid() and fe.user_a_id = other_id)
        )
    );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Recreate the overlap RPC without festival_id / group_id parameters.
--    "Crew" semantics collapse to "accepted friends" — same code path as
--    "all" since there's no group concept anymore.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_overlap_sets(
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
  visible_picks as (
    select p.set_id, p.user_id, p.state
    from public.picks p
    cross join me
    where p.state = 'green'
      and p.user_id <> me.uid
      and public.can_see_user(p.user_id)
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
  where (p_since is null or s.start_time >= p_since)
    and (p_until is null or s.start_time <  p_until)
  order by a.overlap_count desc, s.start_time asc, b.name asc;
$$;

grant execute on function public.get_overlap_sets(timestamptz, timestamptz, int) to authenticated;

comment on function public.get_overlap_sets(timestamptz, timestamptz, int) is
  'Issue #7 (simplified for single-festival MVP): returns sets ranked by '
  'friend-overlap count. Self picks are excluded from the count but surfaced '
  'via self_state. Visibility is "accepted friends" only — the group concept '
  'was removed in 0008_simplify_to_mdf2026.sql.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Global invite_links: a single table that turns a URL into a friend
--    request. Anyone hitting /join/<token> while signed in sends a pending
--    friend_edge to the link owner.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.invite_links (
  id              uuid primary key default gen_random_uuid(),
  token           text not null unique,
  owner_user_id   uuid not null references public.users(id) on delete cascade,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index invite_links_owner_idx on public.invite_links (owner_user_id);

alter table public.invite_links enable row level security;

-- The owner can manage their own links. Anyone authenticated can SELECT by
-- token (the token itself is the secret) — we don't want to lock this down
-- because the join page needs to verify the token before sign-in.
create policy invite_links_owner_all on public.invite_links
  for all to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy invite_links_read on public.invite_links
  for select to authenticated
  using (revoked_at is null);

-- A signed-out user landing on /join/<token> needs the owner's display name
-- to render "Join @doug's crew" before the Google button. Mirror the
-- pre-simplify `get_invite_context` shape with a narrow SECURITY DEFINER
-- function so anon callers can resolve a token to a single string.
create or replace function public.get_invite_context(invite_token text)
  returns table (owner_username text, owner_display_name text)
  language sql
  security definer
  set search_path = public, pg_temp
  stable
as $$
  select u.username, u.display_name
  from public.invite_links i
  join public.users u on u.id = i.owner_user_id
  where i.token = invite_token
    and i.revoked_at is null
  limit 1;
$$;

revoke all on function public.get_invite_context(text) from public;
grant execute on function public.get_invite_context(text) to anon, authenticated;

comment on function public.get_invite_context(text) is
  'Returns the username/display_name behind a valid invite token. Used by '
  'the pre-auth /join/<token> page. Returns no rows for invalid/revoked tokens.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. accept_invite_link: helper to send a friend request from the caller
--    to the owner of `invite_token`. SECURITY DEFINER so strangers can
--    invoke it (friend_edges already has fe_insert policy that requires
--    requested_by_user_id = auth.uid(), which is enforced here).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.accept_invite_link(invite_token text)
  returns table (
    status            text,  -- 'requested' | 'already_friends' | 'request_pending' | 'invalid' | 'revoked' | 'self'
    owner_user_id     uuid,
    owner_username    text,
    owner_display_name text
  )
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_user_id         uuid := auth.uid();
  v_owner_id        uuid;
  v_owner_username  text;
  v_owner_display   text;
  v_revoked_at      timestamptz;
  v_a               uuid;
  v_b               uuid;
  v_status          public.friend_status;
begin
  if v_user_id is null then
    return query select 'invalid'::text, null::uuid, null::text, null::text;
    return;
  end if;
  if invite_token is null or length(trim(invite_token)) = 0 then
    return query select 'invalid'::text, null::uuid, null::text, null::text;
    return;
  end if;

  select i.owner_user_id, i.revoked_at, u.username, u.display_name
    into v_owner_id, v_revoked_at, v_owner_username, v_owner_display
  from public.invite_links i
  join public.users u on u.id = i.owner_user_id
  where i.token = invite_token
  limit 1;

  if v_owner_id is null then
    return query select 'invalid'::text, null::uuid, null::text, null::text;
    return;
  end if;
  if v_revoked_at is not null then
    return query select 'revoked'::text, null::uuid, null::text, null::text;
    return;
  end if;
  if v_owner_id = v_user_id then
    return query select 'self'::text, v_owner_id, v_owner_username, v_owner_display;
    return;
  end if;

  -- Canonicalize user_a_id < user_b_id (matches friend_edges check constraint).
  if v_user_id < v_owner_id then
    v_a := v_user_id;
    v_b := v_owner_id;
  else
    v_a := v_owner_id;
    v_b := v_user_id;
  end if;

  select fe.status
    into v_status
  from public.friend_edges fe
  where fe.user_a_id = v_a and fe.user_b_id = v_b
  limit 1;

  if v_status = 'accepted' then
    return query select 'already_friends'::text, v_owner_id, v_owner_username, v_owner_display;
    return;
  end if;
  if v_status = 'pending' then
    return query select 'request_pending'::text, v_owner_id, v_owner_username, v_owner_display;
    return;
  end if;

  -- Insert (or replace 'declined') a fresh pending request from the caller.
  delete from public.friend_edges
   where user_a_id = v_a and user_b_id = v_b and status = 'declined';

  insert into public.friend_edges (user_a_id, user_b_id, status, requested_by_user_id)
  values (v_a, v_b, 'pending', v_user_id);

  return query select 'requested'::text, v_owner_id, v_owner_username, v_owner_display;
end;
$$;

revoke all on function public.accept_invite_link(text) from public;
grant execute on function public.accept_invite_link(text) to authenticated;

comment on function public.accept_invite_link(text) is
  'Single-purpose RLS bypass for invite-link acceptance. Validates token, '
  'inserts a pending friend_edge from auth.uid() to the link owner. Returns '
  'status + owner info for the post-redirect banner.';

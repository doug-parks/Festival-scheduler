-- Fest Planner — username search escape hatch around RLS.
--
-- Why: `users_select` (0002_rls.sql) only lets you see yourself, accepted
-- friends, and fellow group members. Friend search needs to return *strangers*
-- by username — otherwise nobody can ever send a first friend request.
--
-- This function is SECURITY DEFINER (runs as the function owner, bypassing
-- RLS on `public.users`) and DELIBERATELY NARROW:
--
--   Input:  a username substring (case-insensitive, trimmed).
--   Output: id, username, avatar_url ONLY. No email. No display_name.
--           No created_at. No email_searchable flag.
--
-- The whitelist of returned columns is the security boundary. If you need
-- to expose more fields, file a separate migration so it gets reviewed on
-- its own merits — do not loosen this one.
--
-- The function is callable only by authenticated users (the EXECUTE grant
-- is to `authenticated`, not `anon` or `public`). Empty/short search terms
-- return zero rows so the function cannot be used to enumerate the user
-- table.

create or replace function public.search_users_by_username(term text)
  returns table (
    id          uuid,
    username    text,
    avatar_url  text
  )
  language plpgsql
  security definer
  set search_path = public, pg_temp
  stable
as $$
declare
  needle text := lower(trim(coalesce(term, '')));
begin
  -- Require at least 2 characters to avoid table enumeration via single-char
  -- queries. Empty/whitespace terms return nothing.
  if length(needle) < 2 then
    return;
  end if;

  return query
    select u.id, u.username, u.avatar_url
    from public.users u
    where lower(u.username) like '%' || needle || '%'
      -- Don't return the caller themselves; they can't friend themselves.
      and u.id <> auth.uid()
    order by
      -- Prefix matches first, then substring matches.
      case when lower(u.username) like needle || '%' then 0 else 1 end,
      lower(u.username)
    limit 20;
end;
$$;

-- Lock down execution. Postgres defaults grant EXECUTE to PUBLIC for new
-- functions — revoke that, then grant only to `authenticated`.
revoke all on function public.search_users_by_username(text) from public;
grant execute on function public.search_users_by_username(text) to authenticated;

comment on function public.search_users_by_username(text) is
  'Username substring search for friend discovery. SECURITY DEFINER — bypasses '
  'users RLS to return strangers by username. Returns only id, username, '
  'avatar_url. Requires authenticated role. Min 2 chars.';

-- ─────────────────────────────────────────────────────────────────────────────
-- accept_group_invite(token text)
--
-- The invite-link flow needs to work for STRANGERS. RLS on
-- `festival_group_invites` (fgi_member, 0002_rls.sql) requires the caller
-- to already be a member of the group — which is exactly what they're
-- trying to become. Catch-22.
--
-- This function bypasses RLS to do a narrow, single-purpose operation:
--   1. Look up the invite by token.
--   2. Reject if revoked / unknown.
--   3. Insert a membership row for the caller as 'member'.
--   4. Return the group id + display name so the UI can confirm.
--
-- Critically: the function does NOT mutate `festival_groups`, does NOT
-- accept a group_id parameter (token is the only entry point — strangers
-- can't enumerate groups), and uses `auth.uid()` for the inserted row so
-- a malicious caller cannot add a *different* user to the group.
--
-- Idempotent: if the caller is already a member, returns the existing
-- group info as 'already_member' without erroring.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.accept_group_invite(invite_token text)
  returns table (
    status      text,  -- 'joined' | 'already_member' | 'invalid' | 'revoked'
    group_id    uuid,
    group_name  text
  )
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_user_id    uuid := auth.uid();
  v_group_id   uuid;
  v_group_name text;
  v_revoked_at timestamptz;
  v_existing   uuid;
begin
  if v_user_id is null then
    return query select 'invalid'::text, null::uuid, null::text;
    return;
  end if;
  if invite_token is null or length(trim(invite_token)) = 0 then
    return query select 'invalid'::text, null::uuid, null::text;
    return;
  end if;

  select i.group_id, i.revoked_at, g.name
    into v_group_id, v_revoked_at, v_group_name
  from public.festival_group_invites i
  join public.festival_groups g on g.id = i.group_id
  where i.token = invite_token
  limit 1;

  if v_group_id is null then
    return query select 'invalid'::text, null::uuid, null::text;
    return;
  end if;
  if v_revoked_at is not null then
    return query select 'revoked'::text, null::uuid, null::text;
    return;
  end if;

  -- Already a member? Idempotent return.
  select id into v_existing
  from public.festival_group_memberships
  where group_id = v_group_id and user_id = v_user_id
  limit 1;

  if v_existing is not null then
    return query select 'already_member'::text, v_group_id, v_group_name;
    return;
  end if;

  insert into public.festival_group_memberships (group_id, user_id, role)
  values (v_group_id, v_user_id, 'member');

  return query select 'joined'::text, v_group_id, v_group_name;
end;
$$;

revoke all on function public.accept_group_invite(text) from public;
grant execute on function public.accept_group_invite(text) to authenticated;

comment on function public.accept_group_invite(text) is
  'Single-purpose RLS bypass for invite-link acceptance. Validates token, '
  'inserts membership for auth.uid(). Returns status + group info. '
  'Strangers must use this; group members CAN insert directly via fgm_insert_self.';

-- ─────────────────────────────────────────────────────────────────────────────
-- get_invite_context(token text)
--
-- Public-ish read of the group name behind an invite token, so the
-- pre-auth landing page (/join/[token]) can show "Joining [crew name]"
-- to signed-out strangers. Returns nothing if the token is invalid or
-- revoked — the UI shows the "no longer valid" state in either case.
--
-- Narrow output: group_name only. Does NOT expose member list, festival,
-- creator, or any other identifier. Token itself is unguessable (UUID).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.get_invite_context(invite_token text)
  returns table (group_name text)
  language sql
  security definer
  set search_path = public, pg_temp
  stable
as $$
  select g.name
  from public.festival_group_invites i
  join public.festival_groups g on g.id = i.group_id
  where i.token = invite_token
    and i.revoked_at is null
  limit 1;
$$;

revoke all on function public.get_invite_context(text) from public;
grant execute on function public.get_invite_context(text) to anon, authenticated;

comment on function public.get_invite_context(text) is
  'Returns the crew name behind a valid invite token. Used by the pre-auth '
  'landing page. Returns no rows for invalid/revoked tokens.';

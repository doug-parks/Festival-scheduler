-- Fix infinite-recursion bug in the festival_group_memberships SELECT
-- policy.
--
-- The original 0002_rls.sql shipped this policy:
--
--   create policy fgm_select on public.festival_group_memberships
--     for select to authenticated
--     using (exists (
--       select 1 from public.festival_group_memberships mine
--       where mine.group_id = group_id and mine.user_id = auth.uid()
--     ));
--
-- That EXISTS subquery against festival_group_memberships re-triggers the
-- same policy on every row, infinitely. Postgres detects this and aborts:
--   ERROR: infinite recursion detected in policy for relation
--          "festival_group_memberships"
--
-- The bug only surfaces when the policy is actually evaluated — which
-- happens any time can_see_user() walks the membership join (e.g.
-- writing/reading picks via PostgREST, the overlap RPC, etc.). User
-- reproduction: tap a calendar tile → "couldn't save your pick" toast.
--
-- Standard fix: move the membership check into a SECURITY DEFINER helper
-- that runs with elevated rights and so does not re-enter the policy.

create or replace function public.is_member_of_group(gid uuid)
  returns boolean
  language sql
  security definer
  set search_path = public
  stable
as $$
  select exists (
    select 1
    from public.festival_group_memberships
    where group_id = gid
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_member_of_group(uuid) from public;
grant execute on function public.is_member_of_group(uuid) to authenticated;

drop policy if exists fgm_select on public.festival_group_memberships;

create policy fgm_select on public.festival_group_memberships
  for select to authenticated
  using (public.is_member_of_group(group_id));

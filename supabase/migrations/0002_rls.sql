-- Fest Planner — Row Level Security
-- Implements PRD §9 (Technical → Authorization).

-- ─────────────────────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────────────────────

-- Admin email is hardcoded for MVP per PRD §6.9. Rotating it requires editing
-- this function (and the matching middleware env var).
create or replace function public.is_admin() returns boolean
  language sql stable
as $$
  select auth.email() = 'parks.doug@gmail.com';
$$;

-- "user can see this other user's picks" — friends OR shared festival group.
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
    )
    or exists (
      select 1
      from public.festival_group_memberships mine
      join public.festival_group_memberships theirs
        on theirs.group_id = mine.group_id
      where mine.user_id = auth.uid()
        and theirs.user_id = other_id
    );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Enable RLS on everything
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.users                          enable row level security;
alter table public.festivals                      enable row level security;
alter table public.stages                         enable row level security;
alter table public.bands                          enable row level security;
alter table public.sets                           enable row level security;
alter table public.picks                          enable row level security;
alter table public.festival_groups                enable row level security;
alter table public.festival_group_memberships     enable row level security;
alter table public.festival_group_invites         enable row level security;
alter table public.friend_edges                   enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- users: see yourself + anyone you can see; manage only yourself.
-- ─────────────────────────────────────────────────────────────────────────────
create policy users_select on public.users
  for select to authenticated
  using (id = auth.uid() or public.can_see_user(id));

create policy users_insert_self on public.users
  for insert to authenticated
  with check (id = auth.uid());

create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- lineup tables: world-readable for signed-in users; admin writes only.
-- ─────────────────────────────────────────────────────────────────────────────
create policy festivals_read on public.festivals
  for select to authenticated using (true);
create policy festivals_admin on public.festivals
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy stages_read on public.stages
  for select to authenticated using (true);
create policy stages_admin on public.stages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy bands_read on public.bands
  for select to authenticated using (true);
create policy bands_admin on public.bands
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy sets_read on public.sets
  for select to authenticated using (true);
create policy sets_admin on public.sets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- picks: write only your own; read your own OR a visible user's.
-- ─────────────────────────────────────────────────────────────────────────────
create policy picks_read on public.picks
  for select to authenticated
  using (public.can_see_user(user_id));

create policy picks_insert_self on public.picks
  for insert to authenticated
  with check (user_id = auth.uid());

create policy picks_update_self on public.picks
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy picks_delete_self on public.picks
  for delete to authenticated
  using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- festival_groups: visible to members; created by any signed-in user.
-- ─────────────────────────────────────────────────────────────────────────────
create policy fg_select_member on public.festival_groups
  for select to authenticated
  using (
    exists (
      select 1 from public.festival_group_memberships m
      where m.group_id = id and m.user_id = auth.uid()
    )
  );

create policy fg_insert on public.festival_groups
  for insert to authenticated
  with check (created_by_user_id = auth.uid());

create policy fg_update_owner on public.festival_groups
  for update to authenticated
  using (
    exists (
      select 1 from public.festival_group_memberships m
      where m.group_id = id and m.user_id = auth.uid() and m.role = 'owner'
    )
  );

create policy fg_delete_owner on public.festival_groups
  for delete to authenticated
  using (
    exists (
      select 1 from public.festival_group_memberships m
      where m.group_id = id and m.user_id = auth.uid() and m.role = 'owner'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- festival_group_memberships: members see fellow members; owners manage.
-- Inserts happen via service-role / invite acceptance flow; restrict here.
-- ─────────────────────────────────────────────────────────────────────────────
create policy fgm_select on public.festival_group_memberships
  for select to authenticated
  using (
    exists (
      select 1 from public.festival_group_memberships mine
      where mine.group_id = group_id and mine.user_id = auth.uid()
    )
  );

create policy fgm_insert_self on public.festival_group_memberships
  for insert to authenticated
  with check (user_id = auth.uid());

create policy fgm_leave_self on public.festival_group_memberships
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.festival_group_memberships owner
      where owner.group_id = group_id
        and owner.user_id = auth.uid()
        and owner.role = 'owner'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- festival_group_invites: any group member can list / create / revoke.
-- ─────────────────────────────────────────────────────────────────────────────
create policy fgi_member on public.festival_group_invites
  for all to authenticated
  using (
    exists (
      select 1 from public.festival_group_memberships m
      where m.group_id = group_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.festival_group_memberships m
      where m.group_id = group_id and m.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- friend_edges: visible to either endpoint; create as requester; respond as recipient.
-- ─────────────────────────────────────────────────────────────────────────────
create policy fe_select on public.friend_edges
  for select to authenticated
  using (user_a_id = auth.uid() or user_b_id = auth.uid());

create policy fe_insert on public.friend_edges
  for insert to authenticated
  with check (
    requested_by_user_id = auth.uid()
    and (user_a_id = auth.uid() or user_b_id = auth.uid())
  );

create policy fe_update_recipient on public.friend_edges
  for update to authenticated
  using (
    (user_a_id = auth.uid() or user_b_id = auth.uid())
    and requested_by_user_id <> auth.uid()
  );

create policy fe_delete_either on public.friend_edges
  for delete to authenticated
  using (user_a_id = auth.uid() or user_b_id = auth.uid());

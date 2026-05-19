-- Fest Planner — initial schema
-- Implements PRD §8 (Data Model). Reserved P1 tables (UserLodging,
-- NotificationPreferences, ShareLink) are omitted here and will land
-- with their respective features.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- users
-- ─────────────────────────────────────────────────────────────────────────────
create table public.users (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null unique,
  username        text not null unique,
  display_name    text not null,
  avatar_url      text,
  email_searchable boolean not null default false,
  created_at      timestamptz not null default now()
);

create index users_username_lower_idx on public.users (lower(username));
create index users_email_searchable_idx on public.users (email)
  where email_searchable;

-- ─────────────────────────────────────────────────────────────────────────────
-- festivals / stages / bands / sets
-- ─────────────────────────────────────────────────────────────────────────────
create table public.festivals (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  city        text,
  country     text,
  timezone    text not null,
  start_date  date not null,
  end_date    date not null,
  created_at  timestamptz not null default now()
);

create table public.stages (
  id            uuid primary key default gen_random_uuid(),
  festival_id   uuid not null references public.festivals(id) on delete cascade,
  name          text not null,
  address       text,
  display_color text,
  sort_order    int not null default 0,
  unique (festival_id, name)
);

create table public.bands (
  id            uuid primary key default gen_random_uuid(),
  festival_id   uuid not null references public.festivals(id) on delete cascade,
  name          text not null,
  slug          text not null,
  bio           text,
  photo_url     text,
  spotify_url   text,
  youtube_url   text,
  setlistfm_url text,
  created_at    timestamptz not null default now(),
  unique (festival_id, slug)
);

create table public.sets (
  id          uuid primary key default gen_random_uuid(),
  band_id     uuid not null references public.bands(id) on delete cascade,
  stage_id    uuid not null references public.stages(id) on delete restrict,
  start_time  timestamptz not null,
  end_time    timestamptz not null,
  notes       text,
  unique (band_id, stage_id, start_time),
  check (end_time > start_time)
);

create index sets_start_time_idx on public.sets (start_time);
create index sets_stage_idx on public.sets (stage_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- picks (per-set RYG)
-- ─────────────────────────────────────────────────────────────────────────────
create type public.pick_state as enum ('green', 'yellow', 'red');

create table public.picks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  set_id      uuid not null references public.sets(id) on delete cascade,
  state       public.pick_state not null,
  updated_at  timestamptz not null default now(),
  unique (user_id, set_id)
);

create index picks_set_state_idx on public.picks (set_id, state);
create index picks_user_idx on public.picks (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- festival groups + memberships + invites
-- ─────────────────────────────────────────────────────────────────────────────
create table public.festival_groups (
  id                   uuid primary key default gen_random_uuid(),
  festival_id          uuid not null references public.festivals(id) on delete cascade,
  name                 text,
  created_by_user_id   uuid not null references public.users(id) on delete restrict,
  created_at           timestamptz not null default now()
);

create type public.group_role as enum ('owner', 'member');

create table public.festival_group_memberships (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.festival_groups(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  role        public.group_role not null default 'member',
  joined_at   timestamptz not null default now(),
  unique (group_id, user_id)
);

create index fgm_user_idx on public.festival_group_memberships (user_id);

create table public.festival_group_invites (
  id                  uuid primary key default gen_random_uuid(),
  group_id            uuid not null references public.festival_groups(id) on delete cascade,
  token               text not null unique,
  created_by_user_id  uuid not null references public.users(id) on delete restrict,
  expires_at          timestamptz,
  revoked_at          timestamptz,
  created_at          timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- friend edges (mutual follow)
-- canonicalized so user_a_id < user_b_id; status drives visibility.
-- ─────────────────────────────────────────────────────────────────────────────
create type public.friend_status as enum ('pending', 'accepted', 'declined', 'blocked');

create table public.friend_edges (
  id                     uuid primary key default gen_random_uuid(),
  user_a_id              uuid not null references public.users(id) on delete cascade,
  user_b_id              uuid not null references public.users(id) on delete cascade,
  status                 public.friend_status not null default 'pending',
  requested_by_user_id   uuid not null references public.users(id) on delete cascade,
  created_at             timestamptz not null default now(),
  responded_at           timestamptz,
  check (user_a_id < user_b_id),
  unique (user_a_id, user_b_id)
);

create index friend_edges_b_idx on public.friend_edges (user_b_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- realtime: publish picks for live overlap updates
-- ─────────────────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.picks;

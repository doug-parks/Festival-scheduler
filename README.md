# Fest Planner

Mobile-first PWA for picking which bands you're seeing at a music festival
and seeing where your crew overlaps. MVP target: **Maryland Deathfest 2026** in
Baltimore.

Full PRD lives in Notion: *Development Projects – Apps → Fest Planner*.

## Stack
- Next.js 15 (App Router) + TypeScript + Tailwind
- Supabase (Auth · Postgres · Realtime · Storage)
- Vercel

## Branches
- `main` — production
- `dev` — integration; feature branches merge here first
- `claude/*` — Claude Code work branches off `dev`

## Local setup

1. **Install deps**
   ```bash
   pnpm install
   ```

2. **Create a Supabase project** and copy its URL + anon key.

3. **Configure env**
   ```bash
   cp .env.example .env.local
   # then fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```

4. **Apply migrations** in the Supabase SQL editor (or via `supabase db push`):
   - `supabase/migrations/0001_init.sql` — schema
   - `supabase/migrations/0002_rls.sql` — RLS policies

5. **Configure Google OAuth** in Supabase Auth → Providers:
   - Add your Google OAuth client ID + secret
   - Add `http://localhost:3000/auth/callback` and the production callback
     to allowed redirect URLs.

6. **Run**
   ```bash
   pnpm dev
   ```

## Admin
The admin email is hardcoded to `parks.doug@gmail.com` in two places:
- Middleware (env: `NEXT_PUBLIC_ADMIN_EMAIL`) — gates `/admin/**` with a 404
  for non-admins so the route isn't advertised.
- Postgres `public.is_admin()` — gates writes to lineup tables via RLS.

Rotating the admin requires editing both.

## What's scaffolded vs. what's next
**Done (this commit):**
- App Router scaffold, Tailwind, dark theme
- Supabase SSR auth (browser + server clients, session middleware)
- Google OAuth sign-in / callback / sign-out
- Route shell: `/`, `/calendar`, `/my-schedule`, `/overlap`, `/friends`, `/admin`, `/admin/import`
- Full schema migration (users, festivals, stages, bands, sets, picks, groups, invites, friend edges)
- RLS policies matching PRD §9 (friends + group visibility, admin-only writes)
- PWA manifest + icon (push notifications deferred to P1)

**Next, in rough order:**
1. Auth → `public.users` row on first sign-in (collect username)
2. Admin importer for `https://deathfests.com/set-times/`
3. Calendar grid component (stage × time)
4. One-tap RYG picks + Realtime
5. Friends + groups UI
6. Overlap view

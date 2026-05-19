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

## Setup

This project's Supabase is provisioned via the **Vercel Marketplace**. The
Vercel project (`festival-scheduler` under `doug-parks-projects`) holds all
Supabase env vars; pull them locally with `vercel env pull .env.local`.

1. **Install deps**
   ```bash
   pnpm install
   ```

2. **Pull env from Vercel**
   ```bash
   vercel link --scope doug-parks-projects --project festival-scheduler
   vercel env pull .env.local
   ```
   This sets `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_*`, and `NEXT_PUBLIC_ADMIN_EMAIL`.

3. **Apply migrations** (once per migration file):
   ```bash
   pnpm db:push
   ```
   Runs every `*.sql` under `supabase/migrations/` against
   `POSTGRES_URL_NON_POOLING`. Already applied: `0001_init.sql`,
   `0002_rls.sql`.

4. **Configure Google OAuth** (one-time, requires both Google Cloud Console and
   Supabase dashboard access — Claude cannot do this step):
   1. In **Google Cloud Console** → APIs & Services → Credentials → create an
      OAuth 2.0 Client ID (type: Web application).
   2. Add authorized redirect URIs:
      - `https://<your-supabase-project>.supabase.co/auth/v1/callback`
      - `http://localhost:3000/auth/callback` (dev)
      - `https://festival-scheduler.vercel.app/auth/callback` (production)
      - `https://*.vercel.app/auth/callback` (preview deploys — add per-branch as needed)
   3. In **Supabase dashboard** → Authentication → Providers → Google: paste
      the client ID and secret. Enable.
   4. In **Supabase dashboard** → Authentication → URL Configuration: set
      Site URL to the production URL; add preview/localhost to "Redirect URLs."

5. **Run**
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

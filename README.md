# Store System

Temporary internal project name: **Store System**.

Source of truth for the project and V1: [PROJECT.md](./PROJECT.md).

## Stack

- Next.js (App Router), React, TypeScript, Tailwind CSS, ESLint
- Supabase (Auth, PostgreSQL, RLS) via `@supabase/ssr`

## Commands

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
```

## Environment

Copy `.env.example` to `.env.local` and fill in values from your Supabase project (Settings → API):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Never add a service-role/secret key to this app. The application must not use one.

## Supabase setup (manual)

1. In the Supabase Dashboard → **Authentication → Providers → Email**:
   - Ensure Email is enabled.
   - For M1 development, **disable “Confirm email”** (accounts are created administratively; there is no public signup UI).
2. **Authentication → URL Configuration**: set Site URL to `http://localhost:3000` (and your production URL later).
3. Create users administratively in **Dashboard → Authentication → Users → Add user** (email + password). New profiles default to **SELLER**.

## Database migrations

Migrations live in `supabase/migrations/` and are the only supported way to change the database schema/RLS.

```bash
# One-time: link to your project (project ref is the subdomain in NEXT_PUBLIC_SUPABASE_URL)
npx supabase link --project-ref your-project-ref

# Apply migrations
npx supabase db push
```

Alternatively, paste the contents of files in `supabase/migrations/` into the Dashboard SQL Editor in filename order (still reproducible from git).

Migration `20260922180000_profiles_and_rls.sql` creates:

- `public.profiles` (role enum: `ADMIN` | `SELLER`, default `SELLER`)
- Trigger: profile row on signup (always default `SELLER`)
- Trigger: only admins may change `profiles.role`
- RLS: users read/update own profile; admins read all; no client insert/delete

## Bootstrap the first ADMIN

Every new profile is **SELLER**. There is no auto-promote, no promote API, and no service-role key in the app.

After the owner account exists (and is signed in at least once so the profile row exists), run **once** in the SQL Editor (replace the placeholder):

```sql
update public.profiles
set role = 'ADMIN'
where id = (
  select id from auth.users where email = 'owner@example.com'
);
```

Verify:

```sql
select u.email, p.role
from auth.users u
join public.profiles p on p.id = u.id;
```

After bootstrap, RLS and the role-change trigger protect ADMIN/SELLER as normal.

## Routes

| Path | Access |
|------|--------|
| `/login` | Public (redirects away if signed in) |
| `/` | Any authenticated user |
| `/admin` | ADMIN only (server check + RLS) |

# Munshi

Munshi (Urdu for "assistant") is a personal AI finance, tasks & reminder assistant. Track salary, expenses, budgets, savings, tasks, and reminders using natural text or voice commands. 

## Stack
- Next.js 15 (App Router) + React 19 + TypeScript
- Prisma ORM + PostgreSQL (Supabase)
- Tailwind CSS
- Optional: Google Gemini (natural-language parsing) and Web Push notifications

## Quick start (local)
1. Install deps:
   `npm install`
2. Create env:
   `cp .env.example .env` (or on Windows: `copy .env.example .env`)
   Fill in `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`.
3. Apply migrations (and optionally seed demo data):
   `npx prisma migrate deploy`
   `npm run db:seed`
4. Run dev:
   `npm run dev` -> http://localhost:3000

Demo account (after seeding): `demo@local.test` / `password123`

## Production (Vercel + Supabase)
- Set all env vars from `.env.example`. Use the Supabase **transaction pooler** (port 6543, `?pgbouncer=true&connection_limit=1`) for `DATABASE_URL` and the **session pooler** (port 5432) for `DIRECT_URL`.
- Deploys run `prisma migrate deploy` automatically via the build script.
- Cron: `GET /api/cron/run` with `Authorization: Bearer $CRON_SECRET`.
- Web Push is optional; in-app notifications work without it.

## Scripts
- `npm run dev` - start the dev server
- `npm test` - run the test suite (uses `TEST_DATABASE_URL` with `?schema=test`)
- `npm run typecheck` - `tsc --noEmit`
- `npm run build` - migrate + generate + build
- `npm run lint` - ESLint
- `npm run db:seed` - seed demo data

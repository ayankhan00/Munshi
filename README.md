# Personal AI Finance, Tasks & Reminder Assistant

Local development and production setup instructions.

## Quick Start (Local)
1. Install deps: 
npm install
2. Copy env: cp .env.example .env (or create .env with required values)
3. Set secrets: SESSION_SECRET, CRON_SECRET (use crypto.randomBytes)
4. DB: 
px prisma migrate deploy then 
px tsx prisma/seed.ts
5. Dev: 
npm run dev → http://localhost:3000

Demo: demo@local.test / password123

## Production (Vercel + Supabase)
- DATABASE_URL: PostgreSQL with sslmode=require
- Migrate: 
px prisma migrate deploy
- Env vars: see .env.example
- Cron: POST /api/cron/run with Authorization: Bearer CRON_SECRET
- Web Push optional

## Testing

pm test, 
pm run typecheck, 
pm run build


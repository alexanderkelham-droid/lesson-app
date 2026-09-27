# Redwood Scholars Portal

A full-stack tutoring platform for Redwood Scholars Tuition. It includes a marketing site, role-based dashboards (manager / tutor / student), a library of ~1,200 interactive worksheets, lesson plans with recurring sessions and automatic carryover, auto-marking with follow-up rules, and live 1:1 lessons where tutor and student work on the same sheet.

## Start here

| Doc | For |
|---|---|
| **[INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)** | Developers or Claude Code picking this up: architecture, setup, API reference, how to integrate with the main website |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Deploying to Vercel + Supabase, migrations, operations, troubleshooting |
| [MANAGER_GUIDE.md](./MANAGER_GUIDE.md) | Day-to-day use by the centre manager |
| `HANDOVER_SECRETS.md` | Real credentials. **Not in git**, sent separately |

## Tech stack

- **Frontend:** React 18 + Vite + Tailwind, React Router, FullCalendar, dnd-kit
- **Backend:** Node + Express 4 + Prisma 5
- **Database:** PostgreSQL (Supabase)
- **Hosting:** Vercel (static SPA + one serverless function for the API)
- **Optional:** Anthropic API for the "AI improve" worksheet tool

## Quick start

```bash
npm install
cp server/.env.example server/.env        # fill in (see INTEGRATION_GUIDE.md §4)
npx prisma generate --schema=server/prisma/schema.prisma
npm run dev                               # API http://localhost:3001 · app http://localhost:5173
```

## Common scripts

```bash
npm run dev                                # API + client in watch mode
npm run build                              # client production build
npm run db:deploy                          # apply Prisma migrations to DATABASE_URL
npm run db:studio                          # browse the database
npm run test:smoke --workspace=server      # end-to-end API test (API must be running)
npm run qa:seed --workspace=server         # throwaway QA logins for manual testing
npm run qa:cleanup --workspace=server      # remove QA data
```

## Project structure

```
api/        Vercel serverless entry (re-exports the Express app)
client/     React SPA
server/     Express API, Prisma schema + migrations, scripts
vercel.json Build, rewrites, function timeout
```

See [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) §2 for the full layout.

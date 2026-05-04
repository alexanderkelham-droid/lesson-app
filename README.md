# Redwood Scholars Portal

A full-stack tutoring platform for Redwood Scholars Tuition. Includes a marketing site, role-based dashboards (manager / tutor / student), an interactive worksheet library, lesson scheduling, and live whiteboard sessions.

## Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — How to deploy to Vercel, set environment variables, reset the database, and run migrations
- **[MANAGER_GUIDE.md](./MANAGER_GUIDE.md)** — Day-to-day usage for the centre manager: adding tutors and students, building lesson plans, running live sessions

---

## Tech stack

- **Frontend:** React + Vite + Tailwind, FullCalendar, tldraw (live whiteboard)
- **Backend:** Express + Prisma
- **Database:** PostgreSQL on Supabase
- **Hosting:** Vercel (frontend as static + API as serverless)

---

## Local development

```bash
# Install
npm install

# Configure environment
cp server/.env.example server/.env
# Edit server/.env with your DATABASE_URL, DIRECT_URL, JWT_SECRET

# First-time DB setup
cd server && npx prisma migrate dev && cd ..

# Run both client and server
npm run dev
```

- Client: http://localhost:5173
- API: http://localhost:3001
- Prisma Studio: `cd server && npx prisma studio`

---

## Project structure

```
.
├── api/                    # Vercel serverless function (wraps Express)
├── client/                 # React + Vite frontend
│   └── src/
│       ├── components/
│       │   ├── marketing/  # Public landing page
│       │   ├── manager/    # Manager dashboard, builders
│       │   ├── tutor/      # Tutor dashboard
│       │   ├── student/    # Student dashboard, sheet view
│       │   └── shared/     # Logo, modals, navbar, today, sessions, live session
│       └── lib/api.js      # Axios client
├── server/                 # Express + Prisma backend
│   ├── src/
│   │   ├── app.js          # Express app (no listen — used by both local + Vercel)
│   │   ├── index.js        # Local dev entrypoint (calls listen)
│   │   ├── routes/         # auth, users, sheets, lesson-plans, sessions, ...
│   │   └── middleware/
│   ├── prisma/             # Schema + migrations
│   └── scripts/
│       ├── reset-db.js     # Wipe demo data, seed fresh manager
│       ├── auto-migrate.js # Convert PDFs → sheets (used during initial setup)
│       └── ...
├── vercel.json             # Vercel build/route config
└── DEPLOYMENT.md           # Production deployment instructions
```

---

## Common scripts

```bash
npm run dev              # Local dev (server + client)
npm run build            # Build client only
npm run vercel-build     # Build for Vercel deployment (prisma generate + client)
npm run db:migrate       # Run a new schema migration
npm run db:reset         # Wipe demo data + seed fresh manager (CLI prompt)
npm run db:studio        # Open Prisma Studio for the DB
```

---

## Deploy

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full Vercel deployment walkthrough.

In short:
1. Push to GitHub
2. Import into Vercel
3. Set env vars (`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `CLIENT_URL`)
4. Deploy
5. Run `node server/scripts/reset-db.js --email ... --password ...` locally to seed your production manager account

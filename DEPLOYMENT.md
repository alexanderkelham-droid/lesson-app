# Deployment Guide

This app deploys as a single Vercel project: the React frontend ships as static files, and the Express backend runs as a serverless function. Frontend and API share one origin so there's no CORS to configure.

---

## 1. Prerequisites

- A **Vercel account** (free tier is fine to start)
- A **Supabase Postgres database** (already set up — `tpnjfyortdrjlnmwvhaz`)
- Your **environment secrets** ready (see "Environment variables" below)
- The repo pushed to GitHub (Vercel pulls from there)

---

## 2. Environment variables

Set these in **Vercel → Project Settings → Environment Variables** for the **Production** environment (and Preview if you want):

| Name | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres.[ref]:[password]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres` | Use the **pooled** connection (port 5432). Required for serverless. |
| `DIRECT_URL` | Same pooled URL | For Prisma migrations during build. |
| `JWT_SECRET` | A long random string (e.g. `openssl rand -base64 32`) | Used to sign auth tokens. **Generate a NEW one for production**, don't reuse the local dev value. |
| `CLIENT_URL` | `https://your-app.vercel.app` | After first deploy, replace with the actual URL. Comma-separate multiple domains if needed. |

You can copy the values from your local `server/.env` for `DATABASE_URL` and `DIRECT_URL`. **Do not commit `.env` to git.**

---

## 3. First deploy

1. Push the repo to GitHub
2. In Vercel: **Add New → Project → Import** your repo
3. Vercel auto-detects the build settings from `vercel.json`. You shouldn't need to change anything.
4. Add the environment variables above
5. Click **Deploy**

The first build takes ~2 minutes. Once it's done you'll get a URL like `your-app.vercel.app`.

### Verify

After deploy, test:
- Visit the URL → marketing landing page loads
- Visit `/api/health` → should return `{"status":"ok"}`
- Visit `/login` and try signing in (you'll need a manager account — see step 4)

---

## 4. Reset the database to a clean production state

Before going live, wipe all the demo/test data and seed a real manager account.

**Run from your local terminal** (not Vercel — Supabase is the same DB either way):

```bash
cd /path/to/Lesson-App

# Required: email + password for the production manager
# Optional: --name "Sarah Manager"
node server/scripts/reset-db.js \
  --email manager@redwoodscholars.co.uk \
  --password "YourSecurePassword!" \
  --name "Sarah Manager"
```

The script will:
- Show you what's currently in the DB
- Ask for confirmation (type `yes`)
- Delete all users, lesson plans, sessions, responses, follow-up rules
- **Keep all 1,200+ sheets**
- Create the new manager account

After this, sign in at your Vercel URL with the credentials you just set. The manager can then add tutors and students from the dashboard.

> **Tip:** Add `--yes` to skip the confirmation prompt if you're scripting this.

---

## 5. Schema migrations after deploy

If you change `server/prisma/schema.prisma`:

```bash
# Run locally — applies migration to the Supabase DB and creates a migration file
cd server
npx prisma migrate dev --name your-change-description

# Commit the new migration file in prisma/migrations/
git add server/prisma/migrations
git commit -m "Migration: your-change-description"
git push
```

Vercel doesn't run migrations during build — they're applied directly to Supabase by your local `prisma migrate dev`. The new migration file just needs to exist in the repo so future fresh DBs get it.

---

## 6. Custom domain

To put this on `redwoodscholars.co.uk`:

1. Vercel → Project → **Settings → Domains**
2. Add `redwoodscholars.co.uk` and `www.redwoodscholars.co.uk`
3. Vercel will give you DNS records to add at your domain registrar
4. Update the `CLIENT_URL` env var to the new domain
5. Redeploy

---

## 7. Local development (unchanged)

```bash
# From the repo root
npm install
npm run dev      # Runs server on :3001 and client on :5173

# Open http://localhost:5173
```

Local dev still uses the long-running Express server (`server/src/index.js`), which imports the same `app.js` that the Vercel function uses. So local and prod behave identically.

---

## 8. Troubleshooting

**`Module not found: @prisma/client`** during deploy — make sure `postinstall` script in root `package.json` runs `prisma generate`. It does, but check Vercel build logs.

**`tenant/user not found`** when calling the API — Supabase project paused. Open the Supabase dashboard and click "Restore project."

**`function timeout`** on long requests (e.g. saving a 50-item lesson plan) — bump `maxDuration` in `vercel.json` (max 60 on Hobby tier, 300 on Pro).

**Frontend loads but API returns HTML** — check that `vercel.json` has the `functions` block and `api/[...path].js` exists. Without these, Vercel serves the SPA index for `/api/*` routes.

**Auth fails after deploy** — `JWT_SECRET` mismatch. If you set it after the first deploy, redeploy. Existing tokens become invalid (users need to sign in again).

# Integration Guide — Redwood Scholars Portal

**Audience:** a developer (or a Claude Code session) who has been handed this repository with **no prior context** and needs to run it, understand it, and integrate it into the existing Redwood Scholars website.

Read this file top to bottom once. It is the single source of truth; the other docs go deeper on specific topics:

| Doc | What it's for |
|---|---|
| `INTEGRATION_GUIDE.md` (this file) | Architecture, how to run, how to integrate, API reference, gotchas |
| `DEPLOYMENT.md` | Step-by-step Vercel + Supabase deployment and operations |
| `MANAGER_GUIDE.md` | How the centre manager (non-technical) uses the app day to day |
| `HANDOVER_SECRETS.md` | **Not in git.** Real credentials and keys, sent separately and securely |

> **If you are Claude Code:** start by reading this file, then `server/prisma/schema.prisma`, `server/src/app.js`, `server/src/lib/access.js`, and `client/src/App.jsx`. Run `npm run test:smoke --workspace=server` against a running API before and after any change; it must stay green.

---

## 1. What this is

A tutoring platform for **Redwood Scholars Tuition** (a UK tuition centre). It has three kinds of users:

| Role | Who | What they do |
|---|---|---|
| **manager** | The centre owner (Magda) | Adds tutors and students, builds lesson plans, sees everything, edits the worksheet library |
| **tutor** | Teaching staff | Sees only the students on **their** plans, builds plans, runs live lessons, marks work |
| **student** | Children aged ~5–16 (parents often help) | Sees their own plan, completes worksheets online, joins live lessons |

Core concepts:

- **Sheet**: a worksheet from a library of ~1,234 (Maths, English, Science). Stored as JSON questions (`contentJson`). Most were converted from PDFs using Claude vision.
- **Lesson plan**: one student + one tutor + an ordered list of **items**. Optional recurring slot (for example "every Tuesday 16:30").
- **Item**: either a sheet or a custom task (such as an IXL exercise or paper activity). Has a status (`locked`, `available`, `in_progress`, `completed`) and optionally belongs to a **session**.
- **Session**: one scheduled lesson (a date and time). Recurring sessions are generated automatically 8 weeks ahead from the plan's day and time. The generator only ever adds weeks *after* the latest existing session, so sessions the manager moved or deleted never come back. Changing a plan's day or time clears future empty sessions and regenerates them.
- **Carryover**: when a session is marked attended, unfinished items are **cloned** into the next session. The originals stay attached to the past session, so each session keeps an accurate history. If an original is finished late, its untouched copies are removed automatically (`server/src/lib/items.js`). Screens hide originals that have been carried forward (`item._count.carriedTo > 0`).
- **Group session (class)**: one timetable slot (title, tutor, time, location, optional weekly series) with several students. Each child keeps their own plan and work. Their individual session for that slot links to the group (`LessonSession.groupSessionId`), so rescheduling, attendance, cancelling and printing act on the whole class while every child's work stays individual. A group's tutor can see every student in it (`tutorPlanWhere` in `lib/access.js`).
- **Sheet memory**: every attempt is kept forever (`StudentResponse`). `GET /lesson-plans/:id/sheet-history` summarises it across all of a student's plans. The builder, live "+ Add" picker and AI planner use it to avoid accidental repeats.
- **Originals**: 1,121 sheets have their original scanned PDF in Supabase Storage (`Sheet.pdfUrl = storage://worksheets/...`, `Sheet.sourceFile` = the path in the worksheets archive). Staff can preview it, print single sheets, download a merged lesson pack, or run a "print run" for a whole day or class.
- **Student response**: a submitted attempt at a sheet, with an auto-calculated score.
- **Follow-up rule**: "if score on sheet X < 60, insert sheet Y next". Applied automatically on completion.
- **Live lesson**: the tutor and student open the same sheet at the same time. The student types answers and the tutor sees them within about 2 seconds and marks ✓/✗. "Save result" stores it as a student response. It works by **polling**, not websockets, so it runs on serverless hosting with no extra services.
- **Marketing site**: a public landing page at `/` for Redwood Scholars.

---

## 2. Architecture

```
┌──────────────────────── Browser ────────────────────────┐
│ React 18 SPA (Vite, Tailwind, React Router v6)          │
│  - JWT kept in localStorage ('token')                   │
│  - axios instance: baseURL '/api', adds Bearer header   │
└───────────────┬─────────────────────────────────────────┘
                │ same origin: /api/*
┌───────────────▼─────────────────────────────────────────┐
│ Express 4 app (server/src/app.js)                       │
│  local: server/src/index.js → app.listen(3001)          │
│  Vercel: api/index.js → module.exports = app            │
│  routes/: auth users sheets lessonPlans sessions        │
│           studentResponses followUpRules                │
│  lib/: access (authz), scoring, time (UK tz),           │
│        recurring-sessions                               │
└───────────────┬─────────────────────────────────────────┘
                │ Prisma 5
┌───────────────▼─────────────────────────────────────────┐
│ PostgreSQL on Supabase (EU West)                        │
└─────────────────────────────────────────────────────────┘
          (optional) Anthropic API: "AI improve" button in sheet editor
```

- **Monorepo** with npm workspaces: `client/` and `server/`. The root `package.json` holds orchestration scripts.
- **Hosting today:** a single Vercel project. `vercel.json` builds the client to `client/dist` (static) and exposes the Express app as one serverless function at `/api`. It rewrites `/api/*` to that function and everything else to `index.html` (SPA fallback).
- **No other services.** No Redis, no websockets, no file storage, no email. Everything is Postgres.

### Repository layout

```
api/index.js                 Vercel serverless entry (just re-exports the Express app)
client/
  src/App.jsx                All routes (see §6)
  src/context/AuthContext.jsx  Login/logout, loads /auth/me on boot
  src/lib/api.js             axios instance (baseURL /api, auth header, 401 → clear token + go to /login)
  src/components/
    marketing/               Public homepage
    manager/                 Dashboard, student detail, plan builder, sheet library + editor, calendar
    tutor/                   Tutor dashboard + student detail
    student/                 Student dashboard, SheetView (do a worksheet)
    print/                   A4 printable sheet + lesson-pack views (staff), print.css
    shared/                  Navbar, TodayView, SessionsPanel, SessionHistory, LiveSessionView,
                             InteractiveSheet (live lesson), SheetPreviewModal, Tour
  vite.config.js             Dev proxy /api → http://localhost:3001
server/
  src/app.js                 Express app: CORS, JSON, routes, error handler
  src/index.js               Local entry (listen on PORT, default 3001)
  src/prisma.js              Shared PrismaClient
  src/middleware/auth.js     auth (JWT) + requireRole(...roles)
  src/lib/access.js          Plan-level authorization helpers + validators
  src/lib/scoring.js         Auto-marking + stripping answer keys for students
  src/lib/time.js            Europe/London timezone maths (no deps)
  src/lib/recurring-sessions.js  Generates weekly sessions
  src/routes/*.js            REST endpoints (see §7)
  prisma/schema.prisma       Data model (see §5)
  prisma/migrations/         SQL migrations. Applied with `prisma migrate deploy`
  prisma/seed.js             DEMO data only (guarded, refuses unless ALLOW_DEMO_SEED=yes)
  scripts/smoke-test.js      End-to-end API test (131 checks, all roles)
  scripts/qa-data.js         Seed/cleanup namespaced QA accounts for manual testing
  scripts/set-password.js    Safely set one user's password or add a manager
  scripts/reset-db.js        DANGER: wipes all plans/sessions/results (keeps sheets) and creates a manager
  scripts/*.js (others)      One-off PDF→sheet conversion tools, already run. Not needed at runtime
vercel.json                  Build + rewrites + function timeout (60s)
```

---

## 3. Running it locally (15 minutes)

Prerequisites: **Node 18+** (20 LTS recommended), npm 9+.

```bash
git clone <repo> && cd Lesson-App
npm install                      # installs root + client + server workspaces
cp server/.env.example server/.env
# fill in server/.env — see §4 (real values are in HANDOVER_SECRETS.md)
npx prisma generate --schema=server/prisma/schema.prisma
npm run dev                      # API on :3001 and client on :5173
```

Open http://localhost:5173 and log in with the manager account from `HANDOVER_SECRETS.md`.

**Database choice for development.** `server/.env` in the handover points at the **production** Supabase database. For integration work, **create your own database** (a free Supabase project or local Postgres) and run:

```bash
npm run db:deploy                # applies all migrations to the DATABASE_URL in server/.env
ALLOW_DEMO_SEED=yes npm run db:seed --workspace=server   # optional demo users (password123)
```

The worksheet library (1,234 sheets) is only in the production database. To copy it to a dev database, use `pg_dump --data-only -t sheets` from production and restore it into your dev database.

### Verifying it works

```bash
# with the API running (npm run dev):
npm run test:smoke --workspace=server
# → "131 passed, 0 failed". Creates and deletes its own @qa.redwood.test data.
```

For hands-on testing without touching real students:

```bash
npm run qa:seed --workspace=server     # prints logins for QA manager/tutor/student + a plan
npm run qa:cleanup --workspace=server  # removes all @qa.redwood.test users and [QA] sheets
```

---

## 4. Environment variables

All server config lives in `server/.env` locally and in **Vercel → Settings → Environment Variables** in production. The client has **no** env vars. It always calls `/api` on its own origin.

| Variable | Required | Example / notes |
|---|---|---|
| `DATABASE_URL` | **yes** | Postgres URL Prisma uses at runtime. Currently the Supabase **session pooler** (`aws-0-eu-west-1.pooler.supabase.com:5432`). For heavy serverless load, switch to the transaction pooler: port `6543` with `?pgbouncer=true&connection_limit=1`. |
| `DIRECT_URL` | **yes** | Non-pooled or session URL used by `prisma migrate`. Same as `DATABASE_URL` today. |
| `JWT_SECRET` | **yes** | Signs login tokens. The server refuses to start without it and warns if it is under 32 characters. Generate with `openssl rand -base64 48`. **Changing it logs everyone out.** |
| `ANTHROPIC_API_KEY` | optional | Enables the AI features: "✨ Plan with AI" lesson planning, "✨ AI improve" in the sheet editor, and the digitising scripts. Without it, those return a clear error and everything else works. Top up credit at console.anthropic.com. |
| `CLIENT_URL` | optional | Comma-separated extra origins allowed by CORS, for example `https://redwoodscholars.co.uk,https://www.redwoodscholars.co.uk`. Only needed if the frontend is served from a **different origin** than the API (see §8, option B/C). Same-origin needs nothing. |
| `SUPABASE_URL` | recommended | Supabase project URL, used for **Storage**: the private `worksheets` bucket holds every sheet's original PDF plus temporary print packs. Needed on Vercel for "Original PDF", lesson-pack downloads and print runs. |
| `SUPABASE_SERVICE_ROLE_KEY` | recommended | Service-role key for Storage (server-side only; **never** expose it to the browser). The bucket is private; staff get signed links that expire. |
| `WORKSHEETS_DIR` | optional | Folder holding the original worksheet PDFs (`Sheet.sourceFile` is relative to it). Enables `GET /sheets/:id/original` to stream a sheet's original PDF when it has no hosted `pdfUrl`. Relative paths resolve from `server/`, so local dev uses `WORKSHEETS_DIR=../worksheets`. Leave unset on Vercel (no local files there); originals then need a hosted `pdfUrl`. |
| `APP_TIMEZONE` | optional | Default `Europe/London`. All lesson times and "today" are calculated in this zone, whatever the server's own timezone. |
| `PORT` | optional | Local API port, default `3001`. Ignored on Vercel. |
| `NODE_ENV` | optional | `production` hides internal error messages (always hidden on Vercel regardless). |
| `MANAGER_EMAIL`, `MANAGER_PASSWORD`, `MANAGER_NAME` | script only | Used by `server/scripts/reset-db.js` if not passed as CLI args. |

---

## 5. Data model (Prisma → Postgres tables)

```
User (users)                 id, email (unique), passwordHash (bcrypt), name, role: student|tutor|manager,
                             age?, subjectFocus?: maths|english|both
 └─ StudentLessonDay         studentId, dayOfWeek (0=Mon … 6=Sun)  — the student's usual days

Sheet (sheets)               id, title, subject, topic, difficultyLevel 1-5, sheetType: worksheet|quiz|practice,
                             tags[], contentJson  ← questions + answer keys (see below)

LessonPlan (lesson_plans)    studentId → User, tutorId → User, title, status: draft|active|completed,
                             startDate?, lessonDayOfWeek? (0=Mon), lessonTime? "HH:MM" (UK local), studentNotes?
                             (boardUuid is a dead column from the removed whiteboard. Safe to ignore)
 ├─ LessonSession            lessonPlanId, scheduledAt (UTC instant), attendedAt?, durationMins?, notes? (tutor-only),
 │                           activeItemId?, liveAnswers?, liveMarks? (live lesson state), UNIQUE(lessonPlanId, scheduledAt)
 └─ LessonPlanItem           lessonPlanId, sheetId? | customTitle+customType, sequenceOrder, status,
                             sessionId? (null = unscheduled pool), carriedFromId? (clone source), tutorNotes? (tutor-only),
                             autoGenerated (created by a follow-up rule)

StudentResponse              studentId, sheetId, lessonPlanItemId, responsesJson {questionId: answer}, score? (0-100,
                             null = needs tutor review), completedAt, timeSpentSeconds?
GroupSession (group_sessions) title, tutorId, scheduledAt, durationMins, location, notes, seriesId (weekly repeats)
 └─ LessonSession.groupSessionId → each student's lesson in that class
Sheet (extra columns)        sourceFile (archive path), pdfUrl (storage ref), digitisedBy: text|vision|vision_review|manual|reviewed
                             ("text"/"vision_review" = needs a human check → amber "review" badge)
LessonSession (extra)        studentSeenAt (live-room presence heartbeat)
FollowUpRule                 sourceSheetId, followUpSheetId, triggerCondition e.g. "score < 60", priority
FollowUpLog                  audit of each rule firing
```

**`Sheet.contentJson` shape:**

```json
{
  "passage": "Optional reading text shown above the questions",
  "questions": [
    { "id": "q1", "type": "fill_in_blank",   "prompt": "5 + 7 = ?", "correct": ["12"], "points": 1 },
    { "id": "q2", "type": "multiple_choice", "prompt": "…", "options": ["a","b"], "correct": ["b"] },
    { "id": "q3", "type": "matching",        "prompt": "…", "pairs": [{"left":"cat","right":"kitten"}] },
    { "id": "q4", "type": "ordering",        "prompt": "…", "options": ["…"], "correct_order": ["…"] },
    { "id": "q5", "type": "free_text",       "prompt": "Explain…", "correct": [] }
  ]
}
```

Scoring (`server/src/lib/scoring.js`): matching is lenient about format. Case, trailing punctuation, separators ("5 6 7" = "5, 6, 7"), thousands commas, and units or currency on numbers ("10p" = "10", "£2.50" = "2.5") are all ignored. `client/src/lib/marking.js` is a copy for review screens; keep the two in sync. Points (`q.points`) weight the score, for auto-marking and for tutor ✓/✗ marks alike. `free_text` and `image_based` questions, and any question without an answer key, are **not** auto-marked. If nothing on a sheet can be auto-marked, the score is `null` and the UI shows "awaiting tutor review". Students never receive `correct`, `correct_order` or the true matching pairs until they have submitted that sheet.

---

## 6. Frontend routes

| Path | Role | Screen |
|---|---|---|
| `/` | public | Marketing homepage |
| `/login` | public | Login. Redirects to the role's home |
| `/manager` | manager | Dashboard: students, tutors, Today, Calendar tabs |
| `/manager/students/:studentId` | manager | Student profile, plans, sessions, history, reset password |
| `/manager/lesson-plans/new`, `/:planId/builder` | manager | Plan builder (drag-and-drop sheet library, sessions) |
| `/manager/lesson-plans/:planId/live` | manager | Live lesson room |
| `/manager/sheets`, `/manager/sheets/:sheetId/edit` | manager | Sheet library and editor (with AI improve) |
| `/tutor`, `/tutor/students/:id`, `/tutor/lesson-plans/...` | tutor | Same as manager, scoped to own students |
| `/print/sheet/:sheetId?answers=1` | manager, tutor | Printable A4 worksheet; `answers=1` appends an answer key |
| `/print/plan/:planId?session=<id\|next\|all\|unscheduled>&answers=1&notes=1` | manager, tutor | Printable lesson pack: cover page (student, tutor, date, checklist of items), each sheet on a new page, optional answer key and tutor notes |
| `/student` | student | Student dashboard (plan, next lesson, join live) |
| `/student/sheet/:lessonPlanItemId` | student | Do or review a worksheet |
| `/student/lesson-plans/:planId/live` | student | Live lesson room (waits until the tutor starts) |

`ProtectedRoute` checks the role client-side for UX only. **All real authorization is enforced by the API.**

---

## 7. API reference

Base path `/api`. JSON in and out. Auth: `Authorization: Bearer <token>` from `POST /api/auth/login`. Tokens last 60 days and carry `{ userId, email, name, role }`. Errors look like `{ "error": "message" }` with status 400 (validation), 401 (no or invalid token), 403 (role or ownership), 404, 409 (conflict, for example deleting something with history), 429 (login rate limit), 500.

**Authorization model** (`server/src/lib/access.js`): managers can access everything. Tutors can access plans where `tutorId = self`, and everything under those plans (items, sessions, responses). Students can access plans where `studentId = self`, read-only, apart from submitting answers. Students never see `tutorNotes`, session `notes`, or answer keys before submitting.

### Auth
| Method & path | Who | Notes |
|---|---|---|
| `POST /auth/login` `{email, password}` | public | → `{ token, user }`. 10 failures per IP+email per 15 minutes → 429 |
| `GET /auth/me` | any | Current user |
| `GET /health` | public | `{status:"ok"}` |

### Users
| Method & path | Who | Notes |
|---|---|---|
| `GET /users` | manager, tutor | Manager: everyone. Tutor: self + all students, but full details (email, age) only for students they teach. Others are `{id, name, role, lessonDays}` |
| `GET /users/students` | manager, tutor | Students + latest active plan stats (progress, avgScore, flagged). Tutor: only students on own plans |
| `POST /users` `{name,email,password(≥8),role:'student'|'tutor',age?,subjectFocus?,lessonDays?[0-6]}` | manager | |
| `GET /users/:id` | any | Student: self only. Tutor: self + students they teach |
| `PUT /users/:id` `{name?,email?,age?,subjectFocus?,lessonDays?}` | manager | lessonDays replaces the set |
| `DELETE /users/:id` | manager | Student: deletes all their history. Tutor: 409 if they have plans. Managers can't be deleted |
| `POST /users/:id/reset-password` `{password?}` | manager, tutor | Returns `{newPassword}` once (generated if omitted). Tutors: only students they teach |

### Sheets
| Method & path | Who | Notes |
|---|---|---|
| `GET /sheets?subject=&topic=&difficulty=&sheetType=&tags=a,b&search=` | any | Summaries (no contentJson). Staff also get `hasOriginal` and `pdfUrl` |
| `GET /sheets/:id` | any | Full sheet. Students get answer keys stripped until they've submitted it. Staff also get `hasOriginal` and `pdfUrl`; `sourceFile` is never returned |
| `GET /sheets/:id/original` | manager, tutor | Original worksheet PDF: 302 to `pdfUrl` if set, else streams `sourceFile` from `WORKSHEETS_DIR` (inline, `application/pdf`; paths outside that folder are refused), else 404. Needs the auth header, so the client fetches it as a blob |
| `POST /sheets`, `PUT /sheets/:id` | manager | Validates difficulty 1–5, sheetType, `contentJson.questions[]` |
| `DELETE /sheets/:id` | manager | 409 if used anywhere |
| `POST /sheets/:id/ai-improve` `{contentJson?}` | manager | Claude rewrites the questions. Returns `{improved}` **without saving** |

### Lesson plans
| Method & path | Who | Notes |
|---|---|---|
| `GET /lesson-plans` | any | Role-scoped list with items (+ latest response per item) |
| `GET /lesson-plans/:id` | any with access | Full detail + sessions. Also generates any missing recurring sessions |
| `GET /lesson-plans/:id/print?session=<id\|next\|all\|unscheduled>` | manager, tutor (own plans) | For printing: `{plan, student, tutor, scope, session, items}` with **full** sheet `contentJson` including answer keys, plus `tutorNotes` and `hasOriginal`. `next` = next upcoming unattended session (falls back to `all`). `all` omits originals already carried forward. Students 403 |
| `POST /lesson-plans` `{title,studentId,tutorId,status?,startDate?,lessonDayOfWeek?,lessonTime?,studentNotes?}` | manager, tutor | Tutors are always forced to `tutorId = self` |
| `PUT /lesson-plans/:id` | manager, tutor | Only managers can change `tutorId` |
| `DELETE /lesson-plans/:id` | manager | Deletes plan + items + sessions + responses |
| `POST /lesson-plans/:id/items` `{sheetId | customTitle+customType, sessionId?, status?, sequenceOrder?, tutorNotes?, dueDate?}` | manager, tutor | |
| `PUT /lesson-plans/:id/items/:itemId` | manager, tutor | status, sequenceOrder, sessionId (null = unschedule), notes, dates |
| `DELETE /lesson-plans/:id/items/:itemId` | manager, tutor | 409 if the student has submitted work on it |
| `PATCH /lesson-plans/:id/items/reorder` `{orderedIds:[...]}` | manager, tutor | |
| `POST /lesson-plans/:id/process-completion` `{lessonPlanItemId, studentResponseId}` | any with access | Marks the item complete, applies follow-up rules, unlocks the next item. Idempotent |
| `GET /lesson-plans/:id/originals?session=<id\|next\|all\|unscheduled>` | manager, tutor (own plans) | One merged PDF of the lesson's ORIGINAL scanned worksheets, in order, with a cover checklist (`server/src/lib/originals-pack.js`, uses `pdf-lib`). Returns `{url, pages, included, missing}`: the PDF is saved under `packs/` in the private Storage bucket (cleaned up after 24h) and `url` is a 15-min signed link. Without Storage configured, it returns the PDF directly |
| `POST /lesson-plans/:id/ai-plan` `{lessons?: 1-4, instructions?}` | manager, tutor (own plans) | AI suggestions for the next lessons (`server/src/lib/ai-planner.js`). Reads the student's whole history, including sessions, carried-over work, scores, the questions they got wrong and tutor notes, plus the library catalogue (prompt-cached). Returns `{assessment, focusAreas, lessons:[{goal, items:[{sheetId|customTitle, reason, minutes}], tutorNotes}], upcomingSessions}`. **Saves nothing.** The client adds the chosen items via `POST /items`. Needs `ANTHROPIC_API_KEY`. Costs a few pence per call |
| `GET /lesson-plans/:id/sheet-history` | manager, tutor | `{[sheetId]: {timesSet, completed, lastCompletedAt, lastScore, bestScore, planned}}` across all of the student's plans |
| `GET /lesson-plans/:id/follow-up-logs` | any with access | |
| `GET /lesson-plans/:id/live-session` | any with access | `{sessionId, activeItemId}` for **today** (UK). Staff auto-create today's session. Students get `sessionId:null` until then |

### Sessions
| Method & path | Who | Notes |
|---|---|---|
| `GET /sessions?date=YYYY-MM-DD` or `?from=ISO&to=ISO` | any | Role-scoped. `date` is a UK calendar day |
| `POST /sessions` `{lessonPlanId, scheduledAt, durationMins?, notes?}` | manager, tutor | 409 if one already exists at that exact time |
| `PUT /sessions/:id` `{scheduledAt?, attendedAt?, markAttended?, durationMins?, notes?}` | manager, tutor | Becoming attended triggers carryover |
| `POST /sessions/:id/carryover` | manager, tutor | Manual carryover (never duplicates) |
| `GET /sessions/:id/live-state` | any with access | Polled every 2–3 s by the live room. Includes `studentOnline` (the student's polling is a presence heartbeat) |
| `PATCH /sessions/:id/live-state` `{activeItemId}` (staff) · `{itemId, answers}` (student) · `{itemId, marks:{qId:'correct'\|'wrong'\|null}}` (staff) | | Answers and marks are merged per question atomically in SQL (`jsonb_set`), so quick successive saves never lose data. Answers get 409 once the item is completed |
| `POST /sessions/:id/finalize-item` `{itemId}` | manager, tutor | Saves the live work as a StudentResponse: tutor marks weighted by points, with unmarked questions that have answer keys auto-marked. Completes the item and files it under this lesson. Calling again in the same lesson updates that response |
| `DELETE /sessions/:id` | manager, tutor | Its items go back to the unscheduled pool |
| `POST /sessions/:id/cancel` `{moveWork:'next'\|'unscheduled'}` | manager, tutor | Cancel a lesson that hasn't happened: unfinished work MOVES to the next lesson (or unscheduled), then the lesson is removed (kept and labelled if it holds completed work) |
| `PUT /sessions/:id` with a new `scheduledAt` | manager, tutor | If that day already has a lesson for the plan → **409** `{conflict}`. Resend with `{merge:true}` to merge (work moves into the other lesson) |
| `GET /sessions/originals?date=YYYY-MM-DD` | manager, tutor | "Print run": the original worksheets for every lesson on that UK day (tutors: their own), one cover page per lesson, one PDF. Same response as above |

### Group sessions (classes)
| Method & path | Who | Notes |
|---|---|---|
| `GET /groups?from=&to=` or `?date=YYYY-MM-DD` | manager, tutor (own) | Groups with members `{sessionId, planId, student, attendedAt, itemCount, completedCount}` |
| `GET /groups/:id` | manager, tutor (own) | Drill-down: members with their planned items for that lesson |
| `POST /groups` `{title, scheduledAt, durationMins, location?, notes?, tutorId?, repeatWeeks 0–26, studentIds[]}` | manager, tutor | Creates the slot (and weekly repeats, same local time). Reuses each student's lesson that day, otherwise creates one (and a plan if they have none) |
| `PUT /groups/:id` `{…, applyTo:'this'\|'following'}` | manager, tutor | Edit / reschedule: every member's lesson moves too (a clashing solo lesson that day is merged in) |
| `POST /groups/:id/members` · `DELETE /groups/:id/members/:studentId` | manager, tutor | Add / remove students (`applyTo`) |
| `POST /groups/:id/attendance` `{present[], absent[]}` | manager, tutor | Per-child attendance, and each child's unfinished work carries over |
| `POST /groups/:id/cancel` `{moveWork, applyTo}` · `DELETE /groups/:id` | manager, tutor | Cancel the class (work moves per child) · ungroup (students keep individual lessons) |
| `GET /groups/:id/originals` | manager, tutor | One print-run PDF for the class, with a cover page per child |

### Student responses & follow-up rules
| Method & path | Who | Notes |
|---|---|---|
| `GET /student-responses?studentId=&sheetId=&lessonPlanItemId=` | any | Role-scoped |
| `POST /student-responses` `{lessonPlanItemId, responsesJson, timeSpentSeconds?, manualScore?}` | any with access | Always attributed to the plan's student. `manualScore` (0–100) is honoured for staff only |
| `GET /follow-up-rules` | manager, tutor | |
| `POST/PUT/DELETE /follow-up-rules[/:id]` | manager | |
| `GET /follow-up-rules/logs` | manager, tutor | Tutor: own plans only |

---

## 8. Integrating with the existing Redwood Scholars website

Choose based on what the existing site is built with. **Option A is recommended** unless there's a strong reason otherwise: it needs almost no code changes and keeps this app independently deployable.

### Option A (recommended): run the portal on a subdomain and link to it

1. Deploy this repo as its own Vercel project (see `DEPLOYMENT.md`), or on any Node host (see "Other hosting" below).
2. Add a custom domain such as **`portal.redwoodscholars.co.uk`** in Vercel → Domains, then add the CNAME record at the DNS provider.
3. On the existing website, point the "Login", "Student portal" or "Parent login" buttons to `https://portal.redwoodscholars.co.uk/login`.
4. Optional: if the existing site already *is* the marketing site, stop the portal's own homepage from being used. Change the `/` route in `client/src/App.jsx` to `<Navigate to="/login" replace />`, and change the logo links in `client/src/components/shared/Navbar.jsx` and `Login.jsx` to point to the main site.
5. No CORS or env changes are needed, because the SPA and API share the portal's origin.

### Option B: serve it under a path of the existing site (e.g. `redwoodscholars.co.uk/portal`)

- **If the existing site is on Vercel or Netlify, or sits behind a reverse proxy (nginx, Cloudflare):** keep deploying the portal separately (Option A), then proxy `/portal/*` and `/api/*` to it. For Vercel, add rewrites in the *existing* site's `vercel.json`, for example `{ "source": "/portal/:path*", "destination": "https://portal-project.vercel.app/:path*" }`. The SPA then needs a base path:
  - `client/vite.config.js`: add `base: '/portal/'`
  - `client/src/App.jsx`: `<BrowserRouter basename="/portal" …>`
  - `client/src/lib/api.js`: keep `baseURL: '/api'` if you proxy `/api` too, or use `'/portal/api'` and mount the Express routes under that prefix in `server/src/app.js`.
  - Check hard-coded paths (`navigate('/student')` etc.). React Router applies `basename` to these automatically. Two places use raw browser paths and do **not** get the basename: `window.location.href = '/login'` and the `/login` check in `client/src/lib/api.js`. Prefix both with `/portal`.
- **If the existing site has a Node/Express backend:** you can mount this API directly. `const portalApp = require('./portal/server/src/app'); mainApp.use(portalApp);`. The routes are already prefixed with `/api/...`, so mount it where that won't clash, or rename the prefix in `app.js`. Serve `client/dist` as static files under `/portal` with an SPA fallback to `client/dist/index.html`.

### Option C: rebuild the UI inside the existing site's framework (e.g. Next.js, WordPress)

Treat `server/` as a standalone REST API (§7) and deploy it on its own. Point the new UI at it and set `CLIENT_URL` to the existing site's origin so CORS allows it. This is the most work. Only do it if the portal must look native to the existing site.

### Things that must stay true after integration

- **One database.** The portal's data lives only in its Postgres database. If the existing site has its own user accounts, they're separate. There is no SSO. Linking accounts is future work: the JWT payload is simple, so another backend could issue compatible tokens signed with the same `JWT_SECRET`, but only do that deliberately.
- **HTTPS only in production.** Tokens are bearer tokens stored in localStorage.
- **Function timeout ≥ 60 s** on whatever hosts the API. Only "AI improve" needs it; everything else responds in under a second.
- **Timezone:** leave `APP_TIMEZONE` unset or set to `Europe/London`.

### Other hosting (not Vercel)

The API is a standard Express app. `node server/src/index.js` works on Render, Railway, Fly, a VPS, and so on. Build the client with `npm run build` and serve `client/dist` from the same origin, either with a static middleware in front of Express or via nginx, with an SPA fallback to `index.html`. Run `npm run db:deploy` on each release.

---

## 9. Deploying changes and database migrations

- The Vercel build (`npm run vercel-build`) runs, in order: `prisma migrate deploy` (applies new migrations in `server/prisma/migrations`), then `prisma generate`, then the client build. A failed migration fails the deploy, so production never runs code against the wrong schema.
- To change the schema, edit `schema.prisma` and run `cd server && npx prisma migrate dev --name what_changed` **against a dev database**. Commit the generated folder. Production picks it up on the next deploy.
- Never run `prisma migrate reset`, `prisma db push --force-reset`, or `npm run db:reset` against production. The scripts refuse unless `ALLOW_DB_WIPE=yes` or `ALLOW_DEMO_SEED=yes` is set, but be deliberate anyway.

---

## 10. Security notes and known limitations

Implemented:
- bcrypt password hashes. Minimum 8 characters for new passwords.
- Login rate limiting (in memory, per serverless instance). Put a Vercel Firewall or Cloudflare rule in front if you need hard guarantees.
- Every endpoint checks role **and** ownership. Validated in `scripts/smoke-test.js`.
- Answer keys and tutor notes are hidden from students.
- 500-level error messages are hidden in production.
- CORS only allows the deployment's own origins plus `CLIENT_URL` (localhost is allowed only outside production).
- Destructive scripts are guarded.

Known limitations / future work:
- **No self-service password reset or change.** The manager or tutor resets it in the app and passes the new password on. There's no email service.
- **Tutors are trusted staff:** a tutor can see every student's name (to start a plan) and can create a plan for any student. After that they can see that student's details and reset their password. Restrict `POST /lesson-plans` to managers if that's a concern.
- **Worksheet library data:** it has some duplicates and near-duplicate topic names ("Corbett Five a Day" / "Corbett Five a day"). A one-off clean-up is worth doing. Clicking a sheet in the library opens the editor directly; preview-first would be safer.
- The plan builder doesn't warn about unsaved changes when leaving the page.
- Existing scores from before the lenient marking was added were not recalculated.
- Tokens last 60 days and can't be revoked individually. Rotating `JWT_SECRET` logs everyone out.
- The live lesson uses polling (2–3 s latency). Fine for 1:1 tutoring. Switch to Supabase Realtime or websockets if you need instant sync.
- The client bundle is about 690 kB (FullCalendar + dnd-kit). Code-splitting per role would speed up the first load.
- The in-memory login limiter resets whenever a serverless instance starts cold.
- `LessonPlan.boardUuid` is unused (the whiteboard was removed) and could be dropped in a migration.

---

## 11. Handy commands

```bash
npm run dev                                   # API :3001 + client :5173
npm run build                                 # client production build → client/dist
npm run db:deploy                             # apply migrations to DATABASE_URL
npm run db:studio                             # Prisma Studio (browse the DB)
npm run test:smoke --workspace=server         # full API test against localhost:3001
API_URL=https://portal.example.com/api npm run test:smoke --workspace=server   # against a deployment
npm run qa:seed --workspace=server            # QA logins for manual testing
npm run qa:cleanup --workspace=server
node server/scripts/set-password.js --email a@b.com --password "…"             # change one password (safe)
node server/scripts/set-password.js --email a@b.com --password "…" --create-manager --name "Name"
node server/scripts/reset-db.js --email you@x.com --password "…" --name "Name"   # DANGER: wipes all plans/results (keeps sheets)
```

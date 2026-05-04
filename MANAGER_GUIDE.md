# Manager Guide — Redwood Scholars Portal

A short walkthrough of how to set up your tutoring centre in the portal: adding tutors, adding students, creating lesson plans and running live lessons.

---

## Signing in

1. Go to the portal (your Vercel URL or `redwoodscholars.co.uk` once the domain is live)
2. Click **Portal Login** in the top-right
3. Enter the manager email and password you were set up with

---

## Adding a tutor

Tutors need an account before they can be assigned to lesson plans.

1. From the **dashboard**, click **+ Add Tutor** (top-right)
2. Fill in:
   - **Name** (e.g. "James Tutor")
   - **Email** (their personal or work email — they'll use this to sign in)
   - **Temporary password** — click **Generate** for a memorable one (e.g. `quick-oak-247`), or set your own
3. Click **Add Tutor**

> **Important:** Send the tutor their email and temporary password securely — they'll use these to sign in. They can change the password later (currently a planned feature).

The tutor will now appear in the **Tutors** tab of the dashboard.

---

## Adding a student

Students need an account before you can assign them lesson plans.

1. From the **dashboard**, click **+ Add Student** (top-right)
2. Fill in:
   - **Name**, **Email**, **Temporary password** (same as tutor flow)
   - **Age** — optional but useful for the tutor
   - **Subject focus** — Maths / English / Both
   - **Lesson days** — click the days of the week the student attends (e.g. Mon + Wed)
3. Click **Add Student**

The student will now show in the **Students** table and on the **Calendar** view (on whichever days you selected).

---

## Creating a lesson plan

A lesson plan is a sequence of worksheets the student works through, optionally tied to a specific lesson day.

1. Click on a student from the dashboard, or click **+ New Lesson Plan** in the header
2. Fill in:
   - **Title** (e.g. "Alice's 11+ Maths")
   - **Student** (auto-selected if you came from their profile)
   - **Tutor** — pick from your tutor list
   - **Status** — start as Draft, switch to Active when ready
   - **Lesson day** — pick one of the student's scheduled days (auto-suggests the next occurrence)
3. From the **Sheet Library** (right side), browse by subject → topic → sheet
   - Click the **eye icon** next to any sheet to preview the questions before adding
   - Click a sheet to add it to the plan
4. **Reorder** items by dragging the dots-handle on the left of each item
5. Click the **calendar icon** on any item to set:
   - Scheduled date (when this sheet should be done)
   - Due date
   - Tutor notes (e.g. "revisit denominators next session")
6. Click **Save** when ready

---

## Running a live lesson

1. From the student's profile, click **Start Live Session** at the top of the active plan
2. The whiteboard opens with:
   - **Left sidebar:** the lesson plan items — click any to view alongside the canvas
   - **Centre:** a live whiteboard (real-time drawing, shapes, text — both you and the student can see each other's edits)
   - **Right (when sheet open):** the worksheet questions for reference
3. Need to add a sheet mid-lesson? Click **+ Add** in the left sidebar to search and add without leaving the whiteboard
4. When done, click **End Session**

The student joins the same whiteboard from their dashboard via **Join Live Lesson with Tutor**. The board state persists between sessions — your work is still there next time you open it.

---

## Today view

The **Today** tab on your dashboard shows all sessions scheduled for today across the whole centre. For each:
- ▶ **Start** — opens the live whiteboard
- **Open** — goes to the student's profile
- ✓ **Mark attended** — record that the lesson happened

Below scheduled sessions, you'll see **"Expected today"** — students whose lesson day matches today but who don't have a session created yet. Click **Schedule** to add one.

---

## Tracking lessons (sessions)

Each lesson is recorded as a session. From a student's profile, scroll to **Sessions**:
- **+ Schedule session** to log a future lesson with date, duration, and prep notes
- **✓** to mark a past session as attended
- **✎** to edit / reschedule
- **×** to delete

Past sessions split into:
- ✅ **Attended** — green
- ⚠️ **No record** — amber, so you can chase up

---

## Marking work complete on a student's behalf

If a student does a sheet on paper at the desk:

1. Open the student's profile
2. In the lesson plan items table, find the sheet
3. Click **Mark done**
4. Optionally enter a score (0–100) and a tutor note
5. Click **Mark complete**

This counts toward their progress and average score, and shows in reports.

---

## Calendar view

The **Calendar** tab on the manager dashboard shows the whole centre's schedule for the month. Each student appears on every one of their scheduled lesson days. Click any event to see who, what plan, and quick-actions for editing.

---

## Editing or deleting

- **Edit a student/tutor:** open their profile, click **Edit Profile**
- **Delete a student:** open their profile, click **Delete** (red button next to Edit). This deletes the account, all their plans and history.
- **Delete a tutor:** Tutors tab → **Delete**. Will refuse if they have plans assigned — reassign or delete those first.
- **Delete a lesson plan:** open student's profile, click **Delete Plan**. Confirms before deleting.

---

## Troubleshooting

**A student says they can't log in** — check their email is correct on their profile. If they've forgotten the password, you'll need to reset it for them (currently: ask the developer to run a reset script — a self-serve flow is planned).

**A tutor isn't showing in the lesson plan dropdown** — make sure they're added in the **Tutors** tab.

**No sheets in the library** — the sheet library is shared across the whole centre. They're loaded from the original worksheet PDFs. If the library is empty, contact the developer.

**The live session won't connect** — refresh the page. The whiteboard uses a third-party real-time service that occasionally needs a reconnect.

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
   - **Temporary password** — click **Generate** for a memorable one (e.g. `maple-otter-comet-47`), or set your own (at least 8 characters)
3. Click **Add Tutor**

> **Important:** Send the tutor their email and temporary password securely — they'll use these to sign in. If they forget it, you can reset it from their profile (see Troubleshooting).

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

## Group sessions (classes)

Most lessons at the centre are small groups. A **group session** is one timetable slot with several students. Each child still has their own plan and work.

- **Create:** click **New group session** on the dashboard or calendar. Give it a title (e.g. "Year 5 Maths"), tutor, date and time, length and location, and choose **repeat weekly** if it's a regular class. Then pick the students.
- **On the calendar** the class shows as one event ("Year 5 Maths · 4"). Click it to see every student, what they're working on that lesson and their scores.
- **Register:** tick Present or Absent per child. Unfinished work carries over to each child's next lesson automatically.
- **Reschedule:** drag the event or click Edit. Every child's lesson and planned work moves with it. For a weekly class you can change just this week or this and all following weeks.
- **Print:** "Print originals" gives one PDF for the whole class, with a cover page per child followed by their sheets.
- **Add or remove students, cancel a week, or ungroup** from the same panel. Cancelling moves each child's work to their next lesson.

## Rescheduling and cancelling a lesson

- **Move a lesson:** drag it on the calendar, or click the pencil icon in the student's Sessions list. Its planned sheets move with it. If the new day already has a lesson, you'll be asked whether to **merge** them.
- **Cancel a lesson** (illness, holiday): use **Cancel lesson** and choose whether its work moves to the next lesson (recommended) or stays unscheduled.
- **Missed a lesson?** Past lessons that weren't marked attended show **Move work to next lesson**.
- **Move one sheet** to a different lesson: use **Move to…** next to it in the Sessions list.

## No accidental repeats

The portal remembers every sheet each student has done, across all their plans. When you pick sheets (plan builder, live lesson "+ Add", AI suggestions), sheets they've already done show **Done 60%** or **Planned**. Adding one again asks for confirmation (useful for revision).

---

## Planning lessons with AI

On a student's page (or in the plan builder), click **✨ Plan with AI**.

1. Choose how many lessons to plan (1–4). Optionally add guidance, e.g. "45 minutes, SATs in May, focus on fractions".
2. Click **Suggest lessons**. After about 20–30 seconds you'll see:
   - a short **assessment** of the student, based on their scores, the questions they got wrong and your notes
   - **focus areas**
   - suggested worksheets and tasks for each lesson, each with a reason
3. Click any sheet name to preview it. Untick anything you don't want, and choose which session each lesson goes into.
4. Click **Add to lessons**. The AI's reasons, the lesson goal and teaching tips are saved as private tutor notes on the items.

Nothing changes until you click Add. Always check the suggestions; you know the student best. Sheets marked **review** may have errors in the digital version, so print the original PDF for those.

---

## Printing worksheets

**Preview any sheet:** click its name anywhere in a plan (student page, sessions, History, plan builder, library). The pop-up has two views: **Digital** (the online version) and **📄 Original scan** (the real worksheet PDF).

**Print one lesson:** on the student's page, click **🖨 Print lesson pack** and pick the session. Then either:
- **Open print view (digital):** a clean A4 version of the digital sheets, with optional answer key.
- **📄 Download original sheets (PDF):** the original scanned worksheets merged into one PDF in lesson order, with a cover page checklist. Items with no scan (IXL tasks, a few hand-made sheets) are listed on the cover.

**Print everything for a day ("print run"):** on the **Today** tab, pick the day (click **Tomorrow** to prepare the evening before) and click **Print all originals**. You get one PDF with every student's lesson: a cover page per student, then their sheets. Print it once and hand them out.

---

## Running a live lesson

1. From the student's profile (or the **Today** tab), click **Start Live Session**
2. The live room opens:
   - **Left sidebar:** this lesson's items. Click one to open it on **both** screens
   - **Centre:** the worksheet. As the student types, their answers appear on your screen within a couple of seconds. The expected answer is shown under each question
3. Mark each answer **✓ Correct** or **✗ Wrong**. The student sees your marks appear next to their answers
4. Click **Save result** when you're done with a sheet. This saves the student's answers and your marks to their record, marks the item complete, and shows the score
5. Need another sheet mid-lesson? Click **+ Add** in the sidebar to search the library and add it to today's lesson
6. Click **End** when finished. Mark the session attended from the student's profile or the Today tab. Anything not finished moves to the next lesson automatically

The student joins from their dashboard via **Join Live Lesson**. If they join before you've started, they see a "your lesson hasn't started yet" screen that opens by itself as soon as you start.

---

## Today view

The **Today** tab on your dashboard shows all sessions scheduled for today across the whole centre. For each:
- ▶ **Start** — opens the live lesson room
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

**A student says they can't log in** — check their email is correct on their profile. If they've forgotten the password, open their profile and click **Reset password**. Leave the box blank to generate a memorable one, or type your own (at least 8 characters). The new password is shown once: pass it on to the family. Tutors can do this for their own students too. After 10 wrong attempts, login is paused for 15 minutes.

**A tutor isn't showing in the lesson plan dropdown** — make sure they're added in the **Tutors** tab.

**No sheets in the library** — the sheet library is shared across the whole centre. They're loaded from the original worksheet PDFs. If the library is empty, contact the developer.

**The live session isn't updating** — answers and marks sync every 2–3 seconds. If nothing changes for longer, refresh the page on both sides. Nothing is lost: answers are saved on the server as they're typed.

**The whole site says it can't connect** — the database may be paused (this happens on the free hosting tier after a quiet week). Contact the developer. It takes a minute to restore.

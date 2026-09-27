const express = require('express');
const prisma = require('../prisma');
const { auth, requireRole } = require('../middleware/auth');
const { ensureRecurringSessions } = require('../lib/recurring-sessions');
const { zonedDayRange, zonedDateKey } = require('../lib/time');
const { calculateScore, isAnswerCorrect, hasAnswerKey } = require('../lib/scoring');
const { removeStaleCarryCopies } = require('../lib/items');
const { carryOverIncompleteItems, cancelLessonSession } = require('../lib/lessons');
const { sendOriginalsPack } = require('../lib/originals-pack');
const { httpError, parseId, validateIdParam, getPlanForAccess, parseDate } = require('../lib/access');

const router = express.Router();
router.param('id', validateIdParam);

// Load a session and check the caller can see its plan.
async function loadSessionGuard(req, sessionId, { staffOnly = false } = {}) {
  const session = await prisma.lessonSession.findUnique({
    where: { id: sessionId },
    include: { lessonPlan: { select: { id: true, studentId: true, tutorId: true } }, groupSession: { select: { tutorId: true } } }
  });
  if (!session) throw httpError(404, 'Session not found');
  const { userId, role } = req.user;
  if (staffOnly && role === 'student') throw httpError(403, 'Forbidden');
  if (role === 'student' && session.lessonPlan.studentId !== userId) throw httpError(403, 'Forbidden');
  if (role === 'tutor' && session.lessonPlan.tutorId !== userId && session.groupSession?.tutorId !== userId) throw httpError(403, 'Forbidden');
  return session;
}

function parseDuration(v) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 600) throw httpError(400, 'durationMins must be 0-600');
  return n;
}

// Live answers/marks are stored per item: { [itemId]: { [questionId]: value } }
function liveMap(json) {
  return json && typeof json === 'object' && !Array.isArray(json) ? json : {};
}

// GET /api/sessions?date=YYYY-MM-DD | ?from=ISO&to=ISO
// `date` is a local calendar day in the centre's timezone.
router.get('/', auth, async (req, res, next) => {
  try {
    const { userId, role } = req.user;
    const { date, from, to } = req.query;

    const where = {};
    if (role === 'student') where.lessonPlan = { studentId: userId };
    else if (role === 'tutor') where.OR = [{ lessonPlan: { tutorId: userId } }, { groupSession: { tutorId: userId } }];

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      const { start, end } = zonedDayRange(date);
      where.scheduledAt = { gte: start, lte: end };
    } else if (from || to) {
      const f = parseDate(from), t = parseDate(to);
      if ((from && !f) || (to && !t)) return res.status(400).json({ error: 'Invalid from/to date' });
      where.scheduledAt = {};
      if (f) where.scheduledAt.gte = f;
      if (t) where.scheduledAt.lte = t;
    }

    const sessions = await prisma.lessonSession.findMany({
      where,
      include: {
        lessonPlan: {
          select: {
            id: true, title: true, studentId: true, tutorId: true, status: true,
            student: { select: { id: true, name: true, email: true, subjectFocus: true } },
            tutor:   { select: { id: true, name: true } }
          }
        },
        items: {
          orderBy: { sequenceOrder: 'asc' },
          include: {
            sheet: { select: { id: true, title: true, subject: true, topic: true } },
            studentResponses: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, score: true, completedAt: true } }
          }
        }
      },
      orderBy: { scheduledAt: 'asc' }
    });

    if (role === 'student') {
      // Hide tutor-private notes and live-room internals from students
      return res.json(sessions.map(({ notes, liveAnswers, liveMarks, ...s }) => ({
        ...s,
        items: s.items.map(({ tutorNotes, ...i }) => i)
      })));
    }
    res.json(sessions);
  } catch (err) { next(err); }
});

// GET /api/sessions/originals?date=YYYY-MM-DD  (manager/tutor)
// Mass print: one PDF of the original worksheets for EVERY lesson on a day
// (tutors: their own students), each lesson starting with a cover page.
router.get('/originals', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const date = String(req.query.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    const { start, end } = zonedDayRange(date);
    const where = { scheduledAt: { gte: start, lte: end } };
    if (req.user.role === 'tutor') where.lessonPlan = { tutorId: req.user.userId };
    const sessions = await prisma.lessonSession.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      select: {
        scheduledAt: true,
        lessonPlan: { select: { title: true, student: { select: { name: true } }, tutor: { select: { name: true } } } },
        items: {
          orderBy: { sequenceOrder: 'asc' },
          select: { status: true, customTitle: true, customType: true, sheet: { select: { id: true, title: true } } },
        },
      },
    });
    if (!sessions.length) return res.status(404).json({ error: 'No lessons on that day' });
    const tz = process.env.APP_TIMEZONE || 'Europe/London';
    const labels = { ixl_maths: 'IXL Maths', ixl_english: 'IXL English', paper: 'Paper activity', other: 'Task' };
    const groups = sessions.map(s => ({
      heading: s.lessonPlan.student.name,
      subheading: `${new Date(s.scheduledAt).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: tz })} · ${s.lessonPlan.title} · Tutor: ${s.lessonPlan.tutor.name}`,
      items: s.items.map(i => ({
        sheetId: i.sheet?.id || null,
        title: i.sheet ? i.sheet.title : i.customTitle,
        kind: i.sheet ? null : (labels[i.customType] || 'Task'),
        done: i.status === 'completed',
      })),
    }));
    await sendOriginalsPack(res, groups, `print-run-${date}`);
  } catch (err) { next(err); }
});

// POST /api/sessions - create a session for a plan
router.post('/', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const plan = await getPlanForAccess(req, req.body.lessonPlanId);
    const scheduledAt = parseDate(req.body.scheduledAt);
    if (!scheduledAt) return res.status(400).json({ error: 'A valid scheduledAt is required' });

    const session = await prisma.lessonSession.create({
      data: {
        lessonPlanId: plan.id,
        scheduledAt,
        durationMins: parseDuration(req.body.durationMins) ?? null,
        notes: req.body.notes || null
      },
      include: {
        lessonPlan: {
          select: { id: true, title: true, student: { select: { id: true, name: true } }, tutor: { select: { id: true, name: true } } }
        }
      }
    });
    res.status(201).json(session);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A session already exists at that exact time for this plan' });
    next(err);
  }
});

// PUT /api/sessions/:id - update / reschedule / mark attended
// When a session becomes attended, incomplete items are cloned into the next
// future session (see carryOverIncompleteItems).
router.put('/:id', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const sessionId = parseId(req.params.id);
    const existing = await loadSessionGuard(req, sessionId);
    const { scheduledAt, attendedAt, notes, markAttended } = req.body;

    const data = {};
    if (scheduledAt !== undefined) {
      const d = parseDate(scheduledAt);
      if (!d) return res.status(400).json({ error: 'Invalid scheduledAt' });
      data.scheduledAt = d;
    }
    if (attendedAt !== undefined) {
      const d = parseDate(attendedAt);
      if (attendedAt && !d) return res.status(400).json({ error: 'Invalid attendedAt' });
      data.attendedAt = d;
    }
    if (markAttended === true && !data.attendedAt) data.attendedAt = new Date();
    const duration = parseDuration(req.body.durationMins);
    if (duration !== undefined) data.durationMins = duration;
    if (notes !== undefined) data.notes = notes ? String(notes).slice(0, 5000) : null;

    const willBecomeAttended = !existing.attendedAt && !!data.attendedAt;

    // Rescheduling onto a day that already has a lesson for this plan:
    // ask first (409), or merge the two when the client confirms ({ merge: true })
    if (data.scheduledAt) {
      const { start, end } = zonedDayRange(zonedDateKey(data.scheduledAt));
      const clash = await prisma.lessonSession.findFirst({
        where: { lessonPlanId: existing.lessonPlanId, id: { not: sessionId }, scheduledAt: { gte: start, lte: end } },
        select: { id: true, scheduledAt: true, attendedAt: true },
      });
      if (clash && !req.body.merge) {
        return res.status(409).json({
          error: 'There is already a lesson for this student on that day.',
          conflict: { id: clash.id, scheduledAt: clash.scheduledAt },
        });
      }
      if (clash && req.body.merge) {
        if (existing.attendedAt) return res.status(400).json({ error: 'An attended lesson can\'t be merged into another' });
        await prisma.$transaction([
          prisma.lessonPlanItem.updateMany({ where: { sessionId }, data: { sessionId: clash.id } }),
          prisma.lessonSession.delete({ where: { id: sessionId } }),
        ]);
        return res.json({ merged: true, mergedInto: clash.id, scheduledAt: clash.scheduledAt });
      }
    }

    const session = await prisma.lessonSession.update({
      where: { id: sessionId },
      data,
      include: {
        lessonPlan: {
          select: { id: true, title: true, student: { select: { id: true, name: true } }, tutor: { select: { id: true, name: true } } }
        }
      }
    });

    const carriedOver = willBecomeAttended ? await carryOverIncompleteItems(sessionId, session.lessonPlanId) : 0;
    res.json({ ...session, _carriedOver: carriedOver });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Another session for this plan is already at that time' });
    next(err);
  }
});

// POST /api/sessions/:id/cancel  { moveWork?: 'next' | 'unscheduled' }
// Cancel a lesson that hasn't happened (student ill, holiday…). Its unfinished
// work MOVES (not copies — nothing was attempted) to the next lesson, or to the
// unscheduled pool. The lesson is then removed, unless it already holds
// completed work, in which case it's kept and labelled cancelled.
router.post('/:id/cancel', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const sessionId = parseId(req.params.id);
    const session = await loadSessionGuard(req, sessionId);
    if (session.attendedAt) return res.status(400).json({ error: 'This lesson is marked as attended — it can\'t be cancelled' });
    res.json({ success: true, ...(await cancelLessonSession(session, req.body.moveWork)) });
  } catch (err) { next(err); }
});

// POST /api/sessions/:id/carryover - manually trigger carryover
router.post('/:id/carryover', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const sessionId = parseId(req.params.id);
    const session = await loadSessionGuard(req, sessionId);
    const carriedOver = await carryOverIncompleteItems(sessionId, session.lessonPlanId);
    res.json({ success: true, carriedOver });
  } catch (err) { next(err); }
});

// PATCH /api/sessions/:id/live-state
// Body: { activeItemId?, itemId?, answers?, marks? }
//  - tutor/manager: set activeItemId (which sheet is on screen) and marks
//  - student:       update their own answers
// answers/marks are scoped to `itemId` so different sheets never collide.
router.patch('/:id/live-state', auth, async (req, res, next) => {
  try {
    const sessionId = parseId(req.params.id);
    const session = await loadSessionGuard(req, sessionId);
    const isStaff = req.user.role !== 'student';
    const { activeItemId, answers, marks } = req.body;

    const data = { liveUpdatedAt: new Date() };
    let answersPatch = null;
    let marksPatch = null;

    if (activeItemId !== undefined) {
      if (!isStaff) return res.status(403).json({ error: 'Only the tutor can change the active sheet' });
      if (activeItemId === null || activeItemId === '') {
        data.activeItemId = null;
      } else {
        const itemId = parseId(activeItemId);
        const item = itemId && await prisma.lessonPlanItem.findUnique({ where: { id: itemId }, select: { lessonPlanId: true } });
        if (!item || item.lessonPlanId !== session.lessonPlan.id) return res.status(400).json({ error: 'Item not in this plan' });
        data.activeItemId = itemId;
      }
    }

    if (answers !== undefined || marks !== undefined) {
      const itemKey = String(parseId(req.body.itemId) || '');
      if (!itemKey) return res.status(400).json({ error: 'itemId is required with answers/marks' });
      if (answers !== undefined) {
        if (isStaff) return res.status(403).json({ error: 'Only the student can enter answers' });
        if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return res.status(400).json({ error: 'answers must be an object' });
        const item = await prisma.lessonPlanItem.findUnique({ where: { id: Number(itemKey) }, select: { lessonPlanId: true, status: true } });
        if (!item || item.lessonPlanId !== session.lessonPlan.id) return res.status(400).json({ error: 'Item not in this plan' });
        if (item.status === 'completed') return res.status(409).json({ error: 'This sheet is already finished' });
        answersPatch = answers;
      }
      if (marks !== undefined) {
        if (!isStaff) return res.status(403).json({ error: 'Only the tutor can mark answers' });
        if (!marks || typeof marks !== 'object' || Array.isArray(marks)) return res.status(400).json({ error: 'marks must be an object' });
        if (!Object.values(marks).every(m => m === null || m === 'correct' || m === 'wrong')) return res.status(400).json({ error: "marks must be 'correct', 'wrong' or null" });
        marksPatch = marks;
      }
    }

    // Merge answers inside Postgres in one statement so rapid-fire saves
    // (the student tabbing between boxes) can never overwrite each other.
    if (answersPatch) {
      const itemKey = String(parseId(req.body.itemId));
      await prisma.$executeRaw`
        UPDATE lesson_sessions
        SET live_answers = jsonb_set(
              COALESCE(live_answers, '{}'::jsonb),
              ARRAY[${itemKey}]::text[],
              COALESCE(live_answers -> ${itemKey}, '{}'::jsonb) || ${JSON.stringify(answersPatch)}::jsonb,
              true)
        WHERE id = ${sessionId}`;
    }

    // Marks: merge per question in one statement (null clears a mark), so
    // quick successive clicks can't overwrite each other with stale copies
    if (marksPatch) {
      const itemKey = String(parseId(req.body.itemId));
      const set = Object.fromEntries(Object.entries(marksPatch).filter(([, m]) => m));
      const clear = Object.keys(marksPatch).filter(k => marksPatch[k] === null);
      await prisma.$executeRaw`
        UPDATE lesson_sessions
        SET live_marks = jsonb_set(
              COALESCE(live_marks, '{}'::jsonb),
              ARRAY[${itemKey}]::text[],
              (COALESCE(live_marks -> ${itemKey}, '{}'::jsonb) - ${clear}::text[]) || ${JSON.stringify(set)}::jsonb,
              true)
        WHERE id = ${sessionId}`;
    }

    const updated = await prisma.lessonSession.update({
      where: { id: sessionId },
      data,
      select: { id: true, activeItemId: true, liveAnswers: true, liveMarks: true, liveUpdatedAt: true }
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// GET /api/sessions/:id/live-state - lightweight read for polling
router.get('/:id/live-state', auth, async (req, res, next) => {
  try {
    const sessionId = parseId(req.params.id);
    await loadSessionGuard(req, sessionId);
    // The student's polling doubles as a presence heartbeat for the tutor
    if (req.user.role === 'student') {
      await prisma.lessonSession.update({ where: { id: sessionId }, data: { studentSeenAt: new Date() } });
    }
    const session = await prisma.lessonSession.findUnique({
      where: { id: sessionId },
      select: { id: true, activeItemId: true, liveAnswers: true, liveMarks: true, liveUpdatedAt: true, attendedAt: true, studentSeenAt: true }
    });
    res.json({ ...session, studentOnline: !!session.studentSeenAt && Date.now() - session.studentSeenAt.getTime() < 15000 });
  } catch (err) { next(err); }
});

// POST /api/sessions/:id/finalize-item  { itemId }
// Tutor saves the result of a sheet worked on live: the student's live
// answers become a StudentResponse and the item is marked completed.
// Score = the tutor's correct/wrong marks if any were made, otherwise auto-scored.
router.post('/:id/finalize-item', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const sessionId = parseId(req.params.id);
    const session = await loadSessionGuard(req, sessionId);
    const itemId = parseId(req.body.itemId);
    if (!itemId) return res.status(400).json({ error: 'itemId is required' });

    const item = await prisma.lessonPlanItem.findUnique({
      where: { id: itemId },
      select: { id: true, lessonPlanId: true, sheetId: true, sheet: { select: { contentJson: true } } }
    });
    if (!item || item.lessonPlanId !== session.lessonPlan.id) return res.status(404).json({ error: 'Item not in this plan' });

    const answers = liveMap(liveMap(session.liveAnswers)[itemId]);
    const marks = liveMap(liveMap(session.liveMarks)[itemId]);
    const questions = item.sheet?.contentJson?.questions || [];
    const pointsFor = qid => questions.find(q => q.id === qid)?.points || 1;
    // Unmarked questions that have an answer key are auto-marked, so a
    // partly-marked sheet still gets a fair score
    const effective = { ...marks };
    if (Object.keys(marks).length > 0) {
      for (const q of questions) {
        if (effective[q.id] || q.type === 'free_text' || q.type === 'image_based' || !hasAnswerKey(q)) continue;
        effective[q.id] = isAnswerCorrect(q, answers[q.id]) ? 'correct' : 'wrong';
      }
    }
    const marked = Object.entries(effective).filter(([, m]) => m === 'correct' || m === 'wrong');
    let score = null;
    if (marked.length > 0) {
      // Tutor's correct/wrong marks, weighted by each question's points
      const total = marked.reduce((sum, [qid]) => sum + pointsFor(qid), 0);
      const earned = marked.filter(([, m]) => m === 'correct').reduce((sum, [qid]) => sum + pointsFor(qid), 0);
      score = Math.round((earned / total) * 100);
    } else if (item.sheet) {
      score = calculateScore(item.sheet.contentJson, answers);
    }

    await prisma.$transaction(async (tx) => {
      // File the work under the lesson where it was actually done
      await tx.lessonPlanItem.update({ where: { id: item.id }, data: { status: 'completed', sessionId } });
      await removeStaleCarryCopies(tx, item.id);
      if (!item.sheetId) return;
      const responsesJson = { ...answers, _liveSessionId: sessionId, _tutorMarks: effective };
      // Saving again from the same live lesson updates that result rather
      // than adding a second attempt.
      const previous = await tx.studentResponse.findFirst({
        where: { lessonPlanItemId: item.id, responsesJson: { path: ['_liveSessionId'], equals: sessionId } },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
      });
      if (previous) {
        await tx.studentResponse.update({ where: { id: previous.id }, data: { responsesJson, score, completedAt: new Date() } });
      } else {
        await tx.studentResponse.create({
          data: { studentId: session.lessonPlan.studentId, sheetId: item.sheetId, lessonPlanItemId: item.id, responsesJson, score, completedAt: new Date() }
        });
      }
    });
    res.json({ success: true, score });
  } catch (err) { next(err); }
});

// DELETE /api/sessions/:id  (items attached to it return to the unscheduled pool)
router.delete('/:id', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const sessionId = parseId(req.params.id);
    await loadSessionGuard(req, sessionId);
    await prisma.lessonSession.delete({ where: { id: sessionId } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;

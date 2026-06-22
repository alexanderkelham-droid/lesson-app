const express = require('express');
const prisma = require('../prisma');
const { auth, requireRole } = require('../middleware/auth');
const { ensureRecurringSessions } = require('../lib/recurring-sessions');

const router = express.Router();

// Access guard for a session by id
async function loadSessionGuard(req, sessionId) {
  const { userId, role } = req.user;
  const session = await prisma.lessonSession.findUnique({
    where: { id: sessionId },
    include: { lessonPlan: { select: { id: true, studentId: true, tutorId: true } } }
  });
  if (!session) {
    const err = new Error('Session not found'); err.status = 404; throw err;
  }
  if (role === 'student' && session.lessonPlan.studentId !== userId) {
    const err = new Error('Forbidden'); err.status = 403; throw err;
  }
  if (role === 'tutor' && session.lessonPlan.tutorId !== userId) {
    const err = new Error('Forbidden'); err.status = 403; throw err;
  }
  return session;
}

// GET /api/sessions?date=YYYY-MM-DD&from=...&to=...
// Returns sessions, scoped by role.
router.get('/', auth, async (req, res, next) => {
  try {
    const { userId, role } = req.user;
    const { date, from, to } = req.query;

    const where = {};
    if (role === 'student') where.lessonPlan = { studentId: userId };
    else if (role === 'tutor') where.lessonPlan = { tutorId: userId };

    if (date) {
      const d = new Date(date);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
      const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
      where.scheduledAt = { gte: start, lte: end };
    } else if (from || to) {
      where.scheduledAt = {};
      if (from) where.scheduledAt.gte = new Date(from);
      if (to)   where.scheduledAt.lte = new Date(to);
    }

    const sessions = await prisma.lessonSession.findMany({
      where,
      include: {
        lessonPlan: {
          include: {
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

    res.json(sessions);
  } catch (err) { next(err); }
});

// POST /api/sessions - create a session for a plan
router.post('/', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const { lessonPlanId, scheduledAt, durationMins, notes } = req.body;
    if (!lessonPlanId || !scheduledAt) {
      return res.status(400).json({ error: 'lessonPlanId and scheduledAt required' });
    }

    // Tutor can only create on their own plans
    if (req.user.role === 'tutor') {
      const plan = await prisma.lessonPlan.findUnique({
        where: { id: parseInt(lessonPlanId) }, select: { tutorId: true }
      });
      if (!plan || plan.tutorId !== req.user.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const session = await prisma.lessonSession.create({
      data: {
        lessonPlanId: parseInt(lessonPlanId),
        scheduledAt: new Date(scheduledAt),
        durationMins: durationMins ? parseInt(durationMins) : null,
        notes: notes || null
      },
      include: {
        lessonPlan: {
          include: {
            student: { select: { id: true, name: true } },
            tutor: { select: { id: true, name: true } }
          }
        }
      }
    });
    res.status(201).json(session);
  } catch (err) { next(err); }
});

// PUT /api/sessions/:id - update / reschedule / mark attended
// When markAttended flips to true, any incomplete items belonging to this
// session auto-carry over to the next future session of the same plan (or
// to the unscheduled pool if there's none).
router.put('/:id', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id);
    const existing = await loadSessionGuard(req, sessionId);

    const { scheduledAt, attendedAt, durationMins, notes, markAttended } = req.body;

    const data = {};
    if (scheduledAt !== undefined) data.scheduledAt = new Date(scheduledAt);
    if (attendedAt !== undefined) data.attendedAt = attendedAt ? new Date(attendedAt) : null;
    if (markAttended === true && !attendedAt) data.attendedAt = new Date();
    if (durationMins !== undefined) data.durationMins = durationMins ? parseInt(durationMins) : null;
    if (notes !== undefined) data.notes = notes;

    const willBecomeAttended = !existing.attendedAt && (data.attendedAt || markAttended === true);

    const session = await prisma.lessonSession.update({
      where: { id: sessionId },
      data,
      include: {
        lessonPlan: {
          include: {
            student: { select: { id: true, name: true } },
            tutor: { select: { id: true, name: true } }
          }
        }
      }
    });

    let carriedOver = 0;
    if (willBecomeAttended) {
      carriedOver = await carryOverIncompleteItems(sessionId, session.lessonPlanId);
    }

    res.json({ ...session, _carriedOver: carriedOver });
  } catch (err) { next(err); }
});

// Internal helper: move incomplete items from `fromSessionId` to the next
// future session of the same plan. If there's no future session, items go
// back to the unscheduled pool (sessionId = null).
async function carryOverIncompleteItems(fromSessionId, lessonPlanId) {
  // Pull full item rows so we can clone them
  const incompleteItems = await prisma.lessonPlanItem.findMany({
    where: {
      sessionId: fromSessionId,
      status: { not: 'completed' }
    },
    select: {
      id: true, sheetId: true, customTitle: true, customType: true,
      tutorNotes: true, dueDate: true, sequenceOrder: true
    }
  });
  if (incompleteItems.length === 0) return 0;

  // Ensure a future session exists to carry into
  await ensureRecurringSessions(lessonPlanId);
  const nextSession = await prisma.lessonSession.findFirst({
    where: {
      lessonPlanId,
      id: { not: fromSessionId },
      attendedAt: null,
      scheduledAt: { gte: new Date() }
    },
    orderBy: { scheduledAt: 'asc' },
    select: { id: true }
  });
  const targetSessionId = nextSession?.id || null;

  // Find the current max sequenceOrder in the plan so clones go to the end
  const last = await prisma.lessonPlanItem.findFirst({
    where: { lessonPlanId },
    orderBy: { sequenceOrder: 'desc' },
    select: { sequenceOrder: true }
  });
  let seq = (last?.sequenceOrder || 0) + 1;

  // Clone each incomplete item as a fresh entity in the next session.
  // The original item stays attached to fromSessionId, preserving its history.
  // carriedFromId links the clone back to the original for "carried from last
  // Tuesday" UX.
  await prisma.$transaction(
    incompleteItems.map(item =>
      prisma.lessonPlanItem.create({
        data: {
          lessonPlanId,
          sessionId: targetSessionId,
          sheetId: item.sheetId,
          customTitle: item.customTitle,
          customType: item.customType,
          tutorNotes: item.tutorNotes,
          dueDate: item.dueDate,
          sequenceOrder: seq++,
          status: 'available',
          carriedFromId: item.id
        }
      })
    )
  );
  return incompleteItems.length;
}

// POST /api/sessions/:id/carryover - manually trigger carryover
router.post('/:id/carryover', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id);
    const session = await loadSessionGuard(req, sessionId);
    const carriedOver = await carryOverIncompleteItems(sessionId, session.lessonPlanId);
    res.json({ success: true, carriedOver });
  } catch (err) { next(err); }
});

// PATCH /api/sessions/:id/live-state - update live-room state
// Teacher: can change activeItemId and set marks
// Student: can update liveAnswers
router.patch('/:id/live-state', auth, async (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id);
    const session = await prisma.lessonSession.findUnique({
      where: { id: sessionId },
      include: { lessonPlan: { select: { studentId: true, tutorId: true } } }
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const { userId, role } = req.user;
    const isStudent = role === 'student' && session.lessonPlan.studentId === userId;
    const isTutor   = role === 'tutor'   && session.lessonPlan.tutorId === userId;
    const isManager = role === 'manager';
    if (!isStudent && !isTutor && !isManager) return res.status(403).json({ error: 'Forbidden' });

    const { activeItemId, answers, marks } = req.body;

    const data = { liveUpdatedAt: new Date() };

    // Teacher (tutor/manager) can set activeItemId and marks
    if ((isTutor || isManager)) {
      if (activeItemId !== undefined) data.activeItemId = activeItemId ? parseInt(activeItemId) : null;
      if (marks !== undefined) data.liveMarks = marks;
    }

    // Student can only update their own answers
    if (answers !== undefined) {
      // Merge with existing
      const current = (session.liveAnswers && typeof session.liveAnswers === 'object') ? session.liveAnswers : {};
      data.liveAnswers = { ...current, ...answers };
    }

    const updated = await prisma.lessonSession.update({
      where: { id: sessionId },
      data
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// GET /api/sessions/:id/live-state - lightweight read for polling
router.get('/:id/live-state', auth, async (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id);
    const { userId, role } = req.user;
    const session = await prisma.lessonSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true, activeItemId: true, liveAnswers: true, liveMarks: true,
        liveUpdatedAt: true, attendedAt: true,
        lessonPlan: { select: { studentId: true, tutorId: true } }
      }
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (role === 'student' && session.lessonPlan.studentId !== userId) return res.status(403).json({ error: 'Forbidden' });
    if (role === 'tutor' && session.lessonPlan.tutorId !== userId) return res.status(403).json({ error: 'Forbidden' });
    res.json(session);
  } catch (err) { next(err); }
});

// DELETE /api/sessions/:id
router.delete('/:id', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id);
    await loadSessionGuard(req, sessionId);
    await prisma.lessonSession.delete({ where: { id: sessionId } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;

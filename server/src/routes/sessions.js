const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

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
router.put('/:id', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id);
    await loadSessionGuard(req, sessionId);

    const { scheduledAt, attendedAt, durationMins, notes, markAttended } = req.body;

    const data = {};
    if (scheduledAt !== undefined) data.scheduledAt = new Date(scheduledAt);
    if (attendedAt !== undefined) data.attendedAt = attendedAt ? new Date(attendedAt) : null;
    if (markAttended === true && !attendedAt) data.attendedAt = new Date();
    if (durationMins !== undefined) data.durationMins = durationMins ? parseInt(durationMins) : null;
    if (notes !== undefined) data.notes = notes;

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

const express = require('express');
const crypto = require('crypto');
const prisma = require('../prisma');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Helper: enforce that the caller can mutate this plan
async function assertCanMutatePlan(req, planId) {
  const { userId, role } = req.user;
  if (role === 'manager') return; // managers have full access
  const plan = await prisma.lessonPlan.findUnique({
    where: { id: planId },
    select: { tutorId: true }
  });
  if (!plan) {
    const err = new Error('Plan not found');
    err.status = 404;
    throw err;
  }
  if (role === 'tutor' && plan.tutorId !== userId) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
}

function evaluateTrigger(condition, score) {
  const match = condition.match(/score\s*([<>]=?|==)\s*(\d+(\.\d+)?)/);
  if (!match) return false;
  const operator = match[1];
  const threshold = parseFloat(match[2]);
  switch (operator) {
    case '<':  return score < threshold;
    case '>':  return score > threshold;
    case '<=': return score <= threshold;
    case '>=': return score >= threshold;
    case '==': return score === threshold;
    default:   return false;
  }
}

// GET /api/lesson-plans - scoped by role
router.get('/', auth, async (req, res, next) => {
  try {
    const { userId, role } = req.user;
    const where = role === 'student' ? { studentId: userId }
      : role === 'tutor' ? { tutorId: userId }
      : {};

    const plans = await prisma.lessonPlan.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, email: true } },
        tutor:   { select: { id: true, name: true, email: true } },
        items:   { orderBy: { sequenceOrder: 'asc' }, include: { sheet: { select: { id: true, title: true, subject: true, topic: true, difficultyLevel: true, sheetType: true } }, studentResponses: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, score: true, completedAt: true, timeSpentSeconds: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(plans);
  } catch (err) { next(err); }
});

// GET /api/lesson-plans/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    const plan = await prisma.lessonPlan.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        student: { select: { id: true, name: true, email: true } },
        tutor:   { select: { id: true, name: true, email: true } },
        items: {
          orderBy: { sequenceOrder: 'asc' },
          include: {
            sheet: true,
            session: { select: { id: true, scheduledAt: true, attendedAt: true } },
            studentResponses: {
              orderBy: { createdAt: 'desc' }, take: 1,
              select: { id: true, score: true, completedAt: true, timeSpentSeconds: true }
            }
          }
        },
        sessions: {
          orderBy: { scheduledAt: 'asc' },
          select: { id: true, scheduledAt: true, attendedAt: true, durationMins: true, notes: true }
        }
      }
    });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const { userId, role } = req.user;
    if (role === 'student' && plan.studentId !== userId) return res.status(403).json({ error: 'Forbidden' });
    if (role === 'tutor' && plan.tutorId !== userId) return res.status(403).json({ error: 'Forbidden' });

    res.json(plan);
  } catch (err) { next(err); }
});

// POST /api/lesson-plans - manager or tutor
router.post('/', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const { studentId, tutorId, title, startDate, status, lessonDayOfWeek, studentNotes } = req.body;
    if (!studentId || !tutorId || !title) {
      return res.status(400).json({ error: 'studentId, tutorId, title required' });
    }
    const plan = await prisma.lessonPlan.create({
      data: {
        studentId: parseInt(studentId),
        tutorId: parseInt(tutorId),
        title,
        startDate: startDate ? new Date(startDate) : null,
        status: status || 'draft',
        lessonDayOfWeek: lessonDayOfWeek !== undefined && lessonDayOfWeek !== '' ? parseInt(lessonDayOfWeek) : null,
        studentNotes: studentNotes || null
      },
      include: {
        student: { select: { id: true, name: true, email: true } },
        tutor:   { select: { id: true, name: true, email: true } }
      }
    });
    res.status(201).json(plan);
  } catch (err) { next(err); }
});

// PUT /api/lesson-plans/:id
router.put('/:id', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const planId = parseInt(req.params.id);
    await assertCanMutatePlan(req, planId);
    const { title, startDate, status, tutorId, lessonDayOfWeek, studentNotes } = req.body;
    // Tutors cannot reassign plans to another tutor
    const safeTutorId = req.user.role === 'manager' ? tutorId : undefined;
    const plan = await prisma.lessonPlan.update({
      where: { id: planId },
      data: {
        ...(title && { title }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(status && { status }),
        ...(safeTutorId && { tutorId: parseInt(safeTutorId) }),
        ...(lessonDayOfWeek !== undefined && { lessonDayOfWeek: lessonDayOfWeek !== '' && lessonDayOfWeek !== null ? parseInt(lessonDayOfWeek) : null }),
        ...(studentNotes !== undefined && { studentNotes: studentNotes || null })
      }
    });
    res.json(plan);
  } catch (err) { next(err); }
});

// DELETE /api/lesson-plans/:id - manager only
router.delete('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    await prisma.lessonPlan.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/lesson-plans/:id/items - add sheet to plan
router.post('/:id/items', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const planId = parseInt(req.params.id);
    await assertCanMutatePlan(req, planId);
    const { sheetId, customTitle, customType, scheduledDate, dueDate, status, tutorNotes, sessionId } = req.body;
    if (!sheetId && !customTitle) {
      return res.status(400).json({ error: 'Either sheetId or customTitle is required' });
    }

    const lastItem = await prisma.lessonPlanItem.findFirst({
      where: { lessonPlanId: planId },
      orderBy: { sequenceOrder: 'desc' }
    });
    const sequenceOrder = lastItem ? lastItem.sequenceOrder + 1 : 1;

    const item = await prisma.lessonPlanItem.create({
      data: {
        lessonPlanId: planId,
        sheetId: sheetId ? parseInt(sheetId) : null,
        customTitle: !sheetId ? customTitle : null,
        customType: !sheetId ? (customType || 'other') : null,
        sequenceOrder,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        status: status || 'available',
        tutorNotes: tutorNotes || null,
        sessionId: sessionId ? parseInt(sessionId) : null
      },
      include: { sheet: true }
    });
    res.status(201).json(item);
  } catch (err) { next(err); }
});

// PUT /api/lesson-plans/:id/items/:itemId
router.put('/:id/items/:itemId', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const planId = parseInt(req.params.id);
    const itemId = parseInt(req.params.itemId);
    if (isNaN(planId) || isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid plan or item id' });
    }
    await assertCanMutatePlan(req, planId);

    // Verify item belongs to this plan (clearer 404 than Prisma's P2025 / 500)
    const existing = await prisma.lessonPlanItem.findUnique({
      where: { id: itemId },
      select: { id: true, lessonPlanId: true }
    });
    if (!existing) return res.status(404).json({ error: 'Item not found' });
    if (existing.lessonPlanId !== planId) {
      return res.status(400).json({ error: 'Item does not belong to this plan' });
    }

    const { scheduledDate, dueDate, status, sequenceOrder, tutorNotes, sessionId } = req.body;
    const item = await prisma.lessonPlanItem.update({
      where: { id: itemId },
      data: {
        ...(scheduledDate !== undefined && { scheduledDate: scheduledDate ? new Date(scheduledDate) : null }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(status && { status }),
        ...(sequenceOrder !== undefined && { sequenceOrder: parseInt(sequenceOrder) }),
        ...(tutorNotes !== undefined && { tutorNotes }),
        // sessionId === null means "move to unscheduled pool"
        ...(sessionId !== undefined && { sessionId: sessionId === null ? null : parseInt(sessionId) })
      },
      include: { sheet: true }
    });
    res.json(item);
  } catch (err) {
    // Prisma "record not found" — surface as 404 not 500
    if (err.code === 'P2025') return res.status(404).json({ error: 'Item not found' });
    // Foreign-key violation (e.g. invalid sessionId)
    if (err.code === 'P2003') return res.status(400).json({ error: 'Invalid sessionId — session does not exist' });
    next(err);
  }
});

// DELETE /api/lesson-plans/:id/items/:itemId
router.delete('/:id/items/:itemId', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    await assertCanMutatePlan(req, parseInt(req.params.id));
    await prisma.lessonPlanItem.delete({ where: { id: parseInt(req.params.itemId) } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PATCH /api/lesson-plans/:id/items/reorder
router.patch('/:id/items/reorder', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    await assertCanMutatePlan(req, parseInt(req.params.id));
    const { orderedIds } = req.body; // array of item IDs in new order
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds must be an array' });

    await prisma.$transaction(
      orderedIds.map((itemId, idx) =>
        prisma.lessonPlanItem.update({
          where: { id: itemId },
          data: { sequenceOrder: idx + 1 }
        })
      )
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/lesson-plans/:id/process-completion
router.post('/:id/process-completion', auth, async (req, res, next) => {
  try {
    const planId = parseInt(req.params.id);
    const { lessonPlanItemId, studentResponseId } = req.body;
    if (!lessonPlanItemId || !studentResponseId) {
      return res.status(400).json({ error: 'lessonPlanItemId and studentResponseId required' });
    }

    const item = await prisma.lessonPlanItem.findFirst({
      where: { id: parseInt(lessonPlanItemId), lessonPlanId: planId }
    });
    if (!item) return res.status(404).json({ error: 'Lesson plan item not found' });

    const response = await prisma.studentResponse.findUnique({
      where: { id: parseInt(studentResponseId) }
    });
    if (!response) return res.status(404).json({ error: 'Student response not found' });

    const score = response.score ?? 0;

    // Mark item completed
    await prisma.lessonPlanItem.update({
      where: { id: item.id },
      data: { status: 'completed' }
    });

    // Check follow-up rules ordered by priority
    const rules = await prisma.followUpRule.findMany({
      where: { sourceSheetId: item.sheetId },
      orderBy: { priority: 'asc' }
    });

    let followUpCreated = null;
    for (const rule of rules) {
      if (evaluateTrigger(rule.triggerCondition, score)) {
        // Shift all items after current one up by 1
        await prisma.lessonPlanItem.updateMany({
          where: { lessonPlanId: planId, sequenceOrder: { gt: item.sequenceOrder } },
          data: { sequenceOrder: { increment: 1 } }
        });

        // Insert follow-up item immediately after current
        const newItem = await prisma.lessonPlanItem.create({
          data: {
            lessonPlanId: planId,
            sheetId: rule.followUpSheetId,
            sequenceOrder: item.sequenceOrder + 1,
            status: 'available',
            autoGenerated: true
          },
          include: { sheet: { select: { id: true, title: true, subject: true, topic: true } } }
        });

        await prisma.followUpLog.create({
          data: {
            lessonPlanId: planId,
            studentId: response.studentId,
            triggerRuleId: rule.id,
            sourceSheetId: item.sheetId,
            followUpSheetId: rule.followUpSheetId,
            studentScore: score
          }
        });

        followUpCreated = newItem;
        break; // Apply only the highest-priority matching rule
      }
    }

    // If no follow-up triggered, unlock the next sequential item
    if (!followUpCreated) {
      const nextItem = await prisma.lessonPlanItem.findFirst({
        where: { lessonPlanId: planId, sequenceOrder: item.sequenceOrder + 1 }
      });
      if (nextItem && nextItem.status === 'locked') {
        await prisma.lessonPlanItem.update({
          where: { id: nextItem.id },
          data: { status: 'available' }
        });
      }
    }

    res.json({ success: true, followUpCreated: !!followUpCreated, followUpItem: followUpCreated });
  } catch (err) { next(err); }
});

// GET /api/lesson-plans/:id/follow-up-logs
router.get('/:id/follow-up-logs', auth, async (req, res, next) => {
  try {
    const logs = await prisma.followUpLog.findMany({
      where: { lessonPlanId: parseInt(req.params.id) },
      include: {
        triggerRule: true,
        sourceSheet:   { select: { id: true, title: true } },
        followUpSheet: { select: { id: true, title: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(logs);
  } catch (err) { next(err); }
});

// GET /api/lesson-plans/:id/live-session - get/create the whiteboard room id for this plan
router.get('/:id/live-session', auth, async (req, res, next) => {
  try {
    const planId = parseInt(req.params.id);
    const { userId, role } = req.user;

    const plan = await prisma.lessonPlan.findUnique({
      where: { id: planId },
      select: { id: true, studentId: true, tutorId: true, boardUuid: true }
    });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    // Access control
    if (role === 'student' && plan.studentId !== userId) return res.status(403).json({ error: 'Forbidden' });
    if (role === 'tutor' && plan.tutorId !== userId) return res.status(403).json({ error: 'Forbidden' });

    // Generate boardUuid if missing - this is the room ID for tldraw sync
    let boardUuid = plan.boardUuid;
    if (!boardUuid) {
      boardUuid = crypto.randomUUID();
      await prisma.lessonPlan.update({
        where: { id: planId },
        data: { boardUuid }
      });
    }

    // Find or create a session for today so we have a sync target for the
    // interactive sheet. Teachers can create; students just look up.
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    let session = await prisma.lessonSession.findFirst({
      where: { lessonPlanId: planId, scheduledAt: { gte: todayStart, lte: todayEnd } },
      orderBy: { scheduledAt: 'asc' },
      select: { id: true, activeItemId: true }
    });

    if (!session && (role === 'tutor' || role === 'manager')) {
      // Auto-create a session for today so the teacher can immediately start
      session = await prisma.lessonSession.create({
        data: { lessonPlanId: planId, scheduledAt: new Date() },
        select: { id: true, activeItemId: true }
      });
    }

    res.json({ boardUuid, sessionId: session?.id || null, activeItemId: session?.activeItemId || null });
  } catch (err) { next(err); }
});

module.exports = router;

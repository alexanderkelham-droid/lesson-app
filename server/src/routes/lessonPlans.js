const express = require('express');
const prisma = require('../prisma');
const { auth, requireRole } = require('../middleware/auth');
const { ensureRecurringSessions, resetFutureSessions } = require('../lib/recurring-sessions');
const { removeStaleCarryCopies } = require('../lib/items');
const { carryOverIncompleteItems } = require('../lib/lessons');
const { suggestLessons, studentContext } = require('../lib/ai-planner');
const { sendOriginalsPack, packGroupFromPrintData } = require('../lib/originals-pack');
const { zonedDayRange, zonedDateKey } = require('../lib/time');
const {
  httpError, parseId, validateIdParam, getPlanForAccess, assertCanMutatePlan, tutorPlanWhere,
  isValidDayOfWeek, isValidLessonTime, parseDate, PLAN_STATUSES, ITEM_STATUSES,
} = require('../lib/access');

const router = express.Router();
router.param('id', validateIdParam);
router.param('itemId', validateIdParam);
router.param('sessionId', validateIdParam);

// Sheet fields safe to embed in plan responses. Deliberately excludes
// contentJson (which contains the answer key) — clients load a sheet's
// questions via GET /api/sheets/:id, which strips answers for students.
const SHEET_SUMMARY = { id: true, title: true, subject: true, topic: true, difficultyLevel: true, sheetType: true };

const PLAN_DETAIL_INCLUDE = {
  student: { select: { id: true, name: true, email: true } },
  tutor:   { select: { id: true, name: true, email: true } },
  items: {
    orderBy: { sequenceOrder: 'asc' },
    include: {
      sheet: { select: SHEET_SUMMARY },
      session: { select: { id: true, scheduledAt: true, attendedAt: true } },
      _count: { select: { carriedTo: true } },
      studentResponses: {
        orderBy: { createdAt: 'desc' }, take: 1,
        select: { id: true, score: true, completedAt: true, timeSpentSeconds: true }
      }
    }
  },
  sessions: {
    orderBy: { scheduledAt: 'asc' },
    select: { id: true, scheduledAt: true, attendedAt: true, durationMins: true, notes: true, subject: true, slotId: true, groupSessionId: true }
  }
};

// Students shouldn't see the tutor's private per-item notes or session notes.
function redactPlanForStudent(plan) {
  if (!plan) return plan;
  return {
    ...plan,
    items: (plan.items || []).map(({ tutorNotes, ...rest }) => rest),
    sessions: (plan.sessions || []).map(({ notes, ...rest }) => rest),
  };
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

// Validate + normalise plan fields shared by POST and PUT. Returns a Prisma
// `data` fragment containing only the fields that were supplied.
function planFieldsFromBody(body) {
  const data = {};
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) throw httpError(400, 'Title cannot be empty');
    data.title = body.title.trim().slice(0, 200);
  }
  if (body.status !== undefined) {
    if (!PLAN_STATUSES.includes(body.status)) throw httpError(400, `status must be one of ${PLAN_STATUSES.join(', ')}`);
    data.status = body.status;
  }
  if (body.startDate !== undefined) {
    const d = parseDate(body.startDate);
    if (body.startDate && !d) throw httpError(400, 'Invalid startDate');
    data.startDate = d;
  }
  if (body.lessonDayOfWeek !== undefined) {
    if (body.lessonDayOfWeek === null || body.lessonDayOfWeek === '') {
      data.lessonDayOfWeek = null;
    } else {
      const day = Number(body.lessonDayOfWeek);
      if (!isValidDayOfWeek(day)) throw httpError(400, 'lessonDayOfWeek must be 0 (Mon) to 6 (Sun)');
      data.lessonDayOfWeek = day;
    }
  }
  if (body.lessonTime !== undefined) {
    if (body.lessonTime === null || body.lessonTime === '') {
      data.lessonTime = null;
    } else {
      if (!isValidLessonTime(body.lessonTime)) throw httpError(400, 'lessonTime must be HH:MM (24h)');
      data.lessonTime = body.lessonTime;
    }
  }
  if (body.studentNotes !== undefined) {
    data.studentNotes = body.studentNotes ? String(body.studentNotes).slice(0, 5000) : null;
  }
  return data;
}

async function assertUserHasRole(userId, roles, label) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!u || !roles.includes(u.role)) throw httpError(400, `${label} must be a valid ${roles.join(' or ')}`);
}

// An item may only be attached to a session belonging to the same plan.
async function assertSessionInPlan(sessionId, planId) {
  const s = await prisma.lessonSession.findUnique({ where: { id: sessionId }, select: { lessonPlanId: true } });
  if (!s || s.lessonPlanId !== planId) throw httpError(400, 'sessionId does not belong to this plan');
}

// GET /api/lesson-plans - scoped by role
router.get('/', auth, async (req, res, next) => {
  try {
    const { userId, role } = req.user;
    const where = role === 'student' ? { studentId: userId }
      : role === 'tutor' ? tutorPlanWhere(userId)
      : {};

    const plans = await prisma.lessonPlan.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, email: true } },
        tutor:   { select: { id: true, name: true, email: true } },
        items: {
          orderBy: { sequenceOrder: 'asc' },
          include: {
            sheet: { select: SHEET_SUMMARY },
            session: { select: { id: true, scheduledAt: true, attendedAt: true } },
            _count: { select: { carriedTo: true } },
            studentResponses: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, score: true, completedAt: true, timeSpentSeconds: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(role === 'student' ? plans.map(redactPlanForStudent) : plans);
  } catch (err) { next(err); }
});

// GET /api/lesson-plans/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    const { id: planId } = await getPlanForAccess(req, req.params.id);

    // Lazily top up recurring sessions on read (no-op if nothing to add)
    await ensureRecurringSessions(planId);

    const plan = await prisma.lessonPlan.findUnique({ where: { id: planId }, include: PLAN_DETAIL_INCLUDE });
    res.json(req.user.role === 'student' ? redactPlanForStudent(plan) : plan);
  } catch (err) { next(err); }
});

// GET /api/lesson-plans/:id/print?session=<sessionId|next|all|unscheduled>
// Staff only. Everything needed to print a lesson pack: plan, student, tutor,
// the chosen session and its items in order, with FULL sheet content
// (answer keys included, for the teacher copy).
//   session=<id>        items attached to that session
//   session=next        next upcoming unattended session (falls back to all)
//   session=unscheduled items not yet in any session
//   session=all (default) every item, minus originals already carried forward
// Items for a printable lesson pack (session: id | next | all | unscheduled).
// Shared by the digital print view and the original-PDF download.
async function loadPackData(req, planIdRaw, sessionRaw) {
  const { id: planId } = await getPlanForAccess(req, planIdRaw);
  const plan = await prisma.lessonPlan.findUnique({
    where: { id: planId },
    select: {
      id: true, title: true, status: true, lessonDayOfWeek: true, lessonTime: true, studentNotes: true,
      student: { select: { id: true, name: true, age: true, subjectFocus: true, schoolYear: true, ixlUsername: true } },
      tutor:   { select: { id: true, name: true } },
    },
  });

  const raw = String(sessionRaw || 'all');
  let scope = raw;
  let session = null;
  const sessionSelect = { id: true, scheduledAt: true, attendedAt: true, durationMins: true, notes: true };

  if (raw === 'next') {
    const { start } = zonedDayRange(zonedDateKey(new Date()));
    session = await prisma.lessonSession.findFirst({
      where: { lessonPlanId: planId, attendedAt: null, scheduledAt: { gte: start } },
      orderBy: { scheduledAt: 'asc' },
      select: sessionSelect,
    });
    scope = session ? 'session' : 'all';
  } else if (raw !== 'all' && raw !== 'unscheduled') {
    const sessionId = parseId(raw);
    if (!sessionId) throw httpError(400, 'session must be a session id, next, all or unscheduled');
    session = await prisma.lessonSession.findFirst({ where: { id: sessionId, lessonPlanId: planId }, select: sessionSelect });
    if (!session) throw httpError(404, 'Session not found in this plan');
    scope = 'session';
  }

  const where = { lessonPlanId: planId };
  if (scope === 'session') where.sessionId = session.id;
  else if (scope === 'unscheduled') where.sessionId = null;

  const items = await prisma.lessonPlanItem.findMany({
    where,
    orderBy: { sequenceOrder: 'asc' },
    select: {
      id: true, sequenceOrder: true, status: true, sessionId: true, carriedFromId: true,
      customTitle: true, customType: true, tutorNotes: true, autoGenerated: true,
      _count: { select: { carriedTo: true } },
      studentResponses: { orderBy: { createdAt: 'desc' }, take: 1, select: { score: true } },
      sheet: {
        select: {
          id: true, title: true, subject: true, topic: true, difficultyLevel: true, sheetType: true,
          contentJson: true, sourceFile: true, pdfUrl: true,
        },
      },
    },
  });

  const visible = scope === 'session'
    ? items
    // Outside a single session, show carried-forward work once (as its copy)
    : items.filter(i => i.status === 'completed' || !(i._count.carriedTo > 0));

  return {
    plan: { id: plan.id, title: plan.title, status: plan.status, lessonDayOfWeek: plan.lessonDayOfWeek, lessonTime: plan.lessonTime, studentNotes: plan.studentNotes },
    student: plan.student,
    tutor: plan.tutor,
    scope,
    session,
    items: visible.map(({ _count, sheet, ...item }) => ({
      ...item,
      sheet: sheet && (({ sourceFile, pdfUrl, ...s }) => ({ ...s, pdfUrl: pdfUrl || null, hasOriginal: !!(pdfUrl || sourceFile) }))(sheet),
    })),
  };
}

router.get('/:id/print', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    res.json(await loadPackData(req, req.params.id, req.query.session));
  } catch (err) { next(err); }
});

// GET /api/lesson-plans/:id/originals?session=...  (manager/tutor)
// One PDF of the ORIGINAL scanned worksheets for the lesson, in order, with a
// cover page — for printing physical copies. Returns { url } (short-lived
// download link) when hosted storage is configured, else the PDF itself.
router.get('/:id/originals', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const data = await loadPackData(req, req.params.id, req.query.session);
    await sendOriginalsPack(res, [packGroupFromPrintData(data)], `lesson-pack-${data.student.name}`);
  } catch (err) { next(err); }
});

// POST /api/lesson-plans - manager or tutor
router.post('/', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const { userId, role } = req.user;
    const studentId = parseId(req.body.studentId);
    // Tutors always own the plans they create — they can't assign other tutors.
    const tutorId = role === 'tutor' ? userId : parseId(req.body.tutorId);
    if (!studentId || !tutorId || !req.body.title) {
      return res.status(400).json({ error: 'studentId, tutorId and title are required' });
    }
    await assertUserHasRole(studentId, ['student'], 'studentId');
    await assertUserHasRole(tutorId, ['tutor', 'manager'], 'tutorId');

    const fields = planFieldsFromBody(req.body);
    const plan = await prisma.lessonPlan.create({
      data: {
        status: 'draft',
        ...fields,
        studentId,
        tutorId,
      },
      include: {
        student: { select: { id: true, name: true, email: true } },
        tutor:   { select: { id: true, name: true, email: true } }
      }
    });
    await ensureRecurringSessions(plan.id);
    res.status(201).json(plan);
  } catch (err) { next(err); }
});

// PUT /api/lesson-plans/:id
router.put('/:id', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const { id: planId } = await assertCanMutatePlan(req, req.params.id);
    const data = planFieldsFromBody(req.body);

    // Only managers may reassign a plan to a different tutor
    if (req.user.role === 'manager' && req.body.tutorId !== undefined && req.body.tutorId !== '') {
      const tutorId = parseId(req.body.tutorId);
      if (!tutorId) return res.status(400).json({ error: 'Invalid tutorId' });
      await assertUserHasRole(tutorId, ['tutor', 'manager'], 'tutorId');
      data.tutorId = tutorId;
    }

    const before = await prisma.lessonPlan.findUnique({ where: { id: planId }, select: { lessonDayOfWeek: true, lessonTime: true } });
    const plan = await prisma.lessonPlan.update({ where: { id: planId }, data });
    // New regular slot: drop future empty sessions on the old slot, then regenerate
    if (before.lessonDayOfWeek !== plan.lessonDayOfWeek || before.lessonTime !== plan.lessonTime) {
      await resetFutureSessions(planId);
    }
    await ensureRecurringSessions(planId);
    res.json(plan);
  } catch (err) { next(err); }
});

// DELETE /api/lesson-plans/:id - manager only.
// Deletes the plan and all its history (items, sessions, responses, logs).
router.delete('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const planId = parseId(req.params.id);
    const exists = await prisma.lessonPlan.findUnique({ where: { id: planId }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: 'Plan not found' });

    await prisma.$transaction([
      prisma.studentResponse.deleteMany({ where: { lessonPlanItem: { lessonPlanId: planId } } }),
      prisma.followUpLog.deleteMany({ where: { lessonPlanId: planId } }),
      // Items and sessions cascade from the plan (onDelete: Cascade)
      prisma.lessonPlan.delete({ where: { id: planId } }),
    ]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/lesson-plans/:id/items - add sheet or custom item to plan
router.post('/:id/items', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const { id: planId } = await assertCanMutatePlan(req, req.params.id);
    const { customTitle, customType, scheduledDate, dueDate, status, tutorNotes } = req.body;
    const sheetId = req.body.sheetId ? parseId(req.body.sheetId) : null;
    if (req.body.sheetId && !sheetId) return res.status(400).json({ error: 'Invalid sheetId' });
    if (!sheetId && !(typeof customTitle === 'string' && customTitle.trim())) {
      return res.status(400).json({ error: 'Either sheetId or customTitle is required' });
    }
    if (status !== undefined && !ITEM_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${ITEM_STATUSES.join(', ')}` });
    }

    let sessionId = null;
    if (req.body.sessionId) {
      sessionId = parseId(req.body.sessionId);
      if (!sessionId) return res.status(400).json({ error: 'Invalid sessionId' });
      await assertSessionInPlan(sessionId, planId);
    }

    // Honour a requested position (used by the builder when saving a
    // reordered plan); otherwise append to the end.
    let sequenceOrder = Number.isInteger(req.body.sequenceOrder) && req.body.sequenceOrder > 0
      ? req.body.sequenceOrder
      : null;
    if (!sequenceOrder) {
      const lastItem = await prisma.lessonPlanItem.findFirst({
        where: { lessonPlanId: planId },
        orderBy: { sequenceOrder: 'desc' },
        select: { sequenceOrder: true }
      });
      sequenceOrder = lastItem ? lastItem.sequenceOrder + 1 : 1;
    }

    const item = await prisma.lessonPlanItem.create({
      data: {
        lessonPlanId: planId,
        sheetId,
        customTitle: sheetId ? null : customTitle.trim().slice(0, 200),
        customType: sheetId ? null : (customType || 'other'),
        sequenceOrder,
        scheduledDate: parseDate(scheduledDate),
        dueDate: parseDate(dueDate),
        status: status || 'available',
        tutorNotes: tutorNotes || null,
        sessionId,
      },
      include: { sheet: { select: SHEET_SUMMARY } }
    });
    res.status(201).json(item);
  } catch (err) {
    if (err.code === 'P2003') return res.status(400).json({ error: 'Sheet does not exist' });
    next(err);
  }
});

// PUT /api/lesson-plans/:id/items/:itemId
router.put('/:id/items/:itemId', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const { id: planId } = await assertCanMutatePlan(req, req.params.id);
    const itemId = parseId(req.params.itemId);

    const existing = await prisma.lessonPlanItem.findUnique({
      where: { id: itemId },
      select: { id: true, lessonPlanId: true }
    });
    if (!existing || existing.lessonPlanId !== planId) return res.status(404).json({ error: 'Item not found in this plan' });

    const { scheduledDate, dueDate, status, sequenceOrder, tutorNotes, sessionId } = req.body;
    if (status !== undefined && !ITEM_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${ITEM_STATUSES.join(', ')}` });
    }
    if (sequenceOrder !== undefined && !(Number.isInteger(Number(sequenceOrder)) && Number(sequenceOrder) > 0)) {
      return res.status(400).json({ error: 'sequenceOrder must be a positive integer' });
    }
    let nextSessionId;
    if (sessionId !== undefined) {
      if (sessionId === null || sessionId === '') {
        nextSessionId = null; // move to the unscheduled pool
      } else {
        nextSessionId = parseId(sessionId);
        if (!nextSessionId) return res.status(400).json({ error: 'Invalid sessionId' });
        await assertSessionInPlan(nextSessionId, planId);
      }
    }

    const current = await prisma.lessonPlanItem.findUnique({ where: { id: itemId }, select: { status: true } });
    const item = await prisma.lessonPlanItem.update({
      where: { id: itemId },
      data: {
        ...(scheduledDate !== undefined && { scheduledDate: parseDate(scheduledDate) }),
        ...(dueDate !== undefined && { dueDate: parseDate(dueDate) }),
        ...(status && { status }),
        ...(sequenceOrder !== undefined && { sequenceOrder: Number(sequenceOrder) }),
        ...(tutorNotes !== undefined && { tutorNotes: tutorNotes || null }),
        ...(nextSessionId !== undefined && { sessionId: nextSessionId })
      },
      include: { sheet: { select: SHEET_SUMMARY } }
    });
    if (status === 'completed' && current.status !== 'completed') await removeStaleCarryCopies(prisma, itemId);
    res.json(item);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Item not found' });
    next(err);
  }
});

// DELETE /api/lesson-plans/:id/items/:itemId
// Items with submitted student work are kept (409) so history isn't lost.
router.delete('/:id/items/:itemId', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const { id: planId } = await assertCanMutatePlan(req, req.params.id);
    const itemId = parseId(req.params.itemId);
    const item = await prisma.lessonPlanItem.findUnique({
      where: { id: itemId },
      select: { lessonPlanId: true, _count: { select: { studentResponses: true } } }
    });
    if (!item || item.lessonPlanId !== planId) return res.status(404).json({ error: 'Item not found in this plan' });
    if (item._count.studentResponses > 0) {
      return res.status(409).json({ error: 'This item has submitted student work and cannot be deleted' });
    }
    await prisma.lessonPlanItem.delete({ where: { id: itemId } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/lesson-plans/:id/sessions/:sessionId/clear
// Empty one lesson in the planner: removes items not yet started. Items that
// are completed or have student work are kept (history is never deleted).
router.post('/:id/sessions/:sessionId/clear', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const { id: planId } = await assertCanMutatePlan(req, req.params.id);
    const sessionId = parseId(req.params.sessionId);
    const session = sessionId && await prisma.lessonSession.findFirst({ where: { id: sessionId, lessonPlanId: planId }, select: { id: true } });
    if (!session) return res.status(404).json({ error: 'Lesson not found in this plan' });
    const where = { sessionId, status: { not: 'completed' }, studentResponses: { none: {} } };
    const { count } = await prisma.lessonPlanItem.deleteMany({ where });
    const kept = await prisma.lessonPlanItem.count({ where: { sessionId } });
    res.json({ removed: count, kept });
  } catch (err) { next(err); }
});

// PATCH /api/lesson-plans/:id/items/reorder
router.patch('/:id/items/reorder', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const { id: planId } = await assertCanMutatePlan(req, req.params.id);
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds must be an array' });
    const ids = orderedIds.map(parseId);
    if (ids.some(id => !id)) return res.status(400).json({ error: 'orderedIds must contain item ids' });

    // updateMany scoped to this plan — ids from other plans are ignored
    await prisma.$transaction(
      ids.map((itemId, idx) =>
        prisma.lessonPlanItem.updateMany({
          where: { id: itemId, lessonPlanId: planId },
          data: { sequenceOrder: idx + 1 }
        })
      )
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/lesson-plans/:id/process-completion
// Called after a student submits a sheet. Marks the item completed, applies
// any follow-up rule, and unlocks the next item. Safe to call twice.
router.post('/:id/process-completion', auth, async (req, res, next) => {
  try {
    const plan = await getPlanForAccess(req, req.params.id);
    const lessonPlanItemId = parseId(req.body.lessonPlanItemId);
    const studentResponseId = parseId(req.body.studentResponseId);
    if (!lessonPlanItemId || !studentResponseId) {
      return res.status(400).json({ error: 'lessonPlanItemId and studentResponseId required' });
    }

    const item = await prisma.lessonPlanItem.findFirst({
      where: { id: lessonPlanItemId, lessonPlanId: plan.id }
    });
    if (!item) return res.status(404).json({ error: 'Lesson plan item not found' });

    const response = await prisma.studentResponse.findUnique({ where: { id: studentResponseId } });
    if (!response || response.lessonPlanItemId !== item.id || response.studentId !== plan.studentId) {
      return res.status(400).json({ error: 'Response does not belong to this item' });
    }

    // Idempotency: already processed → don't re-apply rules
    if (item.status === 'completed') {
      return res.json({ success: true, followUpCreated: false, followUpItem: null, alreadyCompleted: true });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.lessonPlanItem.update({ where: { id: item.id }, data: { status: 'completed' } });
      await removeStaleCarryCopies(tx, item.id);

      // A null score (free-text only sheet, awaiting tutor review) never
      // triggers score-based follow-up rules.
      let followUpItem = null;
      if (response.score != null && item.sheetId) {
        const rules = await tx.followUpRule.findMany({
          where: { sourceSheetId: item.sheetId },
          orderBy: { priority: 'asc' }
        });
        const rule = rules.find(r => evaluateTrigger(r.triggerCondition, response.score));
        if (rule) {
          await tx.lessonPlanItem.updateMany({
            where: { lessonPlanId: plan.id, sequenceOrder: { gt: item.sequenceOrder } },
            data: { sequenceOrder: { increment: 1 } }
          });
          followUpItem = await tx.lessonPlanItem.create({
            data: {
              lessonPlanId: plan.id,
              sheetId: rule.followUpSheetId,
              sequenceOrder: item.sequenceOrder + 1,
              sessionId: item.sessionId,
              status: 'available',
              autoGenerated: true
            },
            include: { sheet: { select: { id: true, title: true, subject: true, topic: true } } }
          });
          await tx.followUpLog.create({
            data: {
              lessonPlanId: plan.id,
              studentId: response.studentId,
              triggerRuleId: rule.id,
              sourceSheetId: item.sheetId,
              followUpSheetId: rule.followUpSheetId,
              studentScore: response.score
            }
          });
        }
      }

      if (!followUpItem) {
        const nextItem = await tx.lessonPlanItem.findFirst({
          where: { lessonPlanId: plan.id, sequenceOrder: item.sequenceOrder + 1 }
        });
        if (nextItem && nextItem.status === 'locked') {
          await tx.lessonPlanItem.update({ where: { id: nextItem.id }, data: { status: 'available' } });
        }
      }
      return followUpItem;
    });

    res.json({ success: true, followUpCreated: !!result, followUpItem: result });
  } catch (err) { next(err); }
});

// POST /api/lesson-plans/:id/past-lesson
// { scheduledAt, durationMins?, notes?, items: [{ sheetId? | customTitle+customType, done: bool, score?: 0-100, tutorNotes? }] }
// Record a lesson that already happened (e.g. before the portal existed):
// creates the attended session (or fills in the existing one that day),
// adds the work done with scores, and carries anything unfinished over to
// the next lesson, so history, sheet memory and the AI planner all see it.
router.post('/:id/past-lesson', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const plan = await assertCanMutatePlan(req, req.params.id);
    const scheduledAt = parseDate(req.body.scheduledAt);
    if (!scheduledAt) return res.status(400).json({ error: 'A valid date is required' });
    if (scheduledAt.getTime() > Date.now() + 60 * 60 * 1000) return res.status(400).json({ error: 'A past lesson can\'t be in the future' });
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'Add at least one thing that was done in the lesson' });
    const durationMins = req.body.durationMins ? Number(req.body.durationMins) : null;
    if (durationMins != null && !(Number.isInteger(durationMins) && durationMins > 0 && durationMins <= 600)) return res.status(400).json({ error: 'durationMins must be 1-600' });

    // Validate items up front
    const sheetIds = [...new Set(items.map(i => parseId(i.sheetId)).filter(Boolean))];
    const sheets = await prisma.sheet.findMany({ where: { id: { in: sheetIds } }, select: { id: true } });
    const known = new Set(sheets.map(s => s.id));
    const clean = items.map((i, idx) => {
      const sheetId = parseId(i.sheetId);
      if (i.sheetId && !known.has(sheetId)) throw httpError(400, `Item ${idx + 1}: sheet not found`);
      const customTitle = typeof i.customTitle === 'string' ? i.customTitle.trim().slice(0, 200) : '';
      if (!sheetId && !customTitle) throw httpError(400, `Item ${idx + 1}: choose a sheet or type what was done`);
      let score = null;
      if (i.score !== undefined && i.score !== null && i.score !== '') {
        score = Number(i.score);
        if (!Number.isFinite(score) || score < 0 || score > 100) throw httpError(400, `Item ${idx + 1}: score must be 0-100`);
      }
      return {
        sheetId: sheetId || null,
        customTitle: sheetId ? null : customTitle,
        customType: sheetId ? null : (['ixl_maths', 'ixl_english', 'corbett_maths', 'eleven_plus', 'paper', 'homework', 'other'].includes(i.customType) ? i.customType : 'other'),
        done: i.done !== false,
        score,
        tutorNotes: i.tutorNotes ? String(i.tutorNotes).slice(0, 1000) : null,
      };
    });

    // Reuse a lesson already on that day (e.g. an auto-generated slot), else create one
    const { start, end } = zonedDayRange(zonedDateKey(scheduledAt));
    let session = await prisma.lessonSession.findFirst({
      where: { lessonPlanId: plan.id, scheduledAt: { gte: start, lte: end } },
      orderBy: { scheduledAt: 'asc' },
    });
    const notes = req.body.notes ? String(req.body.notes).slice(0, 5000) : null;
    if (session) {
      session = await prisma.lessonSession.update({
        where: { id: session.id },
        data: { attendedAt: session.attendedAt || scheduledAt, ...(durationMins && { durationMins }), ...(notes && { notes }) },
      });
    } else {
      session = await prisma.lessonSession.create({
        data: { lessonPlanId: plan.id, scheduledAt, attendedAt: scheduledAt, durationMins, notes },
      });
    }

    const last = await prisma.lessonPlanItem.findFirst({ where: { lessonPlanId: plan.id }, orderBy: { sequenceOrder: 'desc' }, select: { sequenceOrder: true } });
    let seq = (last?.sequenceOrder || 0) + 1;
    for (const it of clean) {
      const item = await prisma.lessonPlanItem.create({
        data: {
          lessonPlanId: plan.id, sessionId: session.id, sequenceOrder: seq++,
          sheetId: it.sheetId, customTitle: it.customTitle, customType: it.customType,
          status: it.done ? 'completed' : 'available', tutorNotes: it.tutorNotes,
        },
      });
      // A sheet done on paper: record the result so memory, stats and the AI see it
      if (it.done && it.sheetId) {
        await prisma.studentResponse.create({
          data: {
            studentId: plan.studentId, sheetId: it.sheetId, lessonPlanItemId: item.id,
            responsesJson: { _tutorGraded: true, _pastLesson: true }, score: it.score, completedAt: scheduledAt,
          },
        });
      }
    }
    // Unfinished work moves on to the next lesson
    const carriedOver = await carryOverIncompleteItems(session.id, plan.id);
    res.status(201).json({ sessionId: session.id, added: clean.length, carriedOver });
  } catch (err) { next(err); }
});

// GET /api/lesson-plans/:id/sheet-history  (manager/tutor)
// The student's "memory" of every worksheet across ALL their plans, so staff
// can see at a glance whether a sheet has been done before:
// { [sheetId]: { timesSet, completed, lastCompletedAt, lastScore, bestScore, planned } }
router.get('/:id/sheet-history', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const plan = await getPlanForAccess(req, req.params.id);
    const items = await prisma.lessonPlanItem.findMany({
      where: { lessonPlan: { studentId: plan.studentId }, sheetId: { not: null } },
      select: {
        sheetId: true, status: true, carriedFromId: true, _count: { select: { carriedTo: true } },
        studentResponses: { select: { score: true, completedAt: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
      },
    });
    const history = {};
    for (const it of items) {
      const h = history[it.sheetId] || (history[it.sheetId] = { timesSet: 0, completed: 0, lastCompletedAt: null, lastScore: null, bestScore: null, planned: false });
      // A carried-over copy is the same assignment, not a new one
      if (!it.carriedFromId) h.timesSet++;
      if (it.status !== 'completed' && !it._count.carriedTo) h.planned = true;
      for (const r of it.studentResponses) {
        const at = r.completedAt || r.createdAt;
        h.completed++;
        if (!h.lastCompletedAt || at > h.lastCompletedAt) { h.lastCompletedAt = at; h.lastScore = r.score; }
        if (r.score != null && (h.bestScore == null || r.score > h.bestScore)) h.bestScore = r.score;
      }
      if (it.status === 'completed' && !it.studentResponses.length) h.completed++; // marked done on paper
    }
    res.json(history);
  } catch (err) { next(err); }
});

// POST /api/lesson-plans/:id/ai-plan  { lessons?: 1-4, instructions?: string }
// AI suggestions for the next lessons, based on the student's history.
// Returns suggestions only — the tutor picks what to add (via POST /items).
router.post('/:id/ai-plan', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const { id: planId } = await assertCanMutatePlan(req, req.params.id);
    const result = await suggestLessons(planId, {
      lessons: req.body.lessons,
      instructions: typeof req.body.instructions === 'string' ? req.body.instructions : '',
    });
    res.json(result);
  } catch (err) {
    if (err.status === 401) return res.status(503).json({ error: 'AI planning is misconfigured (invalid API key).' });
    if (err.status === 429) return res.status(429).json({ error: 'The AI is busy. Try again in a minute.' });
    if (err.status === 400 && /credit balance/i.test(err.message)) return res.status(503).json({ error: 'AI planning is unavailable: the Anthropic account has run out of credit.' });
    if (err.name === 'APIConnectionTimeoutError') return res.status(504).json({ error: 'The AI took too long. Try planning fewer lessons.' });
    next(err);
  }
});

// GET /api/lesson-plans/:id/follow-up-logs
router.get('/:id/follow-up-logs', auth, async (req, res, next) => {
  try {
    const plan = await getPlanForAccess(req, req.params.id);
    const logs = await prisma.followUpLog.findMany({
      where: { lessonPlanId: plan.id },
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

// GET /api/lesson-plans/:id/live-session
// Returns today's session for this plan (in the centre's local timezone),
// creating one if a tutor/manager opens a live lesson on an unscheduled day.
router.get('/:id/live-session', auth, async (req, res, next) => {
  try {
    const plan = await getPlanForAccess(req, req.params.id);
    const { start, end } = zonedDayRange();

    let session = await prisma.lessonSession.findFirst({
      where: { lessonPlanId: plan.id, scheduledAt: { gte: start, lte: end } },
      orderBy: { scheduledAt: 'asc' },
      select: { id: true, activeItemId: true }
    });

    if (!session && req.user.role !== 'student') {
      session = await prisma.lessonSession.create({
        data: { lessonPlanId: plan.id, scheduledAt: new Date() },
        select: { id: true, activeItemId: true }
      });
    }

    res.json({ sessionId: session?.id || null, activeItemId: session?.activeItemId || null });
  } catch (err) { next(err); }
});

module.exports = router;

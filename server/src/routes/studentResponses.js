const express = require('express');
const prisma = require('../prisma');
const { auth } = require('../middleware/auth');
const { calculateScore } = require('../lib/scoring');
const { parseId, getPlanForAccess, tutorPlanWhere } = require('../lib/access');

const router = express.Router();

// GET /api/student-responses?studentId=&sheetId=&lessonPlanItemId=
// Students see only their own; tutors only their own students'; managers all.
router.get('/', auth, async (req, res, next) => {
  try {
    const { userId, role } = req.user;
    const { studentId, sheetId, lessonPlanItemId } = req.query;

    const where = {};
    if (role === 'student') {
      where.studentId = userId;
    } else {
      if (studentId) {
        const sid = parseId(studentId);
        if (!sid) return res.status(400).json({ error: 'Invalid studentId' });
        where.studentId = sid;
      }
      if (role === 'tutor') where.lessonPlanItem = { lessonPlan: tutorPlanWhere(userId) };
    }
    if (sheetId) {
      const id = parseId(sheetId);
      if (!id) return res.status(400).json({ error: 'Invalid sheetId' });
      where.sheetId = id;
    }
    if (lessonPlanItemId) {
      const id = parseId(lessonPlanItemId);
      if (!id) return res.status(400).json({ error: 'Invalid lessonPlanItemId' });
      where.lessonPlanItemId = id;
    }

    const responses = await prisma.studentResponse.findMany({
      where,
      include: { sheet: { select: { id: true, title: true, subject: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(responses);
  } catch (err) { next(err); }
});

// POST /api/student-responses
// Student submits their own answers, or staff record a result (e.g. a paper
// sheet done in the centre) with an optional manualScore.
router.post('/', auth, async (req, res, next) => {
  try {
    const { role } = req.user;
    const { responsesJson, timeSpentSeconds, manualScore } = req.body;
    const lessonPlanItemId = parseId(req.body.lessonPlanItemId);
    if (!lessonPlanItemId || !responsesJson || typeof responsesJson !== 'object') {
      return res.status(400).json({ error: 'lessonPlanItemId and responsesJson are required' });
    }

    const item = await prisma.lessonPlanItem.findUnique({
      where: { id: lessonPlanItemId },
      select: { id: true, lessonPlanId: true, sheetId: true, status: true, sheet: { select: { contentJson: true } } }
    });
    if (!item) return res.status(404).json({ error: 'Lesson plan item not found' });
    if (!item.sheetId) return res.status(400).json({ error: 'Custom items have no sheet to answer — mark them done instead' });

    // Caller must be allowed to see this plan; the response is always
    // attributed to the plan's student (never a client-supplied id).
    const plan = await getPlanForAccess(req, item.lessonPlanId);
    if (role === 'student' && item.status === 'locked') {
      return res.status(403).json({ error: 'This sheet is not available yet' });
    }

    let score;
    if (role !== 'student' && manualScore !== undefined && manualScore !== null && manualScore !== '') {
      const n = Number(manualScore);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return res.status(400).json({ error: 'manualScore must be between 0 and 100' });
      }
      score = n;
    } else {
      score = calculateScore(item.sheet.contentJson, responsesJson);
    }

    const seconds = Number(timeSpentSeconds);
    const [, response] = await prisma.$transaction([
      prisma.lessonPlanItem.update({
        where: { id: item.id },
        // Don't downgrade an already-completed item back to in_progress
        data: item.status === 'completed' ? {} : { status: 'in_progress' }
      }),
      prisma.studentResponse.create({
        data: {
          studentId: plan.studentId,
          sheetId: item.sheetId,
          lessonPlanItemId: item.id,
          responsesJson,
          score,
          completedAt: new Date(),
          timeSpentSeconds: Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds) : null
        }
      })
    ]);

    res.status(201).json(response);
  } catch (err) { next(err); }
});

module.exports = router;

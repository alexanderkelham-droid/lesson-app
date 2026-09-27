const express = require('express');
const prisma = require('../prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validateIdParam } = require('../lib/access');

const router = express.Router();
router.param('id', validateIdParam);

// GET /api/follow-up-rules
router.get('/', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const rules = await prisma.followUpRule.findMany({
      include: {
        sourceSheet:  { select: { id: true, title: true, subject: true } },
        followUpSheet: { select: { id: true, title: true, subject: true } }
      },
      orderBy: [{ sourceSheetId: 'asc' }, { priority: 'asc' }]
    });
    res.json(rules);
  } catch (err) { next(err); }
});

// POST /api/follow-up-rules - manager only
router.post('/', requireRole('manager'), async (req, res, next) => {
  try {
    const { triggerCondition, sourceSheetId, followUpSheetId, priority } = req.body;
    if (!triggerCondition || !sourceSheetId || !followUpSheetId) {
      return res.status(400).json({ error: 'triggerCondition, sourceSheetId, followUpSheetId required' });
    }
    const rule = await prisma.followUpRule.create({
      data: {
        triggerCondition,
        sourceSheetId: parseInt(sourceSheetId),
        followUpSheetId: parseInt(followUpSheetId),
        priority: priority || 1
      },
      include: {
        sourceSheet:  { select: { id: true, title: true } },
        followUpSheet: { select: { id: true, title: true } }
      }
    });
    res.status(201).json(rule);
  } catch (err) { next(err); }
});

// PUT /api/follow-up-rules/:id - manager only
router.put('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const { triggerCondition, sourceSheetId, followUpSheetId, priority } = req.body;
    const rule = await prisma.followUpRule.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...(triggerCondition && { triggerCondition }),
        ...(sourceSheetId && { sourceSheetId: parseInt(sourceSheetId) }),
        ...(followUpSheetId && { followUpSheetId: parseInt(followUpSheetId) }),
        ...(priority !== undefined && { priority: parseInt(priority) })
      },
      include: {
        sourceSheet:  { select: { id: true, title: true } },
        followUpSheet: { select: { id: true, title: true } }
      }
    });
    res.json(rule);
  } catch (err) { next(err); }
});

// DELETE /api/follow-up-rules/:id - manager only
router.delete('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    await prisma.followUpRule.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/follow-up-rules/logs - all auto-generated follow-up logs
router.get('/logs', auth, async (req, res, next) => {
  try {
    const { role, userId } = req.user;
    if (!['manager', 'tutor'].includes(role)) return res.status(403).json({ error: 'Forbidden' });

    const logs = await prisma.followUpLog.findMany({
      where: role === 'tutor' ? { lessonPlan: { tutorId: userId } } : {},
      include: {
        triggerRule:   { select: { id: true, triggerCondition: true } },
        sourceSheet:   { select: { id: true, title: true } },
        followUpSheet: { select: { id: true, title: true } },
        lessonPlan:    { select: { id: true, title: true, student: { select: { id: true, name: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(logs);
  } catch (err) { next(err); }
});

module.exports = router;

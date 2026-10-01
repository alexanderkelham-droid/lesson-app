// Group sessions (classes): one timetable slot, several students. Each
// student keeps their own plan and work; their LessonSession for the slot is
// linked via groupSessionId, so rescheduling / attendance / printing can act
// on the whole group while every child's work stays individual.
const express = require('express');
const crypto = require('crypto');
const prisma = require('../prisma');
const { requireRole } = require('../middleware/auth');
const { httpError, parseId, validateIdParam, parseDate } = require('../lib/access');
const { zonedParts, zonedToUtc, zonedDayRange, zonedDateKey } = require('../lib/time');
const { carryOverIncompleteItems, cancelLessonSession } = require('../lib/lessons');
const { sendOriginalsPack, packGroup } = require('../lib/originals-pack');

const router = express.Router();
router.param('id', validateIdParam);
router.param('studentId', validateIdParam);

const staff = requireRole('manager', 'tutor');

const MEMBER_SELECT = {
  id: true, scheduledAt: true, attendedAt: true, durationMins: true, notes: true, lessonPlanId: true,
  lessonPlan: { select: { id: true, title: true, tutorId: true, student: { select: { id: true, name: true, age: true, subjectFocus: true, ixlUsername: true } } } },
  items: {
    orderBy: { sequenceOrder: 'asc' },
    select: {
      id: true, status: true, customTitle: true, customType: true, carriedFromId: true, tutorNotes: true,
      sheet: { select: { id: true, title: true, subject: true, topic: true, difficultyLevel: true } },
      studentResponses: { orderBy: { createdAt: 'desc' }, take: 1, select: { score: true, completedAt: true } },
    },
  },
};

function shapeGroup(g, { withItems = false } = {}) {
  const members = (g.sessions || [])
    .map(s => ({
      sessionId: s.id,
      planId: s.lessonPlan.id,
      planTitle: s.lessonPlan.title,
      student: s.lessonPlan.student,
      attendedAt: s.attendedAt,
      itemCount: s.items.length,
      completedCount: s.items.filter(i => i.status === 'completed').length,
      ...(withItems && { notes: s.notes, items: s.items }),
    }))
    .sort((a, b) => a.student.name.localeCompare(b.student.name));
  const { sessions, ...rest } = g;
  return { ...rest, members };
}

async function loadGroup(req, id) {
  const group = await prisma.groupSession.findUnique({
    where: { id },
    include: { tutor: { select: { id: true, name: true } }, sessions: { select: MEMBER_SELECT } },
  });
  if (!group) throw httpError(404, 'Group session not found');
  if (req.user.role === 'tutor' && group.tutorId !== req.user.userId) throw httpError(403, 'Forbidden');
  return group;
}

async function assertTutor(tutorId) {
  const u = tutorId && await prisma.user.findUnique({ where: { id: tutorId }, select: { role: true } });
  if (!u || !['tutor', 'manager'].includes(u.role)) throw httpError(400, 'tutorId must be a tutor or manager');
}

// The student's plan to hang group work on: their active plan (preferring one
// with this tutor), else any unfinished plan, else a new plan.
async function planForStudent(studentId, tutorId) {
  const student = await prisma.user.findUnique({ where: { id: studentId }, select: { id: true, name: true, role: true } });
  if (!student || student.role !== 'student') throw httpError(400, `User ${studentId} is not a student`);
  const plans = await prisma.lessonPlan.findMany({
    where: { studentId, status: { not: 'completed' } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, tutorId: true },
  });
  const pick = plans.find(p => p.status === 'active' && p.tutorId === tutorId)
    || plans.find(p => p.status === 'active')
    || plans[0];
  if (pick) return pick;
  return prisma.lessonPlan.create({
    data: { studentId, tutorId, title: `${student.name.split(' ')[0]}'s lessons`, status: 'active' },
    select: { id: true, status: true, tutorId: true },
  });
}

// Put a student into one group occurrence: reuse their lesson on that day if
// they already have one (its planned work comes with it), else create one.
async function addStudentToGroup(group, studentId) {
  const plan = await planForStudent(studentId, group.tutorId);
  const { start, end } = zonedDayRange(zonedDateKey(group.scheduledAt));
  const sameDay = await prisma.lessonSession.findFirst({
    where: { lessonPlanId: plan.id, scheduledAt: { gte: start, lte: end }, OR: [{ groupSessionId: null }, { groupSessionId: group.id }] },
    orderBy: { scheduledAt: 'asc' },
  });
  if (sameDay) {
    return prisma.lessonSession.update({
      where: { id: sameDay.id },
      data: { groupSessionId: group.id, scheduledAt: group.scheduledAt, durationMins: sameDay.durationMins ?? group.durationMins },
    });
  }
  return prisma.lessonSession.create({
    data: { lessonPlanId: plan.id, scheduledAt: group.scheduledAt, durationMins: group.durationMins, groupSessionId: group.id },
  });
}

// Move every student's linked lesson to the group's new time. If a student
// already had another (ungrouped) lesson on the new day, merge its work in.
async function moveMembers(groupId, scheduledAt, durationMins) {
  const members = await prisma.lessonSession.findMany({ where: { groupSessionId: groupId }, select: { id: true, lessonPlanId: true } });
  const { start, end } = zonedDayRange(zonedDateKey(scheduledAt));
  for (const m of members) {
    const clash = await prisma.lessonSession.findFirst({
      where: { lessonPlanId: m.lessonPlanId, id: { not: m.id }, groupSessionId: null, attendedAt: null, scheduledAt: { gte: start, lte: end } },
      select: { id: true },
    });
    if (clash) {
      await prisma.lessonPlanItem.updateMany({ where: { sessionId: clash.id }, data: { sessionId: m.id } });
      await prisma.lessonSession.delete({ where: { id: clash.id } });
    }
    await prisma.lessonSession.update({ where: { id: m.id }, data: { scheduledAt, ...(durationMins !== undefined && { durationMins }) } });
  }
}

// Occurrences an edit applies to: just this one, or this and later ones in the series
async function targets(group, applyTo) {
  if (applyTo !== 'following' || !group.seriesId) return [group];
  return prisma.groupSession.findMany({
    where: { seriesId: group.seriesId, scheduledAt: { gte: group.scheduledAt } },
    orderBy: { scheduledAt: 'asc' },
  });
}

// GET /api/groups?from=&to=
router.get('/', staff, async (req, res, next) => {
  try {
    const where = {};
    if (req.user.role === 'tutor') where.tutorId = req.user.userId;
    const from = parseDate(req.query.from), to = parseDate(req.query.to);
    if ((req.query.from && !from) || (req.query.to && !to)) return res.status(400).json({ error: 'Invalid from/to date' });
    if (from || to) where.scheduledAt = { ...(from && { gte: from }), ...(to && { lte: to }) };
    if (req.query.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      const { start, end } = zonedDayRange(req.query.date);
      where.scheduledAt = { gte: start, lte: end };
    }
    const groups = await prisma.groupSession.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      include: { tutor: { select: { id: true, name: true } }, sessions: { select: MEMBER_SELECT } },
    });
    res.json(groups.map(g => shapeGroup(g)));
  } catch (err) { next(err); }
});

// GET /api/groups/:id — drill-down: every student with their planned work
router.get('/:id', staff, async (req, res, next) => {
  try {
    res.json(shapeGroup(await loadGroup(req, parseId(req.params.id)), { withItems: true }));
  } catch (err) { next(err); }
});

// POST /api/groups { title, scheduledAt, durationMins?, location?, notes?, tutorId?, repeatWeeks?, studentIds? }
router.post('/', staff, async (req, res, next) => {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim().slice(0, 120) : '';
    const scheduledAt = parseDate(req.body.scheduledAt);
    if (!title || !scheduledAt) return res.status(400).json({ error: 'title and a valid scheduledAt are required' });
    const tutorId = req.user.role === 'tutor' ? req.user.userId : parseId(req.body.tutorId) || req.user.userId;
    await assertTutor(tutorId);
    const durationMins = req.body.durationMins ? Number(req.body.durationMins) : 60;
    if (!Number.isInteger(durationMins) || durationMins < 5 || durationMins > 600) return res.status(400).json({ error: 'durationMins must be 5-600' });
    const repeatWeeks = Math.min(26, Math.max(0, Number(req.body.repeatWeeks) || 0));
    const studentIds = [...new Set((req.body.studentIds || []).map(parseId).filter(Boolean))];

    // Weekly repeats keep the same LOCAL time across clock changes
    const p = zonedParts(scheduledAt);
    const seriesId = repeatWeeks > 0 ? crypto.randomUUID() : null;
    const created = [];
    for (let w = 0; w <= repeatWeeks; w++) {
      const at = w === 0 ? scheduledAt : zonedToUtc(p.year, p.month0, p.day + 7 * w, p.hour, p.minute);
      const group = await prisma.groupSession.create({
        data: {
          title, tutorId, scheduledAt: at, durationMins, seriesId,
          location: req.body.location ? String(req.body.location).slice(0, 120) : null,
          notes: req.body.notes ? String(req.body.notes).slice(0, 2000) : null,
        },
      });
      for (const sid of studentIds) await addStudentToGroup(group, sid);
      created.push(group.id);
    }
    const first = await loadGroup(req, created[0]);
    res.status(201).json({ ...shapeGroup(first), occurrences: created.length, seriesId });
  } catch (err) { next(err); }
});

// PUT /api/groups/:id { title?, scheduledAt?, durationMins?, location?, notes?, tutorId?, applyTo?: 'this'|'following' }
router.put('/:id', staff, async (req, res, next) => {
  try {
    const group = await loadGroup(req, parseId(req.params.id));
    const list = await targets(group, req.body.applyTo);
    const data = {};
    if (req.body.title !== undefined) {
      const t = String(req.body.title || '').trim();
      if (!t) return res.status(400).json({ error: 'Title cannot be empty' });
      data.title = t.slice(0, 120);
    }
    if (req.body.location !== undefined) data.location = req.body.location ? String(req.body.location).slice(0, 120) : null;
    if (req.body.notes !== undefined) data.notes = req.body.notes ? String(req.body.notes).slice(0, 2000) : null;
    if (req.body.durationMins !== undefined) {
      const d = Number(req.body.durationMins);
      if (!Number.isInteger(d) || d < 5 || d > 600) return res.status(400).json({ error: 'durationMins must be 5-600' });
      data.durationMins = d;
    }
    if (req.body.tutorId !== undefined && req.user.role === 'manager') {
      const tid = parseId(req.body.tutorId);
      await assertTutor(tid);
      data.tutorId = tid;
    }
    let newAt = null;
    if (req.body.scheduledAt !== undefined) {
      newAt = parseDate(req.body.scheduledAt);
      if (!newAt) return res.status(400).json({ error: 'Invalid scheduledAt' });
    }
    // Shift each occurrence by the same local day offset and to the new local time
    const oldP = zonedParts(group.scheduledAt);
    const newP = newAt && zonedParts(newAt);
    const dayDelta = newAt ? Math.round((Date.UTC(newP.year, newP.month0, newP.day) - Date.UTC(oldP.year, oldP.month0, oldP.day)) / 86400000) : 0;

    for (const g of list) {
      let at;
      if (newAt) {
        const gp = zonedParts(g.scheduledAt);
        at = g.id === group.id ? newAt : zonedToUtc(gp.year, gp.month0, gp.day + dayDelta, newP.hour, newP.minute);
      }
      await prisma.groupSession.update({ where: { id: g.id }, data: { ...data, ...(at && { scheduledAt: at }) } });
      if (at || data.durationMins !== undefined) await moveMembers(g.id, at || g.scheduledAt, data.durationMins);
    }
    res.json({ ...shapeGroup(await loadGroup(req, group.id)), updated: list.length });
  } catch (err) { next(err); }
});

// POST /api/groups/:id/members { studentIds, applyTo?: 'this'|'following' }
router.post('/:id/members', staff, async (req, res, next) => {
  try {
    const group = await loadGroup(req, parseId(req.params.id));
    const ids = [...new Set((req.body.studentIds || []).map(parseId).filter(Boolean))];
    if (!ids.length) return res.status(400).json({ error: 'studentIds required' });
    for (const g of await targets(group, req.body.applyTo)) {
      for (const sid of ids) await addStudentToGroup(g, sid);
    }
    res.json(shapeGroup(await loadGroup(req, group.id), { withItems: true }));
  } catch (err) { next(err); }
});

// DELETE /api/groups/:id/members/:studentId?applyTo=this|following
// The student's lesson leaves the group: kept as an individual lesson if it
// has planned work, removed if it's empty.
router.delete('/:id/members/:studentId', staff, async (req, res, next) => {
  try {
    const group = await loadGroup(req, parseId(req.params.id));
    const studentId = parseId(req.params.studentId);
    let removed = 0;
    for (const g of await targets(group, req.query.applyTo)) {
      const sessions = await prisma.lessonSession.findMany({
        where: { groupSessionId: g.id, lessonPlan: { studentId } },
        select: { id: true, attendedAt: true, _count: { select: { items: true } } },
      });
      for (const s of sessions) {
        if (s._count.items === 0 && !s.attendedAt) await prisma.lessonSession.delete({ where: { id: s.id } });
        else await prisma.lessonSession.update({ where: { id: s.id }, data: { groupSessionId: null } });
        removed++;
      }
    }
    res.json({ success: true, removed });
  } catch (err) { next(err); }
});

// POST /api/groups/:id/attendance { present: [studentId], absent: [studentId] }
// Present → attended (unfinished work carries over to each child's next lesson).
router.post('/:id/attendance', staff, async (req, res, next) => {
  try {
    const group = await loadGroup(req, parseId(req.params.id));
    const present = new Set((req.body.present || []).map(parseId));
    const absent = new Set((req.body.absent || []).map(parseId));
    let carried = 0;
    for (const s of group.sessions) {
      const sid = s.lessonPlan.student.id;
      if (present.has(sid) && !s.attendedAt) {
        await prisma.lessonSession.update({ where: { id: s.id }, data: { attendedAt: new Date(), durationMins: s.durationMins ?? group.durationMins } });
        carried += await carryOverIncompleteItems(s.id, s.lessonPlanId);
      } else if (absent.has(sid) && s.attendedAt) {
        await prisma.lessonSession.update({ where: { id: s.id }, data: { attendedAt: null } });
      }
    }
    res.json({ ...shapeGroup(await loadGroup(req, group.id), { withItems: true }), carriedOver: carried });
  } catch (err) { next(err); }
});

// POST /api/groups/:id/cancel { moveWork?: 'next'|'unscheduled', applyTo? }
// Cancels the class: each child's unfinished work moves to their next lesson.
router.post('/:id/cancel', staff, async (req, res, next) => {
  try {
    const group = await loadGroup(req, parseId(req.params.id));
    let moved = 0, occurrences = 0;
    for (const g of await targets(group, req.body.applyTo)) {
      const sessions = await prisma.lessonSession.findMany({
        where: { groupSessionId: g.id, attendedAt: null },
        select: { id: true, lessonPlanId: true, scheduledAt: true, notes: true },
      });
      for (const s of sessions) moved += (await cancelLessonSession(s, req.body.moveWork)).moved;
      await prisma.lessonSession.updateMany({ where: { groupSessionId: g.id }, data: { groupSessionId: null } });
      await prisma.groupSession.delete({ where: { id: g.id } });
      occurrences++;
    }
    res.json({ success: true, occurrences, moved });
  } catch (err) { next(err); }
});

// DELETE /api/groups/:id — ungroup: students keep their individual lessons
router.delete('/:id', staff, async (req, res, next) => {
  try {
    const group = await loadGroup(req, parseId(req.params.id));
    await prisma.lessonSession.updateMany({ where: { groupSessionId: group.id }, data: { groupSessionId: null } });
    await prisma.groupSession.delete({ where: { id: group.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/groups/:id/originals — one print run for the class, a cover page per child
router.get('/:id/originals', staff, async (req, res, next) => {
  try {
    const group = await loadGroup(req, parseId(req.params.id));
    const packs = shapeGroup(group, { withItems: true }).members.map(m => packGroup({
      student: m.student, tutorName: group.tutor.name, date: group.scheduledAt, items: m.items, className: group.title,
    }));
    if (!packs.length) return res.status(400).json({ error: 'This group has no students yet' });
    await sendOriginalsPack(res, packs, `${group.title}-${zonedDateKey(group.scheduledAt)}`);
  } catch (err) { next(err); }
});

module.exports = router;

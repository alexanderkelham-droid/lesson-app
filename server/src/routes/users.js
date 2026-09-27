const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');
const { auth, requireRole } = require('../middleware/auth');
const { httpError, parseId, validateIdParam, isValidDayOfWeek, tutorPlanWhere } = require('../lib/access');

const router = express.Router();
router.param('id', validateIdParam);

const PUBLIC_USER_SELECT = {
  id: true, email: true, name: true, role: true, age: true,
  subjectFocus: true, createdAt: true,
  lessonDays: { select: { dayOfWeek: true }, orderBy: { dayOfWeek: 'asc' } }
};

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Memorable but reasonably strong temporary password, e.g. "sunny-otter-maple-47"
const WORDS = [
  'amber', 'apple', 'arrow', 'birch', 'bloom', 'brave', 'breeze', 'bright', 'cedar', 'cloud',
  'comet', 'coral', 'daisy', 'eagle', 'ember', 'fern', 'forest', 'frost', 'galaxy', 'harbor',
  'hazel', 'honey', 'island', 'jolly', 'lemon', 'lunar', 'maple', 'meadow', 'mint', 'ocean',
  'olive', 'orbit', 'otter', 'panda', 'pebble', 'pine', 'planet', 'quick', 'river', 'robin',
  'rocket', 'sunny', 'tiger', 'tulip', 'violet', 'willow', 'zebra', 'zesty'
];
function generatePassword() {
  const w = () => WORDS[crypto.randomInt(WORDS.length)];
  return `${w()}-${w()}-${w()}-${crypto.randomInt(10, 100)}`;
}

// Validate/normalise profile fields shared by create + update.
function profileFields(body, { isStudent }) {
  const data = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) throw httpError(400, 'Name cannot be empty');
    data.name = body.name.trim().slice(0, 120);
  }
  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw httpError(400, 'Please enter a valid email address');
    data.email = email;
  }
  if (isStudent) {
    if (body.age !== undefined) {
      if (body.age === null || body.age === '') data.age = null;
      else {
        const age = Number(body.age);
        if (!Number.isInteger(age) || age < 3 || age > 99) throw httpError(400, 'Age must be a whole number between 3 and 99');
        data.age = age;
      }
    }
    if (body.subjectFocus !== undefined) {
      if (body.subjectFocus && !['maths', 'english', 'both'].includes(body.subjectFocus)) {
        throw httpError(400, 'subjectFocus must be maths, english or both');
      }
      data.subjectFocus = body.subjectFocus || null;
    }
  }
  return data;
}

function parseLessonDays(lessonDays) {
  if (lessonDays === undefined) return undefined;
  if (!Array.isArray(lessonDays)) throw httpError(400, 'lessonDays must be an array');
  const days = [...new Set(lessonDays.map(Number))];
  if (!days.every(isValidDayOfWeek)) throw httpError(400, 'lessonDays values must be 0 (Mon) to 6 (Sun)');
  return days;
}

// GET /api/users - managers see everyone.
// Tutors see themselves plus every student (so they can start a plan for a
// new student), but only get contact details for students they teach.
router.get('/', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const { role, userId } = req.user;
    if (role === 'manager') {
      return res.json(await prisma.user.findMany({ select: PUBLIC_USER_SELECT, orderBy: { name: 'asc' } }));
    }
    const [users, taught] = await Promise.all([
      prisma.user.findMany({ where: { OR: [{ role: 'student' }, { id: userId }] }, select: PUBLIC_USER_SELECT, orderBy: { name: 'asc' } }),
      prisma.lessonPlan.findMany({ where: tutorPlanWhere(userId), select: { studentId: true } }),
    ]);
    const mine = new Set(taught.map(p => p.studentId));
    res.json(users.map(u => (u.id === userId || mine.has(u.id))
      ? u
      : { id: u.id, name: u.name, role: u.role, lessonDays: u.lessonDays }));
  } catch (err) { next(err); }
});

// GET /api/users/students - students with their latest active plan stats
router.get('/students', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const { role, userId } = req.user;
    const planFilter = role === 'tutor' ? tutorPlanWhere(userId) : {};

    const students = await prisma.user.findMany({
      where: { role: 'student' },
      select: {
        id: true, email: true, name: true, age: true, subjectFocus: true, createdAt: true,
        lessonDays: { select: { dayOfWeek: true }, orderBy: { dayOfWeek: 'asc' } },
        studentPlans: {
          where: { status: 'active', ...planFilter },
          include: {
            items: { include: { studentResponses: { orderBy: { createdAt: 'desc' }, take: 1 } } }
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { name: 'asc' }
    });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const result = students.map(s => {
      const base = {
        id: s.id, email: s.email, name: s.name, age: s.age,
        subjectFocus: s.subjectFocus, createdAt: s.createdAt,
        lessonDays: s.lessonDays.map(d => d.dayOfWeek),
      };
      const plan = s.studentPlans[0] || null;
      if (!plan) return { ...base, plan: null, progress: 0, lastActivity: null, avgScore: null, flagged: false };

      const total = plan.items.length;
      const done = plan.items.filter(i => i.status === 'completed').length;
      const progress = total > 0 ? Math.round((done / total) * 100) : 0;

      const allResponses = plan.items.flatMap(i => i.studentResponses);
      const lastActivity = allResponses.length > 0
        ? allResponses.sort((a, b) => b.createdAt - a.createdAt)[0].createdAt
        : null;
      // Only responses with an actual score count toward the average
      const scored = allResponses.filter(r => r.score != null);
      const avgScore = scored.length > 0 ? scored.reduce((sum, r) => sum + r.score, 0) / scored.length : null;
      const flagReasons = [];
      if (lastActivity && lastActivity < sevenDaysAgo) flagReasons.push('No work in over a week');
      if (avgScore !== null && Math.round(avgScore) < 60) flagReasons.push(`Average score ${Math.round(avgScore)}%`);
      const flagged = flagReasons.length > 0;

      return { ...base, plan: { id: plan.id, title: plan.title, status: plan.status }, progress, lastActivity, avgScore, flagged, flagReasons };
    });

    res.json(role === 'tutor' ? result.filter(s => s.plan !== null) : result);
  } catch (err) { next(err); }
});

// POST /api/users - create student or tutor (manager only)
router.post('/', requireRole('manager'), async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    const role = req.body.role === 'tutor' ? 'tutor' : 'student';
    const isStudent = role === 'student';
    const data = profileFields(req.body, { isStudent });
    const lessonDays = isStudent ? parseLessonDays(req.body.lessonDays) : undefined;

    const user = await prisma.user.create({
      data: {
        ...data,
        role,
        passwordHash: await bcrypt.hash(String(password), 10),
        ...(lessonDays && lessonDays.length > 0 && {
          lessonDays: { create: lessonDays.map(dayOfWeek => ({ dayOfWeek })) }
        })
      },
      select: PUBLIC_USER_SELECT
    });
    res.status(201).json(user);
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'A user with that email already exists' });
    next(err);
  }
});

// GET /api/users/:id
// Students: only themselves. Tutors: themselves or students they teach. Managers: anyone.
router.get('/:id', auth, async (req, res, next) => {
  try {
    const { userId, role } = req.user;
    const targetId = parseId(req.params.id);
    if (role === 'student' && userId !== targetId) return res.status(403).json({ error: 'Forbidden' });

    const user = await prisma.user.findUnique({ where: { id: targetId }, select: PUBLIC_USER_SELECT });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (role === 'tutor' && user.id !== userId) {
      const teaches = user.role === 'student' && await prisma.lessonPlan.count({ where: { studentId: user.id, ...tutorPlanWhere(userId) } });
      if (!teaches) return res.status(403).json({ error: 'You can only view students you teach' });
    }
    res.json(user);
  } catch (err) { next(err); }
});

// PUT /api/users/:id - update a student or tutor profile (manager only)
router.put('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const targetId = parseId(req.params.id);
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { role: true } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    const isStudent = target.role === 'student';
    const data = profileFields(req.body, { isStudent });
    const lessonDays = isStudent ? parseLessonDays(req.body.lessonDays) : undefined;

    // Profile + lesson days updated atomically
    const user = await prisma.$transaction(async (tx) => {
      if (lessonDays !== undefined) {
        await tx.studentLessonDay.deleteMany({ where: { studentId: targetId } });
      }
      return tx.user.update({
        where: { id: targetId },
        data: {
          ...data,
          ...(lessonDays !== undefined && { lessonDays: { create: lessonDays.map(dayOfWeek => ({ dayOfWeek })) } })
        },
        select: PUBLIC_USER_SELECT
      });
    });
    res.json(user);
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'A user with that email already exists' });
    next(err);
  }
});

// DELETE /api/users/:id - manager only, students or tutors
router.delete('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const targetId = parseId(req.params.id);
    const user = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, role: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'manager') {
      return res.status(400).json({ error: 'Manager accounts cannot be deleted from the app' });
    }

    if (user.role === 'student') {
      // Deletes the student's whole history. Plans cascade to items + sessions.
      await prisma.$transaction([
        prisma.studentResponse.deleteMany({ where: { studentId: targetId } }),
        prisma.followUpLog.deleteMany({ where: { OR: [{ studentId: targetId }, { lessonPlan: { studentId: targetId } }] } }),
        prisma.lessonPlan.deleteMany({ where: { studentId: targetId } }),
        prisma.studentLessonDay.deleteMany({ where: { studentId: targetId } }),
        prisma.user.delete({ where: { id: targetId } })
      ]);
    } else {
      const [planCount, groupCount] = await Promise.all([
        prisma.lessonPlan.count({ where: { tutorId: targetId } }),
        prisma.groupSession.count({ where: { tutorId: targetId, scheduledAt: { gte: new Date() } } }),
      ]);
      if (groupCount > 0) {
        return res.status(409).json({ error: `This tutor leads ${groupCount} upcoming group session${groupCount === 1 ? '' : 's'}. Reassign or cancel them first.` });
      }
      if (planCount > 0) {
        return res.status(409).json({
          error: `This tutor has ${planCount} lesson plan${planCount === 1 ? '' : 's'} assigned. Reassign or delete those plans before deleting the tutor.`
        });
      }
      // Past group sessions they led are history; detach them before deleting
      await prisma.$transaction([
        prisma.lessonSession.updateMany({ where: { groupSession: { tutorId: targetId } }, data: { groupSessionId: null } }),
        prisma.groupSession.deleteMany({ where: { tutorId: targetId } }),
        prisma.user.delete({ where: { id: targetId } }),
      ]);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/users/:id/reset-password  { password? }
// Manager: any student or tutor. Tutor: students on one of their plans.
// Passwords are bcrypt-hashed and can never be viewed; this sets a new one
// and returns it exactly once so staff can pass it on.
router.post('/:id/reset-password', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const { userId, role } = req.user;
    const targetId = parseId(req.params.id);

    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, role: true } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'manager') return res.status(403).json({ error: 'Manager passwords can only be reset by the administrator script' });

    if (role === 'tutor') {
      if (target.role !== 'student') return res.status(403).json({ error: 'Tutors can only reset student passwords' });
      const teaches = await prisma.lessonPlan.count({ where: { studentId: targetId, tutorId: userId } });
      if (!teaches) return res.status(403).json({ error: 'You can only reset passwords for students you teach' });
    }

    const provided = req.body.password;
    if (provided && String(provided).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    const newPassword = provided ? String(provided) : generatePassword();
    await prisma.user.update({ where: { id: targetId }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });

    res.json({ success: true, newPassword });
  } catch (err) { next(err); }
});

module.exports = router;

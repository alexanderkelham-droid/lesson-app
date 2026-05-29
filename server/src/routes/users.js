const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// GET /api/users - manager/tutor: all users
router.get('/', auth, async (req, res, next) => {
  try {
    const { role: userRole } = req.user;
    if (!['manager', 'tutor'].includes(userRole)) return res.status(403).json({ error: 'Forbidden' });

    const users = await prisma.user.findMany({
      select: {
        id: true, email: true, name: true, role: true, age: true,
        subjectFocus: true, createdAt: true,
        lessonDays: { select: { dayOfWeek: true }, orderBy: { dayOfWeek: 'asc' } }
      },
      orderBy: { name: 'asc' }
    });
    res.json(users);
  } catch (err) { next(err); }
});

// GET /api/users/students - list students with lesson plan stats
router.get('/students', auth, async (req, res, next) => {
  try {
    const { role: userRole, userId } = req.user;
    if (!['manager', 'tutor'].includes(userRole)) return res.status(403).json({ error: 'Forbidden' });

    const planFilter = userRole === 'tutor' ? { tutorId: userId } : {};

    const students = await prisma.user.findMany({
      where: { role: 'student' },
      select: {
        id: true, email: true, name: true, age: true, subjectFocus: true, createdAt: true,
        lessonDays: { select: { dayOfWeek: true }, orderBy: { dayOfWeek: 'asc' } },
        studentPlans: {
          where: { status: 'active', ...planFilter },
          include: {
            items: {
              include: { studentResponses: { orderBy: { createdAt: 'desc' }, take: 1 } }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const result = students.map(s => {
      const plan = s.studentPlans[0] || null;
      if (!plan) return {
        id: s.id, email: s.email, name: s.name, age: s.age,
        subjectFocus: s.subjectFocus, createdAt: s.createdAt,
        lessonDays: s.lessonDays.map(d => d.dayOfWeek),
        plan: null, progress: 0, lastActivity: null, flagged: false
      };

      const total = plan.items.length;
      const done = plan.items.filter(i => i.status === 'completed').length;
      const progress = total > 0 ? Math.round((done / total) * 100) : 0;

      const allResponses = plan.items.flatMap(i => i.studentResponses);
      const lastActivity = allResponses.length > 0
        ? allResponses.sort((a, b) => b.createdAt - a.createdAt)[0].createdAt
        : null;

      const avgScore = allResponses.length > 0
        ? allResponses.reduce((sum, r) => sum + (r.score || 0), 0) / allResponses.length
        : null;

      const flagged = (lastActivity && lastActivity < sevenDaysAgo) || (avgScore !== null && avgScore < 60);

      return {
        id: s.id, email: s.email, name: s.name, age: s.age,
        subjectFocus: s.subjectFocus, createdAt: s.createdAt,
        lessonDays: s.lessonDays.map(d => d.dayOfWeek),
        plan: { id: plan.id, title: plan.title, status: plan.status },
        progress, lastActivity, avgScore, flagged
      };
    });

    const filtered = userRole === 'tutor'
      ? result.filter(s => s.plan !== null)
      : result;

    res.json(filtered);
  } catch (err) { next(err); }
});

// POST /api/users - create student or tutor (manager only)
router.post('/', auth, requireRole('manager'), async (req, res, next) => {
  try {
    const { name, email, password, role, age, subjectFocus, lessonDays } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    const userRole = role === 'tutor' ? 'tutor' : 'student';

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash,
        role: userRole,
        // Student-only fields
        age: userRole === 'student' && age ? parseInt(age) : null,
        subjectFocus: userRole === 'student' ? (subjectFocus || null) : null,
        lessonDays: userRole === 'student' && lessonDays?.length > 0 ? {
          create: lessonDays.map(day => ({ dayOfWeek: parseInt(day) }))
        } : undefined
      },
      select: {
        id: true, email: true, name: true, role: true, age: true,
        subjectFocus: true, createdAt: true,
        lessonDays: { select: { dayOfWeek: true }, orderBy: { dayOfWeek: 'asc' } }
      }
    });

    res.status(201).json(user);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'A user with that email already exists' });
    }
    next(err);
  }
});

// GET /api/users/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    const { userId, role } = req.user;
    const targetId = parseInt(req.params.id);

    if (role === 'student' && userId !== targetId) return res.status(403).json({ error: 'Forbidden' });

    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true, email: true, name: true, role: true, age: true,
        subjectFocus: true, createdAt: true,
        lessonDays: { select: { dayOfWeek: true }, orderBy: { dayOfWeek: 'asc' } }
      }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) { next(err); }
});

// PUT /api/users/:id - update student profile (manager only)
router.put('/:id', auth, requireRole('manager'), async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id);
    const { name, email, age, subjectFocus, lessonDays } = req.body;

    // Delete old lesson days and re-create
    await prisma.studentLessonDay.deleteMany({ where: { studentId: targetId } });

    const user = await prisma.user.update({
      where: { id: targetId },
      data: {
        ...(name && { name }),
        ...(email && { email: email.toLowerCase() }),
        age: age !== undefined ? (age ? parseInt(age) : null) : undefined,
        subjectFocus: subjectFocus !== undefined ? (subjectFocus || null) : undefined,
        lessonDays: {
          create: (lessonDays || []).map(day => ({ dayOfWeek: parseInt(day) }))
        }
      },
      select: {
        id: true, email: true, name: true, role: true, age: true,
        subjectFocus: true, createdAt: true,
        lessonDays: { select: { dayOfWeek: true }, orderBy: { dayOfWeek: 'asc' } }
      }
    });

    res.json(user);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'A user with that email already exists' });
    }
    next(err);
  }
});

// DELETE /api/users/:id - manager only, students or tutors
router.delete('/:id', auth, requireRole('manager'), async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id);
    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'manager') {
      return res.status(400).json({ error: 'Manager accounts cannot be deleted via this endpoint' });
    }

    if (user.role === 'student') {
      await prisma.$transaction([
        prisma.studentResponse.deleteMany({ where: { studentId: targetId } }),
        prisma.followUpLog.deleteMany({ where: { studentId: targetId } }),
        prisma.lessonPlan.deleteMany({ where: { studentId: targetId } }),
        prisma.studentLessonDay.deleteMany({ where: { studentId: targetId } }),
        prisma.user.delete({ where: { id: targetId } })
      ]);
    } else {
      // Tutor: refuse deletion if they have active plans assigned. Manager must reassign first.
      const planCount = await prisma.lessonPlan.count({ where: { tutorId: targetId } });
      if (planCount > 0) {
        return res.status(400).json({
          error: `This tutor has ${planCount} lesson plan${planCount === 1 ? '' : 's'} assigned. Reassign or delete those plans before deleting the tutor.`
        });
      }
      await prisma.user.delete({ where: { id: targetId } });
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/users/:id/reset-password
// Manager can reset any student or tutor. Tutor can reset password of students
// who are assigned to one of their lesson plans.
// Stored passwords are bcrypt hashes — we can't "view" the old one. This sets
// a new password and returns it once so the staff member can share it with
// the student.
router.post('/:id/reset-password', auth, async (req, res, next) => {
  try {
    const { userId, role } = req.user;
    if (role === 'student') return res.status(403).json({ error: 'Forbidden' });

    const targetId = parseInt(req.params.id);
    const { password: providedPassword } = req.body;

    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true }
    });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'manager') {
      return res.status(403).json({ error: 'Managers must reset their own password' });
    }

    // Permission check for tutors
    if (role === 'tutor') {
      if (target.role !== 'student') {
        return res.status(403).json({ error: 'Tutors can only reset student passwords' });
      }
      const planCount = await prisma.lessonPlan.count({
        where: { studentId: targetId, tutorId: userId }
      });
      if (planCount === 0) {
        return res.status(403).json({ error: 'You can only reset passwords for students you teach' });
      }
    }

    // Use the provided password or generate a friendly one
    function generate() {
      const adj = ['quick', 'happy', 'sunny', 'brave', 'bright', 'kind', 'eager'];
      const noun = ['oak', 'pine', 'fern', 'willow', 'maple', 'birch', 'cedar'];
      const num = Math.floor(100 + Math.random() * 900);
      return `${adj[Math.floor(Math.random() * adj.length)]}-${noun[Math.floor(Math.random() * noun.length)]}-${num}`;
    }
    const newPassword = providedPassword && providedPassword.length >= 4 ? providedPassword : generate();
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: targetId },
      data: { passwordHash }
    });

    // Return new password ONCE so staff can share with student. Never stored
    // in plaintext after this response.
    res.json({ success: true, newPassword });
  } catch (err) { next(err); }
});

module.exports = router;

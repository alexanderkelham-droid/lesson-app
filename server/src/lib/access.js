// Shared validation + authorization helpers used by every route file.
// Rule of thumb for access:
//   manager → everything
//   tutor   → only plans where plan.tutorId === their id
//   student → only plans where plan.studentId === their id (read-only, except
//             their own answers/responses)

const prisma = require('../prisma');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Positive integer id or null. Rejects "abc", "1.5", "-3", "".
function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// router.param handler: 400 on any non-numeric :id / :itemId etc.
function validateIdParam(req, res, next, value, name) {
  if (!parseId(value)) return res.status(400).json({ error: `Invalid ${name}` });
  next();
}

// Load a plan and check the caller may see it. Throws 400/403/404.
// Plans a tutor may see: their own, plus plans of students in group
// sessions they lead (a group tutor needs to see every child in the class).
function tutorPlanWhere(tutorId) {
  return { OR: [{ tutorId }, { sessions: { some: { groupSession: { tutorId } } } }] };
}

async function getPlanForAccess(req, planIdRaw) {
  const planId = parseId(planIdRaw);
  if (!planId) throw httpError(400, 'Invalid plan id');
  const plan = await prisma.lessonPlan.findUnique({
    where: { id: planId },
    select: { id: true, studentId: true, tutorId: true },
  });
  if (!plan) throw httpError(404, 'Plan not found');
  const { userId, role } = req.user;
  if (role === 'student' && plan.studentId !== userId) throw httpError(403, 'Forbidden');
  if (role === 'tutor' && plan.tutorId !== userId) {
    const viaGroup = await prisma.lessonSession.count({ where: { lessonPlanId: plan.id, groupSession: { tutorId: userId } } });
    if (!viaGroup) throw httpError(403, 'Forbidden');
  }
  return plan;
}

// Same, but only staff (manager / owning tutor) may modify.
async function assertCanMutatePlan(req, planIdRaw) {
  if (req.user.role === 'student') throw httpError(403, 'Forbidden');
  return getPlanForAccess(req, planIdRaw);
}

function isValidDayOfWeek(v) {
  return Number.isInteger(v) && v >= 0 && v <= 6; // 0 = Monday … 6 = Sunday
}

function isValidLessonTime(v) {
  return typeof v === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(v);
}

// Parse a date-ish input; returns Date or null (never an Invalid Date).
function parseDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

const PLAN_STATUSES = ['active', 'completed', 'draft'];
const ITEM_STATUSES = ['locked', 'available', 'in_progress', 'completed'];

module.exports = {
  tutorPlanWhere,
  httpError,
  parseId,
  validateIdParam,
  getPlanForAccess,
  assertCanMutatePlan,
  isValidDayOfWeek,
  isValidLessonTime,
  parseDate,
  PLAN_STATUSES,
  ITEM_STATUSES,
};

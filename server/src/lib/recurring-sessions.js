const prisma = require('../prisma');
const { zonedParts, zonedToUtc, zonedDateKey } = require('./time');
const { isValidDayOfWeek, isValidLessonTime } = require('./access');

/**
 * Generate recurring sessions for a plan. If the plan has lessonDayOfWeek
 * and lessonTime, ensures sessions exist for the next N weeks. Idempotent.
 *
 * Only ever ADDS weeks after the plan's latest existing session, so a
 * session the manager deleted or moved by hand is never recreated. (If a
 * plan's day/time changes, call resetFutureSessions first.)
 *
 * Times are interpreted in APP_TIMEZONE (default Europe/London), so
 * "Tuesday 18:00" stays 18:00 local all year round across BST/GMT.
 *
 * DB day-of-week: 0=Mon..6=Sun.  JS/UTC getDay(): 0=Sun..6=Sat.
 * Returns the count of newly created sessions.
 */
async function ensureRecurringSessions(planId, weeksAhead = 8) {
  const plan = await prisma.lessonPlan.findUnique({
    where: { id: planId },
    select: { id: true, lessonDayOfWeek: true, lessonTime: true, status: true }
  });
  if (!plan) return 0;
  if (!isValidDayOfWeek(plan.lessonDayOfWeek) || !isValidLessonTime(plan.lessonTime)) return 0;
  if (plan.status === 'completed') return 0;

  const existing = await prisma.lessonSession.findMany({
    where: { lessonPlanId: planId },
    select: { scheduledAt: true }
  });
  const existingDates = new Set(existing.map(s => zonedDateKey(s.scheduledAt)));
  const latestExisting = existing.reduce((max, s) => (s.scheduledAt > max ? s.scheduledAt : max), new Date(0));
  const latestKey = existing.length ? zonedDateKey(latestExisting) : '';

  const jsTargetDay = plan.lessonDayOfWeek === 6 ? 0 : plan.lessonDayOfWeek + 1;
  const [hh, mm] = plan.lessonTime.split(':').map(Number);

  // Walk local calendar dates (pure date arithmetic in UTC, no clock times)
  const now = new Date();
  const today = zonedParts(now);
  let cursor = new Date(Date.UTC(today.year, today.month0, today.day));
  for (let i = 0; i < 7 && cursor.getUTCDay() !== jsTargetDay; i++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const toCreate = [];
  for (let week = 0; week < weeksAhead; week++) {
    const y = cursor.getUTCFullYear(), m = cursor.getUTCMonth(), d = cursor.getUTCDate();
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const scheduledAt = zonedToUtc(y, m, d, hh, mm);
    // key > latestKey: string compare works for YYYY-MM-DD
    if (!existingDates.has(key) && scheduledAt > now && key > latestKey) {
      toCreate.push({ lessonPlanId: planId, scheduledAt });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  if (toCreate.length === 0) return 0;
  // skipDuplicates relies on the (lesson_plan_id, scheduled_at) unique index,
  // which makes concurrent calls safe.
  const result = await prisma.lessonSession.createMany({ data: toCreate, skipDuplicates: true });
  return result.count;
}

/**
 * Remove future sessions that haven't happened and have nothing attached, so
 * a changed regular slot can be regenerated cleanly. Sessions with items or
 * notes are kept (the tutor may have prepared them).
 */
async function resetFutureSessions(planId) {
  const { count } = await prisma.lessonSession.deleteMany({
    where: { lessonPlanId: planId, attendedAt: null, scheduledAt: { gt: new Date() }, notes: null, items: { none: {} } }
  });
  return count;
}

module.exports = { ensureRecurringSessions, resetFutureSessions };

const prisma = require('../prisma');
const { zonedParts, zonedToUtc, zonedDateKey } = require('./time');
const { isValidDayOfWeek, isValidLessonTime } = require('./access');

/**
 * Generate upcoming weekly lessons for a plan, N weeks ahead. Idempotent.
 *
 * Lessons come from the student's weekly SLOTS (StudentLessonDay rows with a
 * time) — a student can have several, e.g. Maths Tue 16:00 and English Tue
 * 17:40. Each generated lesson records its slot and subject. Slot lessons are
 * generated only on the student's main plan (latest active, else latest
 * draft) so a student with several plans never gets duplicates.
 *
 * Legacy fallback: a plan with no slots on the student but its own
 * lessonDayOfWeek + lessonTime still generates from that.
 *
 * Only ever ADDS weeks after the latest existing lesson for that slot, so a
 * lesson that was moved or deleted by hand is never recreated. Times are UK
 * local (APP_TIMEZONE), so 17:40 stays 17:40 across BST/GMT.
 *
 * DB day-of-week: 0=Mon..6=Sun. JS getUTCDay(): 0=Sun..6=Sat.
 * Returns the number of lessons created.
 */
async function ensureRecurringSessions(planId, weeksAhead = 8) {
  const plan = await prisma.lessonPlan.findUnique({
    where: { id: planId },
    select: {
      id: true, studentId: true, status: true, lessonDayOfWeek: true, lessonTime: true, createdAt: true,
      student: { select: { lessonDays: true } },
    },
  });
  if (!plan || plan.status === 'completed') return 0;

  let slots = plan.student.lessonDays.filter(d => isValidDayOfWeek(d.dayOfWeek) && isValidLessonTime(d.time));
  if (slots.length) {
    const main = await prisma.lessonPlan.findFirst({
      where: { studentId: plan.studentId, status: { in: ['active', 'draft'] } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // 'active' sorts before 'draft'
      select: { id: true },
    });
    if (main?.id !== plan.id) return 0;
  } else if (isValidDayOfWeek(plan.lessonDayOfWeek) && isValidLessonTime(plan.lessonTime)) {
    slots = [{ id: null, dayOfWeek: plan.lessonDayOfWeek, time: plan.lessonTime, subject: null, durationMins: null }];
  } else {
    return 0;
  }

  const existing = await prisma.lessonSession.findMany({
    where: { lessonPlanId: planId },
    select: { scheduledAt: true, slotId: true },
  });
  const now = new Date();
  const today = zonedParts(now);
  const toCreate = [];

  for (const slot of slots) {
    // Lessons belonging to this slot (legacy: any lesson in the plan)
    const mine = slot.id ? existing.filter(s => s.slotId === slot.id) : existing;
    const latestKey = mine.length ? zonedDateKey(mine.reduce((a, s) => (s.scheduledAt > a ? s.scheduledAt : a), new Date(0))) : '';
    const sameDay = new Set(mine.map(s => zonedDateKey(s.scheduledAt)));
    const jsTargetDay = slot.dayOfWeek === 6 ? 0 : slot.dayOfWeek + 1;
    const [hh, mm] = slot.time.split(':').map(Number);

    const cursor = new Date(Date.UTC(today.year, today.month0, today.day));
    for (let i = 0; i < 7 && cursor.getUTCDay() !== jsTargetDay; i++) cursor.setUTCDate(cursor.getUTCDate() + 1);

    for (let week = 0; week < weeksAhead; week++) {
      const y = cursor.getUTCFullYear(), m = cursor.getUTCMonth(), d = cursor.getUTCDate();
      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const scheduledAt = zonedToUtc(y, m, d, hh, mm);
      if (!sameDay.has(key) && scheduledAt > now && key > latestKey) {
        toCreate.push({
          lessonPlanId: planId, scheduledAt,
          slotId: slot.id, subject: slot.subject || null, durationMins: slot.durationMins || null,
        });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }

  if (toCreate.length === 0) return 0;
  // skipDuplicates relies on the (lesson_plan_id, scheduled_at) unique index
  const result = await prisma.lessonSession.createMany({ data: toCreate, skipDuplicates: true });
  return result.count;
}

/**
 * Remove future lessons that haven't happened and have nothing attached, so
 * changed slots can be regenerated cleanly. Lessons with items or notes are
 * kept (the tutor may have prepared them). Optionally only for one slot.
 */
async function resetFutureSessions(planId, { slotId } = {}) {
  const { count } = await prisma.lessonSession.deleteMany({
    where: {
      lessonPlanId: planId, attendedAt: null, scheduledAt: { gt: new Date() }, notes: null, items: { none: {} },
      ...(slotId !== undefined && { slotId }),
    },
  });
  return count;
}

// After a student's slots change: tidy empty future lessons and regenerate
async function refreshStudentSessions(studentId) {
  const plans = await prisma.lessonPlan.findMany({ where: { studentId, status: { not: 'completed' } }, select: { id: true } });
  for (const p of plans) {
    await resetFutureSessions(p.id);
    await ensureRecurringSessions(p.id);
  }
}

module.exports = { ensureRecurringSessions, resetFutureSessions, refreshStudentSessions };

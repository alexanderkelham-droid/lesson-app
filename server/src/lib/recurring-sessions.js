const prisma = require('../prisma');

/**
 * Generate recurring sessions for a plan. If the plan has lessonDayOfWeek
 * and lessonTime, ensures sessions exist for the next N weeks. Idempotent —
 * only creates dates that don't already have a session.
 *
 * DB day-of-week: 0=Mon..6=Sun.  JS getDay(): 0=Sun..6=Sat.
 *
 * Returns the count of newly created sessions.
 */
async function ensureRecurringSessions(planId, weeksAhead = 8) {
  const plan = await prisma.lessonPlan.findUnique({
    where: { id: planId },
    select: { id: true, lessonDayOfWeek: true, lessonTime: true, status: true }
  });
  if (!plan) return 0;
  if (plan.lessonDayOfWeek == null || !plan.lessonTime) return 0;
  if (plan.status === 'completed') return 0;

  const existing = await prisma.lessonSession.findMany({
    where: { lessonPlanId: planId },
    select: { scheduledAt: true }
  });
  const existingDates = new Set(existing.map(s => {
    const d = s.scheduledAt;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }));

  const jsTargetDay = plan.lessonDayOfWeek === 6 ? 0 : plan.lessonDayOfWeek + 1;
  const [hhStr, mmStr] = plan.lessonTime.split(':');
  const hh = parseInt(hhStr, 10);
  const mm = parseInt(mmStr, 10) || 0;
  if (isNaN(hh) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return 0;

  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (d.getDay() !== jsTargetDay) d.setDate(d.getDate() + 1);

  const toCreate = [];
  for (let i = 0; i < weeksAhead; i++) {
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!existingDates.has(dateStr)) {
      const scheduledAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0);
      if (scheduledAt > now) {
        toCreate.push({ lessonPlanId: planId, scheduledAt });
      }
    }
    d.setDate(d.getDate() + 7);
  }

  if (toCreate.length > 0) {
    await prisma.lessonSession.createMany({ data: toCreate });
  }
  return toCreate.length;
}

module.exports = { ensureRecurringSessions };

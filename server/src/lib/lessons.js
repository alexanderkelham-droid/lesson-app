// Lesson-level operations shared by individual sessions and group sessions.
const prisma = require('../prisma');
const { ensureRecurringSessions } = require('./recurring-sessions');

// Clone incomplete items from `fromSessionId` into the next future session of
// the same plan (or the unscheduled pool if none). The originals stay attached
// to the past session so its history is preserved. Items that were already
// carried forward are skipped, so running this twice never duplicates work.
async function carryOverIncompleteItems(fromSessionId, lessonPlanId) {
  const incompleteItems = await prisma.lessonPlanItem.findMany({
    where: {
      sessionId: fromSessionId,
      status: { not: 'completed' },
      carriedTo: { none: {} }
    },
    orderBy: { sequenceOrder: 'asc' },
    select: { id: true, sheetId: true, customTitle: true, customType: true, tutorNotes: true, dueDate: true }
  });
  if (incompleteItems.length === 0) return 0;

  await ensureRecurringSessions(lessonPlanId);
  const nextSession = await prisma.lessonSession.findFirst({
    where: { lessonPlanId, id: { not: fromSessionId }, attendedAt: null, scheduledAt: { gte: new Date() } },
    orderBy: { scheduledAt: 'asc' },
    select: { id: true }
  });

  const last = await prisma.lessonPlanItem.findFirst({
    where: { lessonPlanId },
    orderBy: { sequenceOrder: 'desc' },
    select: { sequenceOrder: true }
  });
  let seq = (last?.sequenceOrder || 0) + 1;

  await prisma.$transaction(
    incompleteItems.map(item =>
      prisma.lessonPlanItem.create({
        data: {
          lessonPlanId,
          sessionId: nextSession?.id || null,
          sheetId: item.sheetId,
          customTitle: item.customTitle,
          customType: item.customType,
          tutorNotes: item.tutorNotes,
          dueDate: item.dueDate,
          sequenceOrder: seq++,
          status: 'available',
          carriedFromId: item.id
        }
      })
    )
  );
  return incompleteItems.length;
}


// Cancel a lesson that hasn't happened. Its unfinished work MOVES (nothing was
// attempted) to the plan's next lesson, or to the unscheduled pool. The lesson
// is removed, unless it already holds completed work, in which case it's kept
// and labelled cancelled. `session` needs id, lessonPlanId, scheduledAt, notes.
async function cancelLessonSession(session, moveWork = 'next') {
  const sessionId = session.id;
  let target = null;
  if (moveWork !== 'unscheduled') {
    await ensureRecurringSessions(session.lessonPlanId);
    const after = new Date(Math.max(Date.now(), new Date(session.scheduledAt).getTime()));
    target = await prisma.lessonSession.findFirst({
      where: { lessonPlanId: session.lessonPlanId, id: { not: sessionId }, attendedAt: null, scheduledAt: { gt: after } },
      orderBy: { scheduledAt: 'asc' },
      select: { id: true, scheduledAt: true },
    });
  }
  const [moved, completed] = await Promise.all([
    prisma.lessonPlanItem.updateMany({ where: { sessionId, status: { not: 'completed' } }, data: { sessionId: target?.id ?? null } }),
    prisma.lessonPlanItem.count({ where: { sessionId, status: 'completed' } }),
  ]);
  let deleted = false;
  if (completed === 0) {
    await prisma.lessonSession.delete({ where: { id: sessionId } });
    deleted = true;
  } else {
    await prisma.lessonSession.update({ where: { id: sessionId }, data: { notes: `Cancelled${session.notes ? ` — ${session.notes}` : ''}`, groupSessionId: null } });
  }
  return { moved: moved.count, movedTo: target, deleted };
}

module.exports = { carryOverIncompleteItems, cancelLessonSession };

#!/usr/bin/env node
// Seed or remove namespaced QA test data (for manual / exploratory testing
// against a shared database without touching real students).
//
//   node server/scripts/qa-data.js seed      # prints logins as JSON
//   node server/scripts/qa-data.js cleanup   # removes everything QA
//
// Everything QA is identifiable: user emails end in @qa.redwood.test and
// QA-created sheets have titles starting with "[QA]".

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../src/prisma');
const { ensureRecurringSessions } = require('../src/lib/recurring-sessions');
const { zonedParts } = require('../src/lib/time');

const QA_DOMAIN = 'qa.redwood.test';

// `tag` limits cleanup to one smoke-test run (its emails/titles contain it).
async function cleanupQa(tag) {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${QA_DOMAIN}`, ...(tag && { contains: tag }) } }, select: { id: true }
  });
  const ids = users.map(u => u.id);
  const sheets = await prisma.sheet.findMany({
    where: { title: { startsWith: '[QA]', ...(tag && { contains: tag }) } }, select: { id: true }
  });
  const sheetIds = sheets.map(s => s.id);
  const plans = await prisma.lessonPlan.findMany({ where: { OR: [{ studentId: { in: ids } }, { tutorId: { in: ids } }] }, select: { id: true } });
  const planIds = plans.map(p => p.id);
  await prisma.$transaction([
    prisma.lessonSession.updateMany({ where: { groupSession: { tutorId: { in: ids } } }, data: { groupSessionId: null } }),
    prisma.groupSession.deleteMany({ where: { tutorId: { in: ids } } }),
    prisma.studentResponse.deleteMany({ where: { OR: [{ studentId: { in: ids } }, { sheetId: { in: sheetIds } }, { lessonPlanItem: { lessonPlanId: { in: planIds } } }] } }),
    prisma.followUpLog.deleteMany({ where: { OR: [{ lessonPlanId: { in: planIds } }, { sourceSheetId: { in: sheetIds } }, { followUpSheetId: { in: sheetIds } }] } }),
    prisma.lessonPlan.deleteMany({ where: { id: { in: planIds } } }),
    prisma.lessonPlanItem.deleteMany({ where: { sheetId: { in: sheetIds } } }),
    prisma.followUpRule.deleteMany({ where: { OR: [{ sourceSheetId: { in: sheetIds } }, { followUpSheetId: { in: sheetIds } }] } }),
    prisma.sheet.deleteMany({ where: { id: { in: sheetIds } } }),
    prisma.user.deleteMany({ where: { id: { in: ids } } }),
  ]);
  return { users: ids.length, sheets: sheetIds.length, plans: planIds.length };
}

async function seedQa() {
  const pw = () => `qa-${crypto.randomBytes(6).toString('base64url')}`;
  const mk = async (name, role, extra = {}) => {
    const password = pw();
    const user = await prisma.user.create({
      data: { name, role, email: `${name.toLowerCase().replace(/\W+/g, '.')}@${QA_DOMAIN}`, passwordHash: await bcrypt.hash(password, 10), ...extra },
    });
    return { id: user.id, email: user.email, password };
  };

  const today = zonedParts(new Date());
  const todayDow = (today.weekday + 6) % 7; // DB: 0 = Monday

  const manager = await mk('QA Manager', 'manager');
  const tutor = await mk('QA Tutor', 'tutor');
  const student = await mk('QA Student', 'student', {
    age: 6, subjectFocus: 'both', lessonDays: { create: [{ dayOfWeek: todayDow }] },
  });

  // Lesson is "today" at 23:30 local so the live lesson works right now
  const plan = await prisma.lessonPlan.create({
    data: {
      title: 'QA Student — test plan', studentId: student.id, tutorId: tutor.id, status: 'active',
      lessonDayOfWeek: todayDow, lessonTime: '23:30', studentNotes: 'Test student for QA runs',
    },
  });
  await ensureRecurringSessions(plan.id);
  const next = await prisma.lessonSession.findFirst({ where: { lessonPlanId: plan.id }, orderBy: { scheduledAt: 'asc' } });

  const sheetIds = [1234, 41, 42].filter(Boolean);
  const existing = await prisma.sheet.findMany({ where: { id: { in: sheetIds } }, select: { id: true } });
  let order = 1;
  for (const s of existing) {
    await prisma.lessonPlanItem.create({ data: { lessonPlanId: plan.id, sheetId: s.id, sequenceOrder: order++, status: 'available', sessionId: next?.id } });
  }
  await prisma.lessonPlanItem.create({
    data: { lessonPlanId: plan.id, customTitle: 'IXL Maths A.1 — counting to 20', customType: 'ixl_maths', sequenceOrder: order++, status: 'available', sessionId: next?.id },
  });

  return { manager, tutor, student, planId: plan.id, nextSession: next?.scheduledAt };
}

if (require.main === module) {
  const cmd = process.argv[2];
  (cmd === 'seed' ? cleanupQa().then(() => seedQa()) : cmd === 'cleanup' ? cleanupQa() : Promise.reject(new Error('usage: qa-data.js seed|cleanup')))
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(e => { console.error(e.message); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}

module.exports = { cleanupQa, seedQa, QA_DOMAIN };

#!/usr/bin/env node
// Merge duplicate student accounts (e.g. one account per subject, created
// before students could have several weekly lessons) into one student.
//
//   node server/scripts/merge-students.js --keep 147 --merge 148 --name "Jaagavi Jeyaruban" [--focus both]   # preview
//   ... --apply
//
// Moves from the merged account into the kept one: weekly lesson slots,
// lessons (sessions) and planned items (into the kept student's plan),
// results and follow-up logs. Then deletes the merged account's empty plan
// and the account itself. A JSON backup of both accounts is written first.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const prisma = require('../src/prisma');

const arg = n => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined; };

async function snapshot(id) {
  return prisma.user.findUnique({
    where: { id },
    include: {
      lessonDays: true,
      studentResponses: true,
      studentPlans: { include: { items: true, sessions: true, followUpLogs: true } },
    },
  });
}

async function main() {
  const keepId = Number(arg('keep')), mergeId = Number(arg('merge'));
  const name = arg('name'), focus = arg('focus');
  const apply = process.argv.includes('--apply');
  if (!keepId || !mergeId || keepId === mergeId) throw new Error('Usage: --keep <id> --merge <id> [--name "Full Name"] [--focus maths|english|both] [--apply]');

  const keep = await snapshot(keepId), merge = await snapshot(mergeId);
  if (!keep || !merge || keep.role !== 'student' || merge.role !== 'student') throw new Error('Both ids must be students');
  const keepPlan = keep.studentPlans.find(p => p.status === 'active') || keep.studentPlans[0];
  if (!keepPlan) throw new Error('The kept student has no plan to merge into');

  const clashSlot = merge.lessonDays.find(m => keep.lessonDays.some(k => k.dayOfWeek === m.dayOfWeek && (k.time || '') === (m.time || '')));
  console.log(`Keep #${keep.id} "${keep.name}" <${keep.email}> plan #${keepPlan.id}`);
  console.log(`Merge #${merge.id} "${merge.name}" <${merge.email}>: ${merge.studentPlans.length} plan(s), ${merge.studentPlans.reduce((a, p) => a + p.items.length, 0)} items, ${merge.studentPlans.reduce((a, p) => a + p.sessions.length, 0)} lessons, ${merge.lessonDays.length} slot(s), ${merge.studentResponses.length} results`);
  console.log(`Result name: "${name || keep.name}"${focus ? `, focus ${focus}` : ''}${clashSlot ? `  (slot ${clashSlot.dayOfWeek} ${clashSlot.time} exists on both — the duplicate will be dropped)` : ''}`);
  if (!apply) { console.log('Preview only. Re-run with --apply.\n'); return; }

  const backupDir = path.join(__dirname, '..', 'reports');
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, `merge-students-${keepId}-${mergeId}-${Date.now()}.json`), JSON.stringify({ keep, merge }, null, 2));

  await prisma.$transaction(async tx => {
    // Weekly slots (drop exact duplicates; their lessons are re-pointed first)
    for (const m of merge.lessonDays) {
      const dup = keep.lessonDays.find(k => k.dayOfWeek === m.dayOfWeek && (k.time || '') === (m.time || ''));
      if (dup) {
        await tx.lessonSession.updateMany({ where: { slotId: m.id }, data: { slotId: dup.id } });
        await tx.studentLessonDay.delete({ where: { id: m.id } });
      } else {
        await tx.studentLessonDay.update({ where: { id: m.id }, data: { studentId: keep.id } });
      }
    }
    // Lessons, items and logs from every plan of the merged student → kept plan
    const last = await tx.lessonPlanItem.findFirst({ where: { lessonPlanId: keepPlan.id }, orderBy: { sequenceOrder: 'desc' }, select: { sequenceOrder: true } });
    let seq = (last?.sequenceOrder || 0) + 1;
    for (const plan of merge.studentPlans) {
      for (const s of plan.sessions) {
        const clash = await tx.lessonSession.findFirst({ where: { lessonPlanId: keepPlan.id, scheduledAt: s.scheduledAt } });
        if (clash) {
          await tx.lessonPlanItem.updateMany({ where: { sessionId: s.id }, data: { sessionId: clash.id } });
          await tx.lessonSession.delete({ where: { id: s.id } });
        } else {
          await tx.lessonSession.update({ where: { id: s.id }, data: { lessonPlanId: keepPlan.id } });
        }
      }
      const items = await tx.lessonPlanItem.findMany({ where: { lessonPlanId: plan.id }, orderBy: { sequenceOrder: 'asc' }, select: { id: true } });
      for (const it of items) await tx.lessonPlanItem.update({ where: { id: it.id }, data: { lessonPlanId: keepPlan.id, sequenceOrder: seq++ } });
      await tx.followUpLog.updateMany({ where: { lessonPlanId: plan.id }, data: { lessonPlanId: keepPlan.id, studentId: keep.id } });
      await tx.lessonPlan.delete({ where: { id: plan.id } });
    }
    await tx.studentResponse.updateMany({ where: { studentId: merge.id }, data: { studentId: keep.id } });
    await tx.followUpLog.updateMany({ where: { studentId: merge.id }, data: { studentId: keep.id } });
    await tx.user.delete({ where: { id: merge.id } });
    await tx.user.update({
      where: { id: keep.id },
      data: {
        ...(name && { name }),
        ...(focus && { subjectFocus: focus }),
        ...(!keep.schoolYear && merge.schoolYear && { schoolYear: merge.schoolYear }),
        ...(!keep.ixlUsername && merge.ixlUsername && { ixlUsername: merge.ixlUsername }),
      },
    });
  });
  const after = await prisma.user.findUnique({ where: { id: keep.id }, select: { name: true, lessonDays: true, studentPlans: { select: { id: true, _count: { select: { items: true, sessions: true } } } } } });
  console.log(`Merged into "${after.name}": slots ${after.lessonDays.map(d => `${d.dayOfWeek} ${d.time || '-'} ${d.subject || ''}`).join(', ')} · plan ${after.studentPlans.map(p => `#${p.id} (${p._count.items} items, ${p._count.sessions} lessons)`).join(', ')}\n`);
}

main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());

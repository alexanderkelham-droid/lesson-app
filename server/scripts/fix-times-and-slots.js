#!/usr/bin/env node
// One-off data repair (safe to re-run):
//  1. Lessons created from a browser set to another time zone landed an hour
//     early (e.g. 16:40 instead of the plan's 17:40 UK). Shift those back.
//  2. Turn each plan's single "lesson day + time" into a weekly slot on the
//     student (StudentLessonDay with time + subject) and link its lessons.
//
//   node server/scripts/fix-times-and-slots.js           # preview
//   node server/scripts/fix-times-and-slots.js --apply

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const prisma = require('../src/prisma');
const { zonedParts } = require('../src/lib/time');

const hhmm = p => `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
const dbDay = weekday => (weekday + 6) % 7; // JS Sunday=0 → DB Monday=0

function guessSubject(title, focus) {
  const t = (title || '').toLowerCase();
  if (/verbal|11\+|11 plus|eleven/.test(t)) return '11plus';
  if (/math/.test(t)) return 'maths';
  if (/english|reading|spag|writing/.test(t)) return 'english';
  if (focus === 'maths' || focus === 'english') return focus;
  return null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const plans = await prisma.lessonPlan.findMany({
    where: { lessonDayOfWeek: { not: null }, lessonTime: { not: null } },
    select: {
      id: true, title: true, studentId: true, lessonDayOfWeek: true, lessonTime: true,
      student: { select: { name: true, subjectFocus: true, lessonDays: true } },
      sessions: { select: { id: true, scheduledAt: true, slotId: true } },
    },
  });

  let shifted = 0, slotsCreated = 0, slotsUpdated = 0, linked = 0;
  for (const plan of plans) {
    const [h, m] = plan.lessonTime.split(':').map(Number);
    const target = h * 60 + m;
    const taken = new Set(plan.sessions.map(s => s.scheduledAt.getTime()));

    // 1. Sessions exactly one hour early on the plan's weekday
    for (const s of plan.sessions) {
      const p = zonedParts(s.scheduledAt);
      if (dbDay(p.weekday) !== plan.lessonDayOfWeek) continue;
      if (p.hour * 60 + p.minute !== target - 60) continue;
      const fixed = new Date(s.scheduledAt.getTime() + 3600000);
      if (taken.has(fixed.getTime())) { console.log(`  skip #${s.id} (a lesson already exists at the corrected time)`); continue; }
      console.log(`  shift ${plan.student.name}: ${s.scheduledAt.toISOString()} (${hhmm(p)}) → ${plan.lessonTime}`);
      if (apply) await prisma.lessonSession.update({ where: { id: s.id }, data: { scheduledAt: fixed } });
      s.scheduledAt = fixed;
      shifted++;
    }

    // 2. Slot on the student for this plan's day + time
    const subject = guessSubject(`${plan.student.name} ${plan.title}`, plan.student.subjectFocus);
    let slot = plan.student.lessonDays.find(d => d.dayOfWeek === plan.lessonDayOfWeek && d.time === plan.lessonTime);
    const untimed = plan.student.lessonDays.find(d => d.dayOfWeek === plan.lessonDayOfWeek && !d.time);
    if (!slot && untimed) {
      console.log(`  slot ${plan.student.name}: day ${plan.lessonDayOfWeek} gets time ${plan.lessonTime} (${subject || 'no subject'})`);
      if (apply) slot = await prisma.studentLessonDay.update({ where: { id: untimed.id }, data: { time: plan.lessonTime, subject, durationMins: 60 } });
      else slot = { ...untimed, time: plan.lessonTime };
      untimed.time = plan.lessonTime;
      slotsUpdated++;
    } else if (!slot) {
      console.log(`  slot ${plan.student.name}: new day ${plan.lessonDayOfWeek} ${plan.lessonTime} (${subject || 'no subject'})`);
      if (apply) slot = await prisma.studentLessonDay.create({ data: { studentId: plan.studentId, dayOfWeek: plan.lessonDayOfWeek, time: plan.lessonTime, subject, durationMins: 60 } });
      else slot = { id: null, dayOfWeek: plan.lessonDayOfWeek, time: plan.lessonTime };
      plan.student.lessonDays.push(slot);
      slotsCreated++;
    }

    // Link this plan's lessons on that weekday + time to the slot
    const matching = plan.sessions.filter(s => {
      const p = zonedParts(s.scheduledAt);
      return !s.slotId && dbDay(p.weekday) === slot.dayOfWeek && hhmm(p) === slot.time;
    });
    if (matching.length && apply && slot.id) {
      await prisma.lessonSession.updateMany({ where: { id: { in: matching.map(s => s.id) } }, data: { slotId: slot.id, subject } });
    }
    linked += matching.length;
  }
  console.log(`\n${plans.length} plans · ${shifted} lessons re-timed · ${slotsCreated} slots created · ${slotsUpdated} slots given times · ${linked} lessons linked to slots`);
  if (!apply) console.log('Preview only. Re-run with --apply.');
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());

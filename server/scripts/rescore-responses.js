#!/usr/bin/env node
// Re-mark auto-scored student responses with the current (lenient) marking
// rules in src/lib/scoring.js.
//
//   node server/scripts/rescore-responses.js           # preview only
//   node server/scripts/rescore-responses.js --apply   # write changes
//
// Only touches responses that were auto-marked: tutor-graded ("Mark done"
// with a manual score) and live-lesson results scored from the tutor's correct/wrong
// are left alone. Scores are only ever RAISED — if a sheet was edited after
// the student submitted, re-marking against the new content could otherwise
// unfairly lower an old score.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const prisma = require('../src/prisma');
const { calculateScore } = require('../src/lib/scoring');

async function main() {
  const apply = process.argv.includes('--apply');
  const responses = await prisma.studentResponse.findMany({
    select: {
      id: true, score: true, responsesJson: true, createdAt: true,
      student: { select: { name: true, email: true } },
      sheet: { select: { id: true, title: true, contentJson: true } },
    },
    orderBy: { id: 'asc' },
  });

  const changes = [];
  let skipped = 0;
  for (const r of responses) {
    const rj = r.responsesJson || {};
    const tutorMarks = rj._tutorMarks && Object.keys(rj._tutorMarks).length > 0;
    if (rj._tutorGraded || tutorMarks) { skipped++; continue; }
    const answers = Object.fromEntries(Object.entries(rj).filter(([k]) => !k.startsWith('_')));
    const next = calculateScore(r.sheet.contentJson, answers);
    if (next == null) continue;
    if (r.score == null || next > r.score) changes.push({ r, next });
  }

  for (const { r, next } of changes) {
    const who = r.student.email.endsWith('@qa.redwood.test') ? `${r.student.name} (QA)` : r.student.name;
    console.log(`#${r.id}  ${who.padEnd(28)} ${r.sheet.title.slice(0, 40).padEnd(40)} ${String(r.score ?? '—').padStart(4)} → ${next}`);
  }
  console.log(`\n${responses.length} responses checked · ${skipped} tutor-marked skipped · ${changes.length} would change`);

  if (!apply) { console.log('Preview only. Re-run with --apply to save.'); return; }
  for (const { r, next } of changes) {
    await prisma.studentResponse.update({ where: { id: r.id }, data: { score: next } });
  }
  console.log(`Updated ${changes.length} scores.`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());

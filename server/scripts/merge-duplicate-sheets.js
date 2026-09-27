#!/usr/bin/env node
// Merge duplicate worksheets and tidy topic names, using the plan in
// server/reports/sheet-audit.json (produced by scripts/audit-sheets.js).
//
//   node server/scripts/merge-duplicate-sheets.js            # preview
//   node server/scripts/merge-duplicate-sheets.js --apply    # do it
//
// For each duplicate group: every reference to a removed sheet (lesson plan
// items, student responses, follow-up rules/logs) is re-pointed at the kept
// sheet, then the duplicates are deleted. A full JSON backup of every removed
// sheet is written to server/reports/ first, so nothing is lost.
// Topic variants ("Corbett Five a day" → "Corbett Five a Day") are renamed
// to one canonical spelling.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const prisma = require('../src/prisma');

const REPORT = path.join(__dirname, '..', 'reports', 'sheet-audit.json');

function groupsFromReport(report) {
  // Accept a few shapes: { keep, remove:[] } or { recommendedKeep, ids:[] } or { keepId, sheets:[{id}] }
  return (report.duplicates || []).map(g => {
    const keep = g.keep ?? g.keepId ?? g.recommendedKeep ?? g.recommended;
    const ids = g.remove ?? g.ids ?? (g.sheets || []).map(s => s.id);
    return { keep: Number(keep), remove: ids.map(Number).filter(id => id !== Number(keep)), reason: g.reason || g.kind || '' };
  }).filter(g => g.keep && g.remove.length);
}

function topicRenames(report) {
  // { canonical, variants:[] } or { variants:[{topic,count}] } → pick most common spelling
  return (report.topicVariants || []).map(v => {
    const variants = (v.variants || []).map(x => (typeof x === 'string' ? { topic: x, count: 0 } : x));
    const canonical = v.canonical || variants.slice().sort((a, b) => (b.count || 0) - (a.count || 0))[0]?.topic;
    return { canonical, from: variants.map(x => x.topic).filter(t => t !== canonical), subject: v.subject };
  }).filter(r => r.canonical && r.from.length);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
  const groups = groupsFromReport(report);
  const renames = topicRenames(report);

  const allRemove = groups.flatMap(g => g.remove);
  const keepIds = new Set(groups.map(g => g.keep));
  if (allRemove.some(id => keepIds.has(id))) throw new Error('A sheet is both kept and removed — check the report');

  const existing = await prisma.sheet.findMany({ where: { id: { in: [...allRemove, ...keepIds] } }, select: { id: true } });
  const exists = new Set(existing.map(s => s.id));

  console.log(`Duplicate groups: ${groups.length} · sheets to remove: ${allRemove.length}`);
  for (const g of groups) {
    const missing = [g.keep, ...g.remove].filter(id => !exists.has(id));
    console.log(`  keep #${g.keep}  remove ${g.remove.map(i => '#' + i).join(', ')}${missing.length ? `  (already gone: ${missing.join(',')})` : ''}`);
  }
  console.log(`Topic renames: ${renames.length}`);
  for (const r of renames) console.log(`  ${r.from.map(t => JSON.stringify(t)).join(', ')} → ${JSON.stringify(r.canonical)}`);

  if (!apply) { console.log('\nPreview only. Re-run with --apply.'); return; }

  const toRemove = allRemove.filter(id => exists.has(id));
  const backup = await prisma.sheet.findMany({ where: { id: { in: toRemove } } });
  const backupFile = path.join(__dirname, '..', 'reports', `removed-duplicate-sheets-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({ groups, sheets: backup }, null, 2));
  console.log(`\nBackup written: ${backupFile}`);

  for (const g of groups) {
    const remove = g.remove.filter(id => exists.has(id));
    if (!remove.length || !exists.has(g.keep)) continue;
    await prisma.$transaction([
      prisma.lessonPlanItem.updateMany({ where: { sheetId: { in: remove } }, data: { sheetId: g.keep } }),
      prisma.studentResponse.updateMany({ where: { sheetId: { in: remove } }, data: { sheetId: g.keep } }),
      prisma.followUpRule.updateMany({ where: { sourceSheetId: { in: remove } }, data: { sourceSheetId: g.keep } }),
      prisma.followUpRule.updateMany({ where: { followUpSheetId: { in: remove } }, data: { followUpSheetId: g.keep } }),
      prisma.followUpLog.updateMany({ where: { sourceSheetId: { in: remove } }, data: { sourceSheetId: g.keep } }),
      prisma.followUpLog.updateMany({ where: { followUpSheetId: { in: remove } }, data: { followUpSheetId: g.keep } }),
      prisma.sheet.deleteMany({ where: { id: { in: remove } } }),
    ]);
  }
  let renamed = 0;
  for (const r of renames) {
    const { count } = await prisma.sheet.updateMany({
      where: { topic: { in: r.from }, ...(r.subject && { subject: r.subject }) },
      data: { topic: r.canonical },
    });
    renamed += count;
  }
  console.log(`Removed ${toRemove.length} duplicate sheets · renamed topic on ${renamed} sheets.`);
}

main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());

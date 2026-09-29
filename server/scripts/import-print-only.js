#!/usr/bin/env node
// Import every worksheet PDF that isn't in the library yet as a PRINT-ONLY
// sheet: title/subject/topic/level from its folder, the original PDF
// attached, no digital questions yet. Free (no AI). Tutors can find, preview,
// plan and print them straight away; `digitise.js` later upgrades them in place.
//
//   node server/scripts/import-print-only.js            # preview
//   node server/scripts/import-print-only.js --apply    # create sheets
//
// Then run `node server/scripts/upload-originals.js` to attach the PDFs.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const prisma = require('../src/prisma');
const { metadataFor } = require('./digitise');

const REPORT = path.join(__dirname, '..', 'reports', 'sheet-audit.json');
const WANTED = new Set(['image_only', 'parse_fail', 'missing', 'duplicate_title', 'unreadable']);

// "15comprehension1-15-page2" in topic "Comprehension 1" → "Comprehension 1: sheet 15 (page 2)"
// Fix folder-name typos/abbreviations ("Comprenhension", "E Fractions")
function tidyWords(t) {
  return t.replace(/comprenhension/gi, 'Comprehension').replace(/^E[ _]/, 'Early ').replace(/\s+/g, ' ').trim();
}

function tidyTitle(rel, meta) {
  meta = { ...meta, topic: tidyWords(meta.topic), title: tidyWords(meta.title) };
  const base = path.basename(rel, path.extname(rel));
  const flat = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const num = base.match(/^(\d+)/)?.[1];
  const page = base.match(/(?:page|p\.?)\s*[-_ ]?(\d+)/i)?.[1];
  const topicFlat = flat(meta.topic).replace(/ss$/, '');
  const titleFlat = flat(meta.title);
  if (topicFlat && titleFlat.startsWith(topicFlat.slice(0, Math.max(6, topicFlat.length - 2))) && num) {
    return `${meta.topic}: sheet ${Number(num)}${page ? ` (page ${page})` : ''}`;
  }
  const t = meta.title.replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
  const known = new Set((await prisma.sheet.findMany({ where: { sourceFile: { not: null } }, select: { sourceFile: true } })).map(s => s.sourceFile));
  const todo = report.unimportedPdfs.filter(u => WANTED.has(u.category) && u.path.toLowerCase().endsWith('.pdf') && !known.has(u.path));
  const existingTitles = new Set((await prisma.sheet.findMany({ select: { title: true, subject: true } })).map(s => `${s.subject}|${s.title.toLowerCase()}`));

  const rows = todo.map(u => {
    const meta = metadataFor(u.path, new Set());
    let title = tidyTitle(u.path, meta);
    const key = t => `${meta.subject}|${t.toLowerCase()}`;
    let n = 2; const base = title;
    while (existingTitles.has(key(title))) title = `${base} (${n++})`;
    existingTitles.add(key(title));
    return {
      title, subject: meta.subject, topic: tidyWords(meta.topic), difficultyLevel: meta.difficultyLevel,
      sheetType: meta.sheetType, tags: meta.tags, sourceFile: u.path, digitisedBy: 'print_only',
      contentJson: { questions: [], printOnly: true },
    };
  });

  console.log(`${rows.length} PDFs to import as print-only sheets`);
  rows.slice(0, 12).forEach(r => console.log(`  ${r.subject} › ${r.topic} › ${r.title}  (L${r.difficultyLevel})`));
  if (!apply) { console.log('\nPreview only. Re-run with --apply.'); return; }
  const { count } = await prisma.sheet.createMany({ data: rows });
  console.log(`Created ${count} print-only sheets. Now run upload-originals.js to attach their PDFs.`);
}

main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());

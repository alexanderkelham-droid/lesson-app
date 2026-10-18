#!/usr/bin/env node
// Split the Corbett Maths "5-a-Day" monthly PDFs (one page per day) into one
// library sheet per day, so tutors can set e.g. "4th to 6th March" as three
// sheets and print just those pages.
//
//   node server/scripts/split-corbett.js           # preview only
//   node server/scripts/split-corbett.js --apply   # write PDFs, upload, create sheets
//
// For each monthly sheet: writes "<Month> daily/Day NN.pdf" next to the
// original in the worksheets archive, uploads each page as its own original
// (Supabase Storage), and creates a paper-only sheet "<Variant> 5-a-Day: 14 October".
// The monthly sheet is kept (renamed "... (whole month)"). Safe to re-run:
// days that already exist are skipped.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const prisma = require('../src/prisma');
const storage = require('../src/lib/storage');
const { worksheetsRoot, resolveInside } = require('../src/lib/originals');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "October Foundation 5-a-Day" -> { month: 'October', variant: 'Foundation' }
function parseTitle(title) {
  const t = title.replace(/\s*\(whole month\)$/, '');
  const month = MONTHS.find(m => t.toLowerCase().startsWith(m.toLowerCase()));
  const variant = /foundation/i.test(t) ? 'Foundation' : /numeracy/i.test(t) ? 'Numeracy' : 'Mixed';
  return { month, variant, base: t };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const root = worksheetsRoot();
  if (!root) throw new Error('WORKSHEETS_DIR not set in server/.env');
  if (apply && !storage.configured()) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in server/.env');

  const monthly = await prisma.sheet.findMany({
    where: { sourceFile: { contains: 'Corbett_Five a day' }, NOT: { sourceFile: { contains: ' daily/' } } },
    orderBy: { id: 'asc' },
  });
  const existing = new Set((await prisma.sheet.findMany({
    where: { sourceFile: { contains: 'Corbett_Five a day' } }, select: { sourceFile: true },
  })).map(s => s.sourceFile));

  let created = 0, skipped = 0;
  for (const m of monthly) {
    const { month, variant, base } = parseTitle(m.title);
    if (!month) { console.log(`  skip #${m.id} "${m.title}": no month in title`); continue; }
    const full = await resolveInside(root, m.sourceFile);
    if (!full) { console.log(`  skip #${m.id}: ${m.sourceFile} not found`); continue; }
    const src = await PDFDocument.load(await fs.promises.readFile(full), { ignoreEncryption: true });
    const pages = src.getPageCount();
    const dir = path.posix.join(path.posix.dirname(m.sourceFile), `${month} daily`);
    console.log(`#${m.id} ${base}: ${pages} days -> ${dir}/`);
    if (!apply) continue;

    for (let i = 0; i < pages; i++) {
      const day = i + 1;
      const rel = `${dir}/Day ${String(day).padStart(2, '0')}.pdf`;
      if (existing.has(rel)) { skipped++; continue; }
      const out = await PDFDocument.create();
      const [page] = await out.copyPages(src, [i]);
      out.addPage(page);
      const bytes = Buffer.from(await out.save());
      const dest = path.join(root, rel);
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await fs.promises.writeFile(dest, bytes);
      const ref = await storage.upload(storage.objectKeyFor(rel), bytes);
      await prisma.sheet.create({
        data: {
          title: `${variant} 5-a-Day: ${day} ${month}`,
          subject: m.subject,
          topic: m.topic,
          difficultyLevel: m.difficultyLevel,
          sheetType: m.sheetType,
          tags: [...new Set([...(m.tags || []).filter(t => t.toLowerCase() !== month.toLowerCase()), 'five a day', variant.toLowerCase(), month.toLowerCase(), 'daily'])],
          sourceFile: rel,
          pdfUrl: ref,
          digitisedBy: 'print_only',
          contentJson: { questions: [], printOnly: true, instructions: `Corbett Maths ${variant} 5-a-Day for ${day} ${month}. Work on paper.` },
        },
      });
      created++;
    }
    if (!/\(whole month\)$/.test(m.title)) {
      await prisma.sheet.update({ where: { id: m.id }, data: { title: `${base} (whole month)` } });
    }
  }
  console.log(apply ? `\nCreated ${created} daily sheets · skipped ${skipped} that already existed` : '\nPreview only. Re-run with --apply.');
}

main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());

#!/usr/bin/env node
// Upload the original worksheet PDFs to Supabase Storage (private bucket
// "worksheets") and record the reference on each sheet (Sheet.pdfUrl).
//
//   node server/scripts/upload-originals.js            # upload everything missing
//   node server/scripts/upload-originals.js --limit 5  # try a few first
//   node server/scripts/upload-originals.js --force    # re-upload even if set
//
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and WORKSHEETS_DIR in
// server/.env. Safe to re-run: only sheets without a pdfUrl are processed,
// and several sheets that share one PDF share one upload.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const prisma = require('../src/prisma');
const storage = require('../src/lib/storage');
const { worksheetsRoot, resolveInside } = require('../src/lib/originals');

function arg(name) { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; }

async function main() {
  if (!storage.configured()) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in server/.env');
  const root = worksheetsRoot();
  if (!root) throw new Error('WORKSHEETS_DIR not set in server/.env');
  const force = process.argv.includes('--force');
  const limit = Number(arg('limit')) || Infinity;
  const concurrency = Math.min(10, Number(arg('concurrency')) || 6);

  if (await storage.ensureBucket()) console.log(`Created private bucket "${storage.BUCKET}"`);

  const sheets = await prisma.sheet.findMany({
    where: { sourceFile: { not: null }, ...(force ? {} : { pdfUrl: null }) },
    select: { id: true, sourceFile: true },
    orderBy: { id: 'asc' },
  });
  // Group sheets by source file so each PDF uploads once
  const byFile = new Map();
  for (const s of sheets) byFile.set(s.sourceFile, [...(byFile.get(s.sourceFile) || []), s.id]);
  const files = [...byFile.entries()].slice(0, limit);
  console.log(`${sheets.length} sheets · ${files.length} PDFs to upload`);

  let done = 0, failed = 0, bytes = 0;
  const failures = [];
  let cursor = 0;
  async function worker() {
    while (cursor < files.length) {
      const [rel, ids] = files[cursor++];
      try {
        const full = await resolveInside(root, rel);
        if (!full) throw new Error('file not found in archive');
        const buf = await fs.promises.readFile(full);
        const ref = await storage.upload(storage.objectKeyFor(rel), buf);
        await prisma.sheet.updateMany({ where: { id: { in: ids } }, data: { pdfUrl: ref } });
        bytes += buf.length;
        done++;
      } catch (e) {
        failed++;
        failures.push(`${rel}: ${e.message.slice(0, 200)}`);
      }
      if ((done + failed) % 50 === 0) console.log(`  ${done + failed}/${files.length} (${(bytes / 1048576).toFixed(0)} MB)`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`\nUploaded ${done} PDFs (${(bytes / 1048576).toFixed(1)} MB) · failed ${failed}`);
  if (failures.length) console.log(failures.map(f => '  - ' + f).join('\n'));
}

main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());

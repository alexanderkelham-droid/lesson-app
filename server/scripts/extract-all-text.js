#!/usr/bin/env node
/**
 * Extracts text from every PDF in a directory and saves to a JSON file.
 * No API key required — just pdf-parse.
 *
 * Usage: node scripts/extract-all-text.js --dir ../worksheets
 * Output: scripts/extracted-texts.json
 */
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const pdfParse = require('pdf-parse');

function mapFolderToSubject(name) {
  if (name.startsWith('1_English_PDF')) return 'English';
  if (name.startsWith('2_Maths_PDF')) return 'Mathematics';
  if (name.startsWith('11+ Exams') || name.startsWith('Independent School')) return '11+ Preparation';
  if (name.startsWith('GCSE')) return name.replace(/_/g, ' ');
  if (name.startsWith('SATs')) return 'SATs';
  if (name.startsWith('Maths resources')) return 'Mathematics';
  return name;
}

function deriveMetadata(pdfPath, rootDir) {
  const relative = path.relative(rootDir, pdfPath);
  const parts = relative.split(path.sep);
  const filename = path.basename(pdfPath, '.pdf');
  const title = filename.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const subjectFolder = parts.length > 1 ? parts[0] : '';
  const subject = subjectFolder ? mapFolderToSubject(subjectFolder) : 'General';
  const topic = parts.length > 2 ? parts[1].replace(/[_-]+/g, ' ').trim() : subject;
  const tags = parts.slice(0, -1).map(p => p.replace(/[_-]+/g, ' ').trim());

  let difficultyLevel = 2;
  const lp = relative.toLowerCase();
  if (lp.includes('gcse') || lp.includes('11+') || lp.includes('exam')) difficultyLevel = 3;
  else if (lp.includes('advanced') || lp.includes('hard')) difficultyLevel = 4;
  else if (lp.includes('(s&s)') || lp.includes('early') || lp.includes('first') || lp.includes('introduction')) difficultyLevel = 1;

  let sheetType = 'worksheet';
  const lf = filename.toLowerCase();
  if (lf.includes('test') || lf.includes('exam') || lf.includes('assessment')) sheetType = 'quiz';
  else if (lf.includes('practice') || lf.includes('five a day')) sheetType = 'practice';

  return { title, subject, topic, difficultyLevel, sheetType, tags, relativePath: relative };
}

async function findPdfs(dir) {
  const results = [];
  async function walk(d) {
    const entries = await fsPromises.readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name.toLowerCase().endsWith('.pdf')) results.push(full);
    }
  }
  await walk(dir);
  return results.sort();
}

async function main() {
  const dirIdx = process.argv.indexOf('--dir');
  if (dirIdx === -1 || !process.argv[dirIdx + 1]) {
    console.error('Usage: node scripts/extract-all-text.js --dir /path/to/pdfs');
    process.exit(1);
  }
  const rootDir = path.resolve(process.argv[dirIdx + 1]);
  const outFile = path.resolve(__dirname, 'extracted-texts.json');

  console.log(`Scanning: ${rootDir}`);
  const pdfs = await findPdfs(rootDir);
  console.log(`Found ${pdfs.length} PDFs. Extracting text...\n`);

  const results = [];
  let success = 0, skipped = 0, errors = 0;

  for (let i = 0; i < pdfs.length; i++) {
    const pdfPath = pdfs[i];
    const relative = path.relative(rootDir, pdfPath);
    process.stdout.write(`[${i + 1}/${pdfs.length}] ${relative} ... `);

    try {
      const buffer = await fsPromises.readFile(pdfPath);
      const data = await pdfParse(buffer);
      const text = (data.text || '').trim();

      if (text.length < 20) {
        console.log('SKIPPED (no text)');
        skipped++;
        continue;
      }

      const meta = deriveMetadata(pdfPath, rootDir);
      results.push({ ...meta, text });
      console.log(`OK (${text.length} chars)`);
      success++;
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      errors++;
    }
  }

  await fsPromises.writeFile(outFile, JSON.stringify(results, null, 2));

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Extracted: ${success}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Errors:    ${errors}`);
  console.log(`Output:    ${outFile}`);
}

main().catch(e => { console.error(e); process.exit(1); });

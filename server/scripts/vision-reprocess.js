#!/usr/bin/env node

/**
 * vision-reprocess.js
 *
 * Re-processes every PDF worksheet through Claude (with native PDF / vision
 * support) to produce high-quality structured questions. Replaces the
 * existing contentJson in the matching DB sheet.
 *
 * Why this is better than the original text-extraction migration:
 *  - Claude reads the actual PDF (layouts, tables, equations) instead of
 *    pdf-parse's flat text extraction
 *  - Produces proper question types, correct answers, and clean prompts
 *  - Handles scanned/image PDFs that pdf-parse couldn't touch
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node server/scripts/vision-reprocess.js [options]
 *
 * Options:
 *   --dir <path>        Limit to a subdirectory of Worksheets/ (e.g. "2_Maths_PDF/Word problems 3")
 *   --limit <n>         Only process the first N matching PDFs (good for testing)
 *   --concurrency <n>   Number of parallel API calls (default 3, max 10)
 *   --model <name>      Override Claude model (default claude-opus-4-8)
 *   --dry-run           Don't write to DB, just print what would change
 *   --force             Re-process sheets even if they were already re-processed
 *   --resume            Skip sheets marked as re-processed (default behaviour)
 */

const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const WORKSHEETS_ROOT = path.resolve(__dirname, '../../Worksheets');
const LOG_FILE = path.resolve(__dirname, '../vision-reprocess-log.txt');
const PROGRESS_FILE = path.resolve(__dirname, '../vision-reprocess-progress.json');

// ─── CLI args ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    dir: null, limit: Infinity, concurrency: 3,
    model: 'claude-opus-4-8', dryRun: false, force: false,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') opts.dir = args[++i];
    else if (args[i] === '--limit') opts.limit = parseInt(args[++i], 10);
    else if (args[i] === '--concurrency') opts.concurrency = Math.min(10, Math.max(1, parseInt(args[++i], 10)));
    else if (args[i] === '--model') opts.model = args[++i];
    else if (args[i] === '--dry-run') opts.dryRun = true;
    else if (args[i] === '--force') opts.force = true;
    else if (args[i] === '--resume') { /* default */ }
  }
  return opts;
}

// ─── Claude system prompt ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `You convert tutoring worksheets (PDFs) into structured JSON for an online tutoring platform.

Your output MUST be a single JSON object — no markdown fences, no commentary.

Schema:
{
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice" | "fill_in_blank" | "free_text" | "matching" | "ordering",
      "prompt": "Clear, complete question prompt as a sentence",
      "options": ["..."],            // multiple_choice or ordering only
      "correct": ["..."],            // array of acceptable answers (most cases)
      "pairs": [{"left":"...", "right":"..."}],  // matching only
      "correct_order": ["..."],      // ordering only
      "points": 1
    }
  ]
}

Rules:
1. Read the PDF carefully — including tables, diagrams, equations, columns.
2. For each numbered question on the worksheet, create one JSON question.
3. Pick the right type:
   - multiple_choice: explicit A/B/C/D options or "circle the correct answer"
   - fill_in_blank: short specific answer (a number, a word, a date) — most maths is this
   - free_text: open-ended writing tasks (essays, sentences, explanations)
   - matching: pair items from two lists
   - ordering: arrange items in a sequence
4. Always include a "correct" answer when one is determinable from the worksheet content. For maths questions, COMPUTE the correct answer yourself (e.g. "4 + 7 = ?" → correct: ["11"]). For multi-acceptable answers, include all reasonable variants (e.g. ["£2.50", "2.50", "2.5"]).
5. For fill_in_blank without a determinable single answer, leave correct as [].
6. For free_text (essays, "write a sentence"), correct should be [].
7. Make prompts complete, well-punctuated sentences. Reword if the original is fragmentary, but preserve meaning.
8. If the worksheet has multiple parts (a, b, c) under one numbered question, create separate questions with ids q1a, q1b, q1c — OR combine into a single multi-part prompt if they're tightly related.
9. Skip pure-decoration content (headers, copyright lines, "name:______" boxes).
10. Minimum 3 questions per worksheet, maximum 25. If the PDF has fewer than 3 real questions (e.g. it's a reading passage), generate 3-5 reading-comprehension questions about the content.
11. For maths sheets with repetitive practice (e.g. 20 multiplications), include all of them as separate questions.
12. NEVER hallucinate questions that aren't in the worksheet.

If the PDF is blank, illegible, or contains no worksheet content, return:
{ "questions": [], "error": "unreadable" }`;

// ─── Walk Worksheets folder for PDFs ────────────────────────────────────────

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

// ─── Title-matching: find DB sheet for a PDF ────────────────────────────────

function titleFromFilename(filename) {
  return path.basename(filename, '.pdf')
    .replace(/^\d+\s*/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalise(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ─── Logging + progress ────────────────────────────────────────────────────

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  fs.appendFileSync(LOG_FILE, line + '\n');
  console.log(msg);
}

function loadProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) return { done: [] };
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8')); }
  catch { return { done: [] }; }
}
function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ─── Process one PDF ────────────────────────────────────────────────────────

async function processOne(client, model, pdfPath, dbSheet, opts) {
  const buffer = await fsPromises.readFile(pdfPath);
  const base64 = buffer.toString('base64');

  const userPrompt = `Convert this worksheet PDF into the JSON schema described.

Subject: ${dbSheet.subject}
Topic: ${dbSheet.topic}
Title: ${dbSheet.title}

Return ONLY the JSON object.`;

  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 }
        },
        { type: 'text', text: userPrompt }
      ]
    }]
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();

  // Strip code fences if Claude added them
  let cleaned = text;
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  const parsed = JSON.parse(cleaned);

  if (!parsed.questions || !Array.isArray(parsed.questions)) {
    throw new Error('Response missing `questions` array');
  }

  // Sanitise — strip any null bytes from prompts (Postgres can't store them)
  const cleanQuestions = parsed.questions.map(q => {
    const clean = { ...q };
    if (clean.prompt) clean.prompt = String(clean.prompt).replace(/\0/g, '');
    return clean;
  });

  const newContent = { questions: cleanQuestions };

  if (!opts.dryRun) {
    await prisma.sheet.update({
      where: { id: dbSheet.id },
      data: { contentJson: newContent }
    });
  }

  return { questionCount: cleanQuestions.length, tokenUsage: response.usage };
}

// ─── Concurrency-limited runner ─────────────────────────────────────────────

async function runWithConcurrency(items, concurrency, worker) {
  const results = [];
  let cursor = 0;
  const inflight = new Set();

  async function next() {
    if (cursor >= items.length) return;
    const idx = cursor++;
    const p = worker(items[idx], idx).then(
      val => { inflight.delete(p); results[idx] = { ok: true, value: val }; },
      err => { inflight.delete(p); results[idx] = { ok: false, error: err }; }
    );
    inflight.add(p);
    if (inflight.size >= concurrency) await Promise.race(inflight);
    return next();
  }

  await Promise.all(Array.from({ length: concurrency }, next));
  await Promise.all(inflight);
  return results;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY not set in env');
    console.error('Set it in server/.env or pass as env var.');
    process.exit(1);
  }

  // Reset log file at start
  fs.writeFileSync(LOG_FILE, `vision-reprocess started at ${new Date().toISOString()}\n${'='.repeat(60)}\n\n`);

  log(`Model: ${opts.model}`);
  log(`Concurrency: ${opts.concurrency}`);
  log(`Dry run: ${opts.dryRun}`);
  log(`Worksheets root: ${WORKSHEETS_ROOT}`);

  const scanDir = opts.dir ? path.resolve(WORKSHEETS_ROOT, opts.dir) : WORKSHEETS_ROOT;
  if (!fs.existsSync(scanDir)) {
    log(`ERROR: directory ${scanDir} does not exist`);
    process.exit(1);
  }

  const allPdfs = await findPdfs(scanDir);
  log(`Found ${allPdfs.length} PDF files`);

  // Load all DB sheets and build a title → sheet map
  const allSheets = await prisma.sheet.findMany({ select: { id: true, title: true, subject: true, topic: true } });
  log(`Found ${allSheets.length} sheets in DB`);

  const sheetByNormTitle = new Map();
  for (const s of allSheets) {
    sheetByNormTitle.set(normalise(s.title), s);
  }

  // Match PDFs to sheets
  const progress = loadProgress();
  const seen = new Set(progress.done);
  const jobs = [];
  let unmatched = 0;
  let skipped = 0;

  for (const pdf of allPdfs) {
    const title = titleFromFilename(pdf);
    const sheet = sheetByNormTitle.get(normalise(title));
    if (!sheet) { unmatched++; continue; }
    if (!opts.force && seen.has(sheet.id)) { skipped++; continue; }
    jobs.push({ pdf, sheet });
    if (jobs.length >= opts.limit) break;
  }

  log(`Matched ${jobs.length} PDFs to DB sheets`);
  log(`Unmatched: ${unmatched} | Skipped (already done): ${skipped}`);
  log(`${'─'.repeat(60)}`);

  if (jobs.length === 0) {
    log('Nothing to process. Done.');
    await prisma.$disconnect();
    return;
  }

  const client = new Anthropic();
  let done = 0, errors = 0, totalQs = 0;
  let totalInputTokens = 0, totalOutputTokens = 0;
  const errorList = [];

  const results = await runWithConcurrency(jobs, opts.concurrency, async (job, idx) => {
    const rel = path.relative(WORKSHEETS_ROOT, job.pdf);
    try {
      const result = await processOne(client, opts.model, job.pdf, job.sheet, opts);
      done++;
      totalQs += result.questionCount;
      totalInputTokens += result.tokenUsage?.input_tokens || 0;
      totalOutputTokens += result.tokenUsage?.output_tokens || 0;
      seen.add(job.sheet.id);
      progress.done = Array.from(seen);
      saveProgress(progress);
      log(`[${done + errors}/${jobs.length}] OK · ${result.questionCount}q · ${rel}`);
    } catch (e) {
      errors++;
      const msg = e?.message?.slice(0, 200) || 'unknown';
      errorList.push({ sheet: job.sheet.id, pdf: rel, error: msg });
      log(`[${done + errors}/${jobs.length}] ERR · ${rel} · ${msg}`);
    }
  });

  // Summary
  log(`\n${'='.repeat(60)}`);
  log('SUMMARY');
  log('='.repeat(60));
  log(`Processed:       ${done}`);
  log(`Errors:          ${errors}`);
  log(`Total questions: ${totalQs}`);
  log(`Avg questions:   ${done > 0 ? (totalQs / done).toFixed(1) : 0}`);
  log(`Input tokens:    ${totalInputTokens.toLocaleString()}`);
  log(`Output tokens:   ${totalOutputTokens.toLocaleString()}`);
  // Cost estimate: Opus ~$15/MTok input, ~$75/MTok output
  const estCost = (totalInputTokens / 1e6) * 15 + (totalOutputTokens / 1e6) * 75;
  log(`Est. cost:       $${estCost.toFixed(2)} (Opus pricing)`);

  if (errorList.length > 0) {
    log('\nErrors:');
    for (const e of errorList) log(`  sheet#${e.sheet} ${e.pdf}: ${e.error}`);
  }

  await prisma.$disconnect();
}

main().catch(async err => {
  log(`FATAL: ${err.message}`);
  console.error(err);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});

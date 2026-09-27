#!/usr/bin/env node
// Turn original worksheet PDFs into proper digital sheets with Claude
// (reading the PDF itself, so scans, tables and layouts work).
//
// Two jobs, driven by server/reports/sheet-audit.json:
//   redo   — existing sheets made by the old text extractor (digitisedBy
//            'text') are re-read from their source PDF. Sheets that already
//            have student work are skipped (changing their questions would
//            scramble saved answers) and listed for manual review.
//   import — PDFs that never became sheets get a new sheet.
//
//   node server/scripts/digitise.js --pilot 20            # dry run → reports/pilot/*.json
//   node server/scripts/digitise.js --job redo            # write to DB
//   node server/scripts/digitise.js --job import
//   node server/scripts/digitise.js --job all --concurrency 6
//   node server/scripts/digitise.js --ids 61,62           # specific sheets (redo)
//
// Every overwritten sheet's previous content is appended to
// reports/digitise-backup.jsonl first. Progress is kept in
// reports/digitise-progress.json so an interrupted run resumes.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const prisma = require('../src/prisma');
const { worksheetsRoot, resolveInside } = require('../src/lib/originals');

const REPORTS = path.join(__dirname, '..', 'reports');
const PROGRESS_FILE = path.join(REPORTS, 'digitise-progress.json');
const BACKUP_FILE = path.join(REPORTS, 'digitise-backup.jsonl');
const LOG_FILE = path.join(REPORTS, 'digitise-log.txt');
const MODEL = process.env.DIGITISE_MODEL || 'claude-sonnet-5';
// USD per million tokens (override if the model's pricing differs)
const PRICE_IN = Number(process.env.DIGITISE_PRICE_IN || 3);
const PRICE_OUT = Number(process.env.DIGITISE_PRICE_OUT || 15);
const costOf = (input, output) => (input * PRICE_IN + output * PRICE_OUT) / 1e6;

function arg(name) { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; }
const log = (msg) => { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`); console.log(msg); };

// ─── Prompt + output tool ────────────────────────────────────────────────────

const SYSTEM = `You convert UK tutoring worksheets (PDF scans or digital PDFs, ages ~5–16) into interactive digital worksheets for an online tutoring platform. Children will answer on screen and be auto-marked, so accuracy of questions AND answer keys matters more than anything.

How to read the worksheet:
- Read every page carefully: tables, diagrams, columns, handwriting-style fonts, answer boxes.
- Ignore decoration: logos, page numbers, copyright lines, "Name/Date/Class" boxes, publisher footers, file names.
- If the sheet has a reading text (story, article, poem, extract), put the COMPLETE text in "passage" exactly as written (keep paragraphs with blank lines). Do not summarise it.
- Put general instructions for the whole sheet (e.g. "Answer all questions in full sentences") in "instructions".

Questions:
- One question per numbered item on the sheet, in order. Split parts a/b/c into separate questions (ids q1a, q1b…) when each has its own answer.
- Repetitive drills (e.g. 30 sums) → include every item as its own fill_in_blank question.
- Never invent questions that aren't on the sheet. Only exception: if the sheet is ONLY a reading text with no questions at all, write 4–6 age-appropriate comprehension questions about it and set "generated": true on each.
- Rewrite fragmentary prompts into clear, complete, child-friendly sentences without changing the meaning. Keep blanks as "___".
- Types:
  • multiple_choice — explicit options, "circle/tick the correct…", true/false. Put every option in "options"; "correct" must contain the exact option text(s).
  • fill_in_blank — one short, specific answer (number, word, date, short phrase). Most maths.
  • free_text — open answers (sentences, explanations, descriptions, creative writing). correct = [].
  • matching — pairs from two lists ("pairs": [{left,right}] in the CORRECT pairing).
  • ordering — put items in order ("options" = items as shown, "correct_order" = right order).
- If a question can't be answered without seeing a picture/diagram/graph/grid that you cannot express in words, still include it, describe what the picture shows in the prompt if possible, and set "requiresImage": true. Questions asking the child to draw, colour, shade or trace: type free_text, requiresImage true.
- points: use the marks shown on the sheet (e.g. "(2 marks)"), default 1.

Answer keys (critical):
- Give "correct" for every multiple_choice and fill_in_blank question whenever an answer is determinable. COMPUTE maths answers yourself and double-check each one (re-do the arithmetic; e.g. for a division the answer is the quotient, not the divisor). Include sensible accepted variants (["£2.50","2.50","2.5"], ["7","seven"]).
- If an answer key is printed on the sheet, use it but verify it.
- If no single answer is determinable, use [] (it will be marked by the tutor).

Output hygiene:
- Never use emojis or decorative symbols in any text (the app has a strict no-emoji rule). Plain text only.
- Prompts and answers must contain ONLY the final text a child should see. Never include your working, doubts, corrections or notes ("Actually…", "wait", "I think…", "(unclear)"). Work things out silently first.
- If a question is too unclear or damaged to reproduce faithfully, still include your best faithful version, set "correct": [] and "needsReview": true.

If the PDF is blank, illegible or not a worksheet, call the tool with an empty questions array and "unreadable": true.`;

// Used when the full reading passage can't be reproduced (e.g. published
// fiction extracts): questions only, the child reads the text on the original.
const NO_PASSAGE_NOTE = `IMPORTANT: Do NOT reproduce the reading text/extract itself (it is copyrighted and is on the printed original). Leave "passage" empty and set "passageOnOriginal": true. Write only the questions, referring to "the text" as needed.`;

const TOOL = {
  name: 'save_worksheet',
  description: 'Save the digital version of the worksheet.',
  input_schema: {
    type: 'object',
    properties: {
      unreadable: { type: 'boolean' },
      passageOnOriginal: { type: 'boolean' },
      instructions: { type: 'string' },
      passage: { type: 'string', description: 'Full reading text, if the sheet has one' },
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['multiple_choice', 'fill_in_blank', 'free_text', 'matching', 'ordering'] },
            prompt: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
            correct: { type: 'array', items: { type: 'string' } },
            pairs: { type: 'array', items: { type: 'object', properties: { left: { type: 'string' }, right: { type: 'string' } }, required: ['left', 'right'] } },
            correct_order: { type: 'array', items: { type: 'string' } },
            points: { type: 'integer' },
            requiresImage: { type: 'boolean' },
            generated: { type: 'boolean' },
            needsReview: { type: 'boolean' },
          },
          required: ['id', 'type', 'prompt'],
        },
      },
    },
    required: ['questions'],
  },
};

// ─── Clean + validate Claude's output ────────────────────────────────────────

// Null bytes (Postgres) and emojis (app rule: never show emojis) are removed.
// Genuine symbols used as content (e.g. ♡ in a pattern question) are kept.
const strip = s => (typeof s === 'string' ? s.replace(/\u0000/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{FE0F}\u{200D}]/gu, '').replace(/[ \t]{2,}/g, ' ').trim() : s);

function clean(out) {
  const seen = new Set();
  const questions = (out.questions || []).map((q, i) => {
    let id = strip(q.id) || `q${i + 1}`;
    while (seen.has(id)) id = `${id}_${i + 1}`;
    seen.add(id);
    const c = { id, type: q.type, prompt: strip(q.prompt) || '', points: Number.isInteger(q.points) && q.points > 0 ? q.points : 1 };
    if (q.options?.length) c.options = q.options.map(strip).filter(Boolean);
    if (Array.isArray(q.correct)) c.correct = q.correct.map(strip).filter(x => x !== '');
    if (q.type === 'matching') c.pairs = (q.pairs || []).map(p => ({ left: strip(p.left), right: strip(p.right) })).filter(p => p.left && p.right);
    if (q.type === 'ordering') { c.correct_order = (q.correct_order || []).map(strip); if (!c.options) c.options = [...c.correct_order]; }
    if (q.requiresImage) c.requiresImage = true;
    if (q.generated) c.generated = true;
    if (q.needsReview) c.needsReview = true;
    // Multiple choice with no options isn't answerable on screen
    if (c.type === 'multiple_choice' && (!c.options || c.options.length < 2)) c.type = 'fill_in_blank', delete c.options;
    // Keep MC answers matching option text exactly (case-insensitive repair)
    if (c.type === 'multiple_choice' && c.correct?.length) {
      c.correct = c.correct.map(a => c.options.find(o => o.toLowerCase() === a.toLowerCase()) || a);
    }
    if (c.type === 'free_text') c.correct = [];
    return c;
  }).filter(q => q.prompt);
  const content = { questions };
  if (strip(out.passage)) content.passage = strip(out.passage);
  if (strip(out.instructions)) content.instructions = strip(out.instructions);
  if (out.passageOnOriginal && !content.passage) content.passageOnOriginal = true;
  return content;
}

function looksBroken(content) {
  const issues = [];
  if (content.questions.length === 0) issues.push('no questions');
  for (const q of content.questions) {
    if (q.type === 'multiple_choice' && q.correct?.length && !q.correct.every(a => q.options.includes(a))) issues.push(`${q.id}: MC answer not among options`);
    if (q.type === 'ordering' && (q.correct_order || []).length !== (q.options || []).length) issues.push(`${q.id}: ordering length mismatch`);
    // Model reasoning leaking into the text
    if (/\b(actually|wait|hmm|i think|let me|on second thought)\b/i.test(`${q.prompt} ${(q.correct || []).join(' ')}`)) issues.push(`${q.id}: reasoning text in prompt`);
    if (q.needsReview) issues.push(`${q.id}: flagged for review`);
  }
  return issues;
}

// ─── Metadata for newly imported PDFs (mirrors auto-migrate.js) ─────────────

function metadataFor(rel, existingTitles) {
  const parts = rel.split('/');
  const filename = path.basename(rel, path.extname(rel));
  let title = filename.replace(/^\d+\s*/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || filename;
  const subject = parts[0].startsWith('1_English') ? 'English' : parts[0].startsWith('2_Maths') ? 'Mathematics' : 'General';
  const topicRaw = parts.length > 2 ? parts[1] : parts[0];
  const topic = topicRaw.replace(/[_-]+/g, ' ').replace(/\s*\(S&S\)\s*/g, '').trim();
  const tags = parts.slice(0, -1).map(p => p.replace(/[_-]+/g, ' ').trim());
  const lower = rel.toLowerCase();
  let difficultyLevel = 2;
  if (lower.includes('(s&s)') || lower.includes('early') || lower.includes('first') || /maths [12] /.test(lower)) difficultyLevel = 1;
  else if (/maths [67] /.test(lower) || lower.includes('algebra') || lower.includes('gcse')) difficultyLevel = 3;
  let sheetType = 'worksheet';
  const lf = filename.toLowerCase();
  if (/test|exam|assessment/.test(lf)) sheetType = 'quiz';
  if (/five a day|5-a-day|5 a day/.test(lf)) sheetType = 'practice';
  // Disambiguate titles that already exist (e.g. many "Symplify" sheets)
  const num = filename.match(/^(\d+)/)?.[1];
  const key = t => `${subject}|${t.toLowerCase()}`;
  if (existingTitles.has(key(title))) {
    title = num ? `${title} ${Number(num)}` : `${title} (${parts[parts.length - 2] || 'copy'})`;
    let n = 2; const baseT = title;
    while (existingTitles.has(key(title))) title = `${baseT} (${n++})`;
  }
  existingTitles.add(key(title));
  return { title, subject, topic, difficultyLevel, sheetType, tags };
}

// ─── Claude call ─────────────────────────────────────────────────────────────

function requestParams(data, hint, { noPassage = false } = {}) {
  return {
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'save_worksheet' },
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } },
        { type: 'text', text: `Worksheet: "${hint.title}" — ${hint.subject}, topic "${hint.topic}". Convert it with the save_worksheet tool.${noPassage ? '\n\n' + NO_PASSAGE_NOTE : ''}` },
      ],
    }],
  };
}

function toolOutput(res) {
  const tool = res.content.find(b => b.type === 'tool_use');
  if (!tool) throw new Error(`no tool output (stop_reason ${res.stop_reason})`);
  if (res.stop_reason === 'max_tokens') throw new Error('output truncated (max_tokens)');
  return { raw: tool.input, usage: res.usage };
}

const isContentFilter = e => /content filtering/i.test(String(e?.message || JSON.stringify(e || '')));

async function digitisePdf(client, file, hint) {
  const data = (await fs.promises.readFile(file)).toString('base64');
  try {
    return toolOutput(await client.messages.create(requestParams(data, hint)));
  } catch (e) {
    if (!isContentFilter(e)) throw e;
    // Typically a copyrighted extract: retry without reproducing the passage
    return toolOutput(await client.messages.create(requestParams(data, hint, { noPassage: true })));
  }
}

const isBillingError = e => /credit balance|billing|insufficient/i.test(String(e?.message || e));

// ─── Work list ───────────────────────────────────────────────────────────────

async function buildQueue({ job, idsArg, pilot, report, progress }) {
  let redo = [];
  if (idsArg || job === 'redo' || job === 'all') {
    const where = idsArg
      ? { id: { in: idsArg.split(',').map(Number) } }
      : { digitisedBy: 'text', sourceFile: { not: null } };
    const sheets = await prisma.sheet.findMany({
      where,
      select: { id: true, title: true, subject: true, topic: true, sourceFile: true,
        _count: { select: { studentResponses: true, lessonPlanItems: true } } },
      orderBy: { id: 'asc' },
    });
    const withWork = sheets.filter(s => s._count.studentResponses > 0);
    if (withWork.length) log(`Skipping ${withWork.length} sheets with student work: ${withWork.map(s => '#' + s.id).join(', ')}`);
    redo = sheets.filter(s => s._count.studentResponses === 0 && s.sourceFile)
      .map(s => ({ kind: 'redo', key: `sheet:${s.id}`, sheet: s, rel: s.sourceFile }));
  }

  let imports = [];
  if (!idsArg && (job === 'import' || job === 'all')) {
    const wanted = new Set(['image_only', 'parse_fail', 'missing', 'duplicate_title', 'unreadable']);
    const known = new Set((await prisma.sheet.findMany({ where: { sourceFile: { not: null } }, select: { sourceFile: true } })).map(s => s.sourceFile));
    imports = report.unimportedPdfs
      .filter(u => wanted.has(u.category) && u.path.toLowerCase().endsWith('.pdf') && !known.has(u.path))
      .map(u => ({ kind: 'import', key: `file:${u.path}`, rel: u.path, pages: u.pages || 1 }));
  }

  let queue = [...redo, ...imports].filter(t => !progress.done[t.key]);
  const info = Object.fromEntries(report.sheets.map(s => [s.id, s]));
  for (const t of queue) if (t.kind === 'redo') t.pages = info[t.sheet.id]?.pdfPages || 1;

  if (pilot) {
    const r = queue.filter(t => t.kind === 'redo');
    const i = queue.filter(t => t.kind === 'import');
    const spread = (arr, n) => arr.filter((_, idx) => idx % Math.max(1, Math.floor(arr.length / n)) === 0).slice(0, n);
    return [...spread(r, Math.ceil(pilot / 2)), ...spread(i, Math.floor(pilot / 2))];
  }

  // Worst first: wrong answer keys → used in lesson plans → POOR → NEEDS_REVIEW
  // → other text sheets → imports (reading/comprehension first, then the rest)
  const rank = t => {
    if (t.kind === 'import') return /comprehension|comprenhension|reading/i.test(t.rel) ? 60 : 70;
    const s = info[t.sheet.id] || {};
    if ((s.reasons || []).some(x => /answer key(s)? (is|are) wrong|wrong answer/i.test(x))) return 0;
    if (t.sheet._count.lessonPlanItems > 0) return 10;
    return { POOR: 20, NEEDS_REVIEW: 30, GOOD: 50 }[s.quality] ?? 40;
  };
  return queue.sort((a, b) => rank(a) - rank(b));
}

// ─── Save one result (shared by live + batch modes) ─────────────────────────

async function applyResult(t, meta, raw, { dryRun, progress, existingTitles }) {
  const content = clean(raw);
  const issues = raw.unreadable ? ['marked unreadable'] : looksBroken(content);
  if (dryRun) {
    fs.mkdirSync(path.join(REPORTS, 'pilot'), { recursive: true });
    const before = t.kind === 'redo' ? (await prisma.sheet.findUnique({ where: { id: t.sheet.id }, select: { contentJson: true } })).contentJson : null;
    const name = (t.kind === 'redo' ? `redo-${t.sheet.id}` : `import-${path.basename(t.rel, '.pdf')}`).replace(/[^\w.-]+/g, '_');
    fs.writeFileSync(path.join(REPORTS, 'pilot', `${name}.json`), JSON.stringify({ source: t.rel, meta, issues, before, after: content }, null, 2));
  } else if (issues.includes('no questions') || raw.unreadable) {
    progress.done[t.key] = { status: 'unreadable', at: new Date().toISOString() };
  } else if (t.kind === 'redo') {
    const old = await prisma.sheet.findUnique({ where: { id: t.sheet.id } });
    fs.appendFileSync(BACKUP_FILE, JSON.stringify({ at: new Date().toISOString(), sheet: old }) + '\n');
    await prisma.sheet.update({ where: { id: t.sheet.id }, data: { contentJson: content, digitisedBy: issues.length ? 'vision_review' : 'vision' } });
    progress.done[t.key] = { status: 'ok', questions: content.questions.length, issues };
  } else {
    const m = meta || metadataFor(t.rel, existingTitles);
    const created = await prisma.sheet.create({ data: { ...m, contentJson: content, sourceFile: t.rel, digitisedBy: issues.length ? 'vision_review' : 'vision' } });
    progress.done[t.key] = { status: 'ok', sheetId: created.id, questions: content.questions.length, issues };
  }
  return { content, issues };
}

// ─── Batch mode (half price; results arrive within ~24h, usually much sooner) ─

const BATCHES_FILE = path.join(REPORTS, 'digitise-batches.json');
const loadBatches = () => (fs.existsSync(BATCHES_FILE) ? JSON.parse(fs.readFileSync(BATCHES_FILE, 'utf8')) : { batches: [] });
const saveBatches = b => fs.writeFileSync(BATCHES_FILE, JSON.stringify(b, null, 2));

async function submitBatches(client, queue, { root, budget, existingTitles }) {
  const state = loadBatches();
  const pending = new Set(state.batches.filter(b => !b.collected).flatMap(b => b.items.map(i => i.key)));
  // Estimated batch cost per page (half of live pricing); refine after the first batch
  const perPage = Number(arg('per-page')) || 0.011;
  const maxBytes = 150 * 1024 * 1024; // stay well under the 256 MB batch limit
  let est = 0, chunk = [], bytes = 0, submitted = 0;

  async function flush() {
    if (!chunk.length) return;
    const batch = await client.messages.batches.create({ requests: chunk.map(c => c.request) });
    state.batches.push({ id: batch.id, createdAt: new Date().toISOString(), items: chunk.map(c => c.item) });
    saveBatches(state);
    log(`Submitted batch ${batch.id} with ${chunk.length} sheets`);
    submitted += chunk.length; chunk = []; bytes = 0;
  }

  for (const [idx, t] of queue.entries()) {
    if (pending.has(t.key)) continue;
    const cost = (t.pages || 1) * perPage;
    if (est + cost > budget) { log(`Budget $${budget} reached after ~$${est.toFixed(2)} (estimated).`); break; }
    const file = await resolveInside(root, t.rel);
    if (!file) { log(`  missing PDF: ${t.rel}`); continue; }
    const data = (await fs.promises.readFile(file)).toString('base64');
    const meta = t.kind === 'redo' ? { title: t.sheet.title, subject: t.sheet.subject, topic: t.sheet.topic } : metadataFor(t.rel, existingTitles);
    if (bytes + data.length > maxBytes) await flush();
    chunk.push({
      request: { custom_id: `d${idx}_${Date.now().toString(36)}`.slice(0, 64), params: requestParams(data, meta) },
      item: { key: t.key, kind: t.kind, rel: t.rel, sheetId: t.sheet?.id, meta },
    });
    chunk[chunk.length - 1].item.customId = chunk[chunk.length - 1].request.custom_id;
    bytes += data.length; est += cost;
  }
  await flush();
  log(`Submitted ${submitted} sheets in batches · estimated ≈ $${est.toFixed(2)}. Run --collect later to save results.`);
}

async function collectBatches(client, { progress, saveProgress, existingTitles }) {
  const state = loadBatches();
  const totals = { ok: 0, failed: 0, input: 0, output: 0 };
  for (const b of state.batches.filter(x => !x.collected)) {
    const info = await client.messages.batches.retrieve(b.id);
    if (info.processing_status !== 'ended') {
      log(`Batch ${b.id}: ${info.processing_status} (${JSON.stringify(info.request_counts)})`);
      continue;
    }
    const byId = Object.fromEntries(b.items.map(i => [i.customId, i]));
    for await (const r of await client.messages.batches.results(b.id)) {
      const item = byId[r.custom_id];
      if (!item) continue;
      const t = { kind: item.kind, key: item.key, rel: item.rel, sheet: item.sheetId ? { id: item.sheetId } : undefined };
      try {
        let out;
        if (r.result.type === 'succeeded') out = toolOutput(r.result.message);
        else if (isContentFilter(r.result.error)) {
          const file = await resolveInside(worksheetsRoot(), item.rel);
          out = await digitisePdf(client, file, item.meta || { title: item.rel, subject: '', topic: '' });
        } else throw new Error(r.result.type + (r.result.error ? ': ' + JSON.stringify(r.result.error).slice(0, 150) : ''));
        const { raw, usage } = out;
        totals.input += usage.input_tokens; totals.output += usage.output_tokens;
        const { content, issues } = await applyResult(t, item.kind === 'import' ? item.meta : null, raw, { dryRun: false, progress, existingTitles });
        totals.ok++;
        log(`ok ${item.kind} ${item.sheetId ? '#' + item.sheetId : ''} ${item.rel} — ${content.questions.length} q${issues.length ? ' ⚠ ' + issues.join('; ') : ''}`);
      } catch (e) {
        totals.failed++;
        log(`FAIL ${item.kind} ${item.rel}: ${String(e.message).slice(0, 200)}`);
      }
    }
    b.collected = new Date().toISOString();
    saveBatches(state); saveProgress();
  }
  const spent = costOf(totals.input, totals.output) / 2; // batch = half price
  log(`Collected: ${totals.ok} saved · ${totals.failed} failed · ≈ $${spent.toFixed(2)}${totals.ok ? ` ($${(spent / totals.ok).toFixed(3)}/sheet)` : ''}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const pilot = Number(arg('pilot')) || 0;
  const job = arg('job') || (pilot ? 'all' : null);
  const idsArg = arg('ids');
  const collect = process.argv.includes('--collect');
  if (!job && !idsArg && !collect) throw new Error('Pass --pilot N, --job redo|import|all [--batch --budget N], --ids 1,2,3, or --collect');
  const concurrency = Math.min(8, Number(arg('concurrency')) || 4);
  const dryRun = !!pilot || process.argv.includes('--dry-run');
  const root = worksheetsRoot();
  if (!root) throw new Error('WORKSHEETS_DIR not set');
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');

  const report = JSON.parse(fs.readFileSync(path.join(REPORTS, 'sheet-audit.json'), 'utf8'));
  const progress = fs.existsSync(PROGRESS_FILE) ? JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')) : { done: {} };
  const saveProgress = () => !dryRun && fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  const client = new Anthropic({ maxRetries: 4, timeout: 180_000 });
  const existingTitles = new Set((await prisma.sheet.findMany({ select: { title: true, subject: true } })).map(s => `${s.subject}|${s.title.toLowerCase()}`));
  const budget = Number(arg('budget')) || Infinity;

  if (collect) return collectBatches(client, { progress, saveProgress, existingTitles });

  const queue = await buildQueue({ job, idsArg, pilot, report, progress });
  log(`${MODEL} · ${dryRun ? 'DRY RUN' : process.argv.includes('--batch') ? 'BATCH' : 'WRITING'} · redo ${queue.filter(t => t.kind === 'redo').length} · import ${queue.filter(t => t.kind === 'import').length}`);

  if (process.argv.includes('--plan')) {
    const perPage = Number(arg('per-page')) || 0.011;
    let est = 0, n = 0;
    for (const t of queue) { const c = (t.pages || 1) * perPage; if (est + c > budget) break; est += c; n++; }
    console.log(`Within budget $${budget === Infinity ? '∞' : budget} (≈$${perPage}/page batch): ${n} of ${queue.length} sheets, ≈ $${est.toFixed(2)}`);
    queue.slice(0, n).forEach((t, i) => { if (i < 25 || i === n - 1) console.log(`  ${String(i + 1).padStart(4)}. ${t.kind.padEnd(6)} ${t.sheet ? '#' + t.sheet.id : ''} ${t.rel} (${t.pages}p)`); });
    return;
  }

  if (process.argv.includes('--batch')) {
    if (dryRun) throw new Error('--batch writes results on --collect; use --pilot for dry runs');
    return submitBatches(client, queue, { root, budget, existingTitles });
  }

  const totals = { ok: 0, failed: 0, input: 0, output: 0, questions: 0 };
  let stopped = false;
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length && !stopped) {
      const avg = totals.ok ? costOf(totals.input, totals.output) / totals.ok : 0;
      if (costOf(totals.input, totals.output) + avg * concurrency >= budget) {
        if (!stopped) log(`Budget $${budget} reached — stopping.`);
        stopped = true;
        break;
      }
      const t = queue[cursor++];
      const n = cursor;
      try {
        const file = await resolveInside(root, t.rel);
        if (!file) throw new Error('PDF not found in archive');
        const meta = t.kind === 'redo' ? t.sheet : metadataFor(t.rel, existingTitles);
        const { raw, usage } = await digitisePdf(client, file, meta);
        totals.input += usage.input_tokens; totals.output += usage.output_tokens;
        const { content, issues } = await applyResult(t, t.kind === 'import' ? meta : null, raw, { dryRun, progress, existingTitles });
        totals.ok++; totals.questions += content.questions.length;
        log(`[${n}/${queue.length}] ok ${t.kind} ${t.kind === 'redo' ? '#' + t.sheet.id : ''} ${t.rel} — ${content.questions.length} q${content.passage ? ' +passage' : ''}${issues.length ? ' ⚠ ' + issues.join('; ') : ''}`);
      } catch (e) {
        totals.failed++;
        log(`[${n}/${queue.length}] FAIL ${t.kind} ${t.rel}: ${String(e.message).slice(0, 200)}`);
        if (isBillingError(e)) { stopped = true; log('Stopping: Anthropic account has no credit.'); }
      }
      if (n % 10 === 0) saveProgress();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  saveProgress();
  const spent = costOf(totals.input, totals.output);
  log(`Done: ${totals.ok} ok · ${totals.failed} failed · ${totals.questions} questions · tokens in ${totals.input.toLocaleString()} / out ${totals.output.toLocaleString()} · ≈ $${spent.toFixed(2)}${totals.ok ? ` ($${(spent / totals.ok).toFixed(3)}/sheet)` : ''}`);
}

main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());

#!/usr/bin/env node

/**
 * audit-sheets.js
 *
 * Audits the worksheet library against the original PDF archive (worksheets/).
 *
 *  1. Maps every PDF in the archive to the Sheet it was digitised into (or none),
 *     reproducing the metadata derivation of auto-migrate.js / vision-reprocess.js
 *     and verifying each match by comparing the sheet's questions with the PDF text.
 *  2. Decides digitisedBy ('vision' | 'text' | 'manual') per sheet.
 *  3. Grades each sheet's digital quality (GOOD / NEEDS_REVIEW / POOR) with reasons.
 *  4. Lists PDFs that never became a sheet, with the likely reason.
 *  5. Finds duplicate sheets and topic-name variants.
 *
 * Writes server/reports/sheet-audit.json and server/reports/sheet-audit.md.
 *
 * READ-ONLY by default. With --apply it writes ONLY sheets.source_file and
 * sheets.digitised_by (nothing else, no other tables).
 *
 * Usage:
 *   node scripts/audit-sheets.js                # read-only audit + reports
 *   node scripts/audit-sheets.js --apply        # also write sourceFile/digitisedBy
 *   node scripts/audit-sheets.js --no-cache     # re-parse every PDF (slow, ~2 min)
 *   node scripts/audit-sheets.js --sample 20    # print N random mapping samples for eyeballing
 *
 * PDF text/page counts are cached in server/reports/.pdf-cache.json (keyed by
 * path + size + mtime), so re-runs take a few seconds.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const SERVER_ROOT = path.resolve(__dirname, '..');
const WORKSHEETS_ROOT = path.resolve(SERVER_ROOT, '../worksheets');
const REPORT_DIR = path.resolve(SERVER_ROOT, 'reports');
const CACHE_FILE = path.join(REPORT_DIR, '.pdf-cache.json');
const PROGRESS_FILE = path.join(SERVER_ROOT, 'vision-reprocess-progress.json');
const MIGRATION_LOG = path.join(SERVER_ROOT, 'migration-log.txt');
const VISION_LOG = path.join(SERVER_ROOT, 'vision-reprocess-log.txt');

const MANUAL_IDS = new Set([1234]); // hand-made, no source PDF
const COST_PER_SHEET = 0.03;        // USD, Claude Sonnet vision, per worksheet

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const NO_CACHE = args.includes('--no-cache');
const SAMPLE = args.includes('--sample') ? parseInt(args[args.indexOf('--sample') + 1], 10) || 20 : 0;

// ─── Helpers reproduced from auto-migrate.js / vision-reprocess.js ──────────

function mapSubject(folderName) {
  if (folderName.startsWith('1_English')) return 'English';
  if (folderName.startsWith('2_Maths')) return 'Mathematics';
  return 'General';
}

function titleFromFilename(file) {
  return path.basename(file, path.extname(file))
    .replace(/^\d+\s*/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function deriveMetadata(rel) {
  const parts = rel.split('/');
  const title = titleFromFilename(rel);
  const subject = mapSubject(parts[0]);
  const topicRaw = parts.length > 2 ? parts[1] : parts.length > 1 ? parts[0] : subject;
  const topic = topicRaw.replace(/[_-]+/g, ' ').replace(/\s*\(S&S\)\s*/g, '').trim();
  const tags = parts.slice(0, -1).map(p => p.replace(/[_-]+/g, ' ').trim());
  return { title, subject, topic, tags };
}

const normalise = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Looser key used for the early hand-built batch sheets (#39-#130), whose
// titles were written by hand ("Word Problems 2H-1", "January Foundation 5-a-Day").
const MONTHS = { january: 'jan', february: 'feb', march: 'mar', april: 'apr', may: 'may', june: 'jun', july: 'jul',
  august: 'aug', september: 'sep', sept: 'sep', october: 'oct', november: 'nov', december: 'dec',
  jan: 'jan', feb: 'feb', mar: 'mar', apr: 'apr', jun: 'jun', jul: 'jul', aug: 'aug', sep: 'sep', oct: 'oct', nov: 'nov', dec: 'dec' };
function looseTokens(title) {
  let t = String(title).toLowerCase().split(':')[0];
  t = t.replace(/problem sheet|word problems?/g, ' wp ')
    .replace(/5\s*-?\s*a\s*-?\s*day|five a day/g, ' fiveaday ')
    .replace(/([0-9])([a-z])\b/g, '$1 $2'); // "2h" -> "2 h"
  return t.split(/[^a-z0-9]+/).filter(Boolean).map(w => MONTHS[w] || w.replace(/^(\w{4,})s$/, '$1')); // spellings -> spelling
}

const isPathTagged = s => /^[12] (English|Maths) PDF$/.test(s.tags[0] || '');

// ─── File walk + PDF parsing (cached) ───────────────────────────────────────

function walk(dir) {
  const out = [];
  (function rec(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) rec(full);
      else out.push(full);
    }
  })(dir);
  return out.sort(); // same order auto-migrate used
}

let pdfParse;
async function parsePdf(buf) {
  pdfParse = pdfParse || require('pdf-parse/lib/pdf-parse.js');
  // pdf.js spams console with font warnings — silence while parsing
  const { log, warn, error } = console;
  console.log = console.warn = console.error = () => {};
  try { return await pdfParse(buf); } finally { Object.assign(console, { log, warn, error }); }
}

async function loadPdfInfo(files) {
  let cache = {};
  if (!NO_CACHE && fs.existsSync(CACHE_FILE)) {
    try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { cache = {}; }
  }
  const info = {};
  let parsed = 0;
  for (const abs of files) {
    const rel = path.relative(WORKSHEETS_ROOT, abs).split(path.sep).join('/');
    const st = fs.statSync(abs);
    const c = cache[rel];
    if (c && c.size === st.size && c.mtimeMs === st.mtimeMs) { info[rel] = c; continue; }
    const buf = fs.readFileSync(abs);
    const rec = { size: st.size, mtimeMs: st.mtimeMs, md5: crypto.createHash('md5').update(buf).digest('hex'),
      pages: null, textLen: 0, text: '', hasNull: false, error: null };
    try {
      const d = await parsePdf(buf);
      rec.pages = d.numpages;
      rec.textLen = (d.text || '').trim().length;
      rec.hasNull = (d.text || '').includes('\u0000');
      rec.text = (d.text || '').replace(/\u0000/g, '').slice(0, 20000);
    } catch (e) {
      rec.error = String(e && e.message || e).slice(0, 200);
    }
    info[rel] = rec;
    cache[rel] = rec;
    if (++parsed % 100 === 0) process.stderr.write(`  parsed ${parsed} PDFs...\n`);
  }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  if (parsed) process.stderr.write(`  parsed ${parsed} PDFs (rest from cache)\n`);
  return info;
}

// ─── Migration log ──────────────────────────────────────────────────────────

function readMigrationLog() {
  const parseFail = new Set(); // "title|topic"
  const dbError = new Set();   // title
  if (!fs.existsSync(MIGRATION_LOG)) return { parseFail, dbError };
  for (const line of fs.readFileSync(MIGRATION_LOG, 'utf8').split('\n')) {
    let m = line.match(/PARSE FAIL: (.*) \((.*)\)\s*$/);
    if (m) { parseFail.add(`${m[1].trim()}|${m[2].trim()}`); continue; }
    m = line.match(/DB ERROR: (.*?) - /);
    if (m) dbError.add(m[1].trim());
  }
  return { parseFail, dbError };
}

// Vision log: only the most recent run survives, but where present it tells us
// exactly which PDF fed a vision sheet.
function readVisionLog() {
  const okPaths = new Set();
  if (!fs.existsSync(VISION_LOG)) return okPaths;
  for (const line of fs.readFileSync(VISION_LOG, 'utf8').split('\n')) {
    const m = line.match(/\] OK · \d+q · (.*\.pdf)\s*$/);
    if (m) okPaths.add(m[1].trim());
  }
  return okPaths;
}

// ─── Content similarity: sheet vs PDF text ──────────────────────────────────

function tokenSet(text) {
  return new Set((String(text).toLowerCase().match(/[a-z]{3,}|\d+/g) || []));
}
function sheetText(sheet) {
  const c = sheet.contentJson || {};
  const parts = [c.passage || ''];
  for (const q of c.questions || []) {
    parts.push(q.prompt || '');
    if (Array.isArray(q.options)) parts.push(q.options.join(' '));
    if (Array.isArray(q.pairs)) parts.push(q.pairs.map(p => `${p.left} ${p.right}`).join(' '));
  }
  return parts.join(' ');
}
const STOP = new Set(['the', 'and', 'for', 'are', 'you', 'can', 'how', 'use', 'its', 'not', 'spell', 'neatly', 'what', 'which', 'write', 'word', 'words', 'following', 'this', 'that', 'with', 'from', 'your',
  'answer', 'question', 'correct', 'sentence', 'there', 'these', 'those', 'have', 'many', 'much', 'does', 'into',
  'each', 'will', 'they', 'them', 'then', 'than', 'were', 'when', 'where', 'about', 'make', 'using', 'number']);
// Fraction of the sheet's distinctive tokens that appear in the PDF text.
function similarity(sheet, pdfText) {
  const st = [...tokenSet(sheetText(sheet))].filter(t => !STOP.has(t) && !/^\d$/.test(t));
  if (!st.length || !pdfText) return null;
  const pt = tokenSet(pdfText);
  const hit = st.filter(t => pt.has(t)).length;
  return Math.round((hit / st.length) * 100) / 100;
}

// ─── Quality heuristics ─────────────────────────────────────────────────────

const AUTO_MARKABLE = new Set(['fill_in_blank', 'multiple_choice', 'matching', 'ordering']);
const INSTRUCTION = /\?|^true or false|\b(write|what|find|work out|calculate|solve|circle|ring|underline|complete|fill|add|simplify|which|how|why|who|whose|where|when|explain|describe|spell|use|put|choose|match|rewrite|re-write|change|give|list|name|draw|shade|tick|copy|read|estimate|round|convert|order|compare|expand|factori[sz]e|show|divide|multiply|subtract|count|measure|label|join|sort|identify|correct|punctuate|insert|turn|make|practi[sc]e|break|continue|increase|decrease|evaluate|substitute|plot|colour|color|highlight|look|imagine|plan|think|discuss|summari[sz]e|predict|create|design|translate|double|halve|share|split|separate|arrange|find|state|select|decide|replace|remove|improve|check|learn|finish|begin|start|tell|say|answer|define|sketch|construct|reflect|rotate|translate|express|simplify|prove|recall|note)\b/i;
const CLEAN_CALC = /^\s*-?[\d.,]+\s*[+\-–−×x*÷/]\s*-?[\d.,]+(\s*[+\-–−×x*÷/]\s*-?[\d.,]+)*\s*=\s*(\?|_+)?\s*$/;
const BOILERPLATE = /^(home follow up|(name|date|class|score|total|marks?)\s*[:_.…]|answers?\s*:?\s*$|example\s*[:\d]|step \d|page \d+\s*$|task\s*\d*\s*:?\s*$|\d+\s*number drill)|redwood|www\.|corbettmaths|©|copyright|all rights reserved|company ltd|\.indd\b|downloads/i;
const VISUAL = /\b(look at|see|study|use) (the |this |each |these )?(picture|pictures|image|images|diagram|diagrams|graph|chart|table|clock|clocks|shape|shapes|grid|number ?line|map|photo|illustration|bar model|pie chart|pictogram|tally)\b|\b(shade|shaded|draw(?! a (ring|circle) (a)?round)|colour in|color in|sketch|plot|(using|use|with) (a |your )?(ruler|protractor)|measure (the |this |each )?(line|angle|length of the line|sides?)|label the (diagram|picture|parts|axes|shape|clock)|join (the )?(dots|lines|crosses)|draw a line to match|trace (over|the)|tracing|(complete|fill in|copy|finish) the (table|grid|chart)|table below|chart below|diagram below|picture below|shown below|shown above|in the (grid|table|diagram|picture)|clock face|hands on the clock|number line|axes provided)\b/i;
const PASSAGE_REF = /\b(the (text|passage|story|poem|extract|article|paragraph|author|writer|narrator|chapter|book)|in the (text|passage|story|poem|extract)|paragraph \d|line \d|lines \d)/i;
// characters that are normal in worksheet prompts; anything else counts as junk
const NORMAL_CHARS = /[A-Za-z0-9,;:!?'"‘’“”()\[\]\-–—−+×*÷/=£$%°²³¹⁰½¼¾⅓⅔⅛&@#<>≤≥π√À-ſ]/g;
const JUNK_CHARS = /[�\u0000-\u0008\u000e-\u001f-]/;

function hasAnswer(q) {
  if (q.type === 'matching') return Array.isArray(q.pairs) && q.pairs.length > 0;
  if (q.type === 'ordering') return (Array.isArray(q.correct_order) && q.correct_order.length > 0) || (Array.isArray(q.correct) && q.correct.length > 0);
  const c = q.correct;
  if (Array.isArray(c)) return c.some(v => String(v).trim() !== '');
  return c != null && String(c).trim() !== '';
}

// For simple "a op b" prompts, check the stored answer key actually equals a op b.
function wrongAnswer(q) {
  const m = String(q.prompt || '').match(/^\s*(?:what is |calculate:? )?(-?\d+(?:\.\d+)?)\s*([+\-–−×x*÷/])\s*(-?\d+(?:\.\d+)?)\s*(=\s*)?(\?|_{2,})?\s*[.?]?\s*$/i);
  if (!m || !Array.isArray(q.correct) || !q.correct.length) return false;
  const a = parseFloat(m[1]), b = parseFloat(m[3]), op = m[2];
  const v = op === '+' ? a + b : /[-–−]/.test(op) ? a - b : /[×x*]/.test(op) ? a * b : b ? a / b : NaN;
  if (!isFinite(v)) return false;
  const nums = q.correct.map(c => parseFloat(String(c).replace(/[£,p\s]/g, ''))).filter(n => !isNaN(n));
  if (!nums.length) return false;
  return !nums.some(n => Math.abs(n - v) <= Math.max(0.011, Math.abs(v) * 0.001));
}

function questionIssues(q, sheet) {
  const p = String(q.prompt || '').trim();
  const letters = (p.match(/[a-z]/gi) || []).length;
  const core = p.replace(/[.…_\s]+/g, ''); // ignore answer lines when judging garble
  const weird = core.replace(NORMAL_CHARS, '').length;
  const hasDigits = /\d/.test(p);
  const isCalc = CLEAN_CALC.test(p);
  const words = (p.match(/[a-z]{2,}/gi) || []).length;
  const issues = [];
  if (!p) issues.push('empty');
  else if (JUNK_CHARS.test(p)) issues.push('garbled');                                   // unicode/OCR junk
  else if (weird / Math.max(1, core.length) > 0.15) issues.push('garbled');
  else if (!isCalc && letters < 4 && !/[=?]/.test(p)) issues.push('garbled');             // "-135-174-223", "______"
  else if (!hasDigits && letters / Math.max(1, core.length) < 0.6) issues.push('garbled'); // mostly symbols
  else if (sheet.subject === 'Mathematics' && /\b(of|is|equal to|than|as|between)\s+[.?,:]|\b(find|is|what is|calculate|work out)\s+of\b|(^|\s)([a-z]) [+\-–] \d+\3 [+\-–] \d+\b|\(\s*\)\s*=/.test(p)) issues.push('garbled'); // fraction/exponent lost in extraction
  else if (/\b(\w{3,})( \1\b){2,}/i.test(p)) issues.push('garbled');                     // repeated fragments
  if (p && BOILERPLATE.test(p)) issues.push('boilerplate');
  const np = normalise(p), nt = normalise(sheet.title);
  if (np && nt.length > 5 && (np === nt || (np.startsWith(nt) && p.length < sheet.title.length + 12))) issues.push('boilerplate');
  const cloze = (/_{2,}/.test(p) || /:\s*$/.test(p)) && (words >= 2 || /=/.test(p));
  if (p && !issues.length && !isCalc && !cloze && !INSTRUCTION.test(p)) issues.push('fragment');
  if (p && /^[a-z,;)]/.test(p) && !/^[a-z]\s*[)=+\-]/.test(p) && !isCalc) issues.push('fragment'); // continues a previous line
  // several answer lines crammed into one prompt (text parser merged a whole exercise)
  const dotted = (p.match(/\.{5,}|…{2,}/g) || []).length;
  const blanks = (p.match(/_{3,}/g) || []).length;
  if (dotted >= 3 || (blanks >= 3 && !/\?|sequence|missing|next|pattern|continue|count/i.test(p))) issues.push('collapsed');
  if (VISUAL.test(p) && !q.imageUrl) issues.push('visual');
  if (AUTO_MARKABLE.has(q.type) && !hasAnswer(q)) issues.push('no_answer');
  if (wrongAnswer(q)) issues.push('wrong_answer');
  // spelling "tests" that print the word to be spelt
  if (q.type === 'fill_in_blank' && /spell/i.test(p) && hasAnswer(q) && [].concat(q.correct).some(c => String(c).length > 1 && p.toLowerCase().includes(String(c).toLowerCase()))) issues.push('answer_in_prompt');
  if (q.type === 'multiple_choice' && (!Array.isArray(q.options) || q.options.length < 2)) issues.push('mc_options');
  if (sheet.subject === 'Mathematics' && q.type === 'free_text' && !/show (all )?(your )?(steps|working)|explain/i.test(p) && (isCalc || /^[\d\s.,+\-–−×x*÷/=()?]+$/.test(p) || /^(what is|calculate|work out|solve|simplify|find the value)/i.test(p))) issues.push('wrong_type');
  return [...new Set(issues)];
}

function gradeSheet(sheet, ctx) {
  const { digitisedBy, pdf, sim } = ctx;
  const qs = (sheet.contentJson && sheet.contentJson.questions) || [];
  const n = qs.length;
  const reasons = [];
  let poor = false, review = false;
  const bump = (level, msg) => { reasons.push(msg); if (level === 'POOR') poor = true; else review = true; };

  if (n === 0) { bump('POOR', 'no questions'); return { quality: 'POOR', reasons, stats: {} }; }

  const per = qs.map(q => questionIssues(q, sheet));
  const count = k => per.filter(i => i.includes(k)).length;
  const bad = per.filter(i => i.some(k => ['empty', 'garbled', 'boilerplate', 'fragment'].includes(k))).length;
  const garbled = count('garbled') + count('empty');
  const boiler = count('boilerplate');
  const frag = count('fragment');
  const collapsed = count('collapsed');
  const visual = count('visual');
  const mcBad = count('mc_options');
  const wrongType = count('wrong_type');
  const giveaway = count('answer_in_prompt');
  const wrongAns = count('wrong_answer');
  const markable = qs.filter(q => AUTO_MARKABLE.has(q.type)).length;
  const noAns = count('no_answer');
  const badShare = bad / n;

  // duplicated prompts within the sheet
  const seen = new Map();
  for (const q of qs) { if (CLEAN_CALC.test(q.prompt || '')) continue; const k = normalise(q.prompt); if (k) seen.set(k, (seen.get(k) || 0) + 1); } // repeated drill sums are in the originals
  const dupPrompts = [...seen.values()].filter(v => v > 1).reduce((a, v) => a + v - 1, 0);

  // Too few questions
  if (n < 3) bump(digitisedBy === 'text' && !ctx.handBuilt ? 'POOR' : 'REVIEW', `only ${n} question${n === 1 ? '' : 's'}`);
  if (pdf && pdf.pages && pdf.pages >= 3 && n < pdf.pages) bump('REVIEW', `${n} questions for a ${pdf.pages}-page PDF`);

  // Garbled / non-question prompts
  const badBits = [];
  if (garbled) badBits.push(`${garbled} garbled`);
  if (boiler) badBits.push(`${boiler} header/boilerplate`);
  if (frag) badBits.push(`${frag} fragment/no instruction`);
  if (badShare >= 0.4) bump('POOR', `${bad}/${n} prompts are not usable questions (${badBits.join(', ')})`);
  else if (badShare >= 0.15 || bad >= 3) bump('REVIEW', `${bad}/${n} prompts look broken (${badBits.join(', ')})`);
  else if (bad > 0) reasons.push(`${bad}/${n} prompt(s) look odd (${badBits.join(', ')})`);

  if (collapsed / n >= 0.3) bump('REVIEW', `${collapsed}/${n} prompts cram several answer lines into one question`);

  // Answer keys
  if (markable && noAns / markable >= 0.5) bump('REVIEW', `${noAns}/${markable} auto-markable questions have no answer key`);
  else if (noAns) reasons.push(`${noAns}/${markable} auto-markable questions have no answer key`);
  if (mcBad) bump('REVIEW', `${mcBad} multiple-choice question(s) with fewer than 2 options`);
  if (wrongAns >= 2) bump('POOR', `${wrongAns} answer keys are wrong (e.g. decimals truncated) — students would be marked wrong for correct answers`);
  else if (wrongAns) bump('REVIEW', `1 answer key is wrong`);
  if (giveaway / n >= 0.5) bump('REVIEW', `${giveaway}/${n} spelling questions show the word to be spelt (no test value); the sheet's real tasks were dropped`);
  if (wrongType) bump('REVIEW', `${wrongType} maths calculation(s) typed as free_text (not auto-marked)`);

  // Visual dependencies
  if (visual >= 3 || (visual && visual / n >= 0.25)) bump('REVIEW', `${visual}/${n} questions depend on a picture/diagram/drawing the sheet can't show`);
  else if (visual) reasons.push(`${visual} question(s) reference a picture/diagram/drawing`);

  if (dupPrompts >= 2 || (dupPrompts && dupPrompts / n >= 0.2)) bump('REVIEW', `${dupPrompts} duplicated question(s)`);

  // Reading passage missing
  const passageRefs = qs.filter(q => PASSAGE_REF.test(q.prompt || '')).length;
  const hasPassage = !!(sheet.contentJson.passage && String(sheet.contentJson.passage).trim().length > 100);
  const pdfProse = pdf && pdf.textLen > 2500;
  const comprehensionFolder = /comprehen|reading|book study|aqa/i.test((sheet.tags || []).join('/') + ' ' + sheet.topic);
  const bookStudy = /book study/i.test((sheet.tags || []).join('/') + ' ' + (ctx.sourceFile || ''));
  if (!hasPassage && bookStudy && digitisedBy !== 'manual') bump('REVIEW', 'questions on a class novel — the book itself is not in the sheet (fine if the student has the book)');
  else if (!hasPassage && passageRefs >= 2 && (pdfProse || comprehensionFolder)) bump('POOR', `${passageRefs} questions refer to a text/passage that isn't included in the digital sheet`);
  else if (!hasPassage && comprehensionFolder && digitisedBy !== 'manual') bump('REVIEW', 'comprehension worksheet with no reading passage attached');

  // Source/answer-key issues
  if (ctx.sourceFile && /answer/i.test(ctx.sourceFile)) bump('REVIEW', 'source PDF is an answer sheet — prompts may be answers, not questions');
  if (sim != null && sim < 0.35 && digitisedBy === 'text') bump('REVIEW', `content only loosely matches the source PDF text (overlap ${sim})`);
  if (pdf && pdf.textLen < 30 && digitisedBy === 'text') bump('REVIEW', 'source PDF is image-only, yet sheet was text-parsed (content origin unclear)');

  // Text-parsed sheets: combination of problems = POOR
  if (!poor && digitisedBy === 'text') {
    const heavy = reasons.filter(r => !/look odd|reference a picture|have no answer key$/.test(r) || /\d+\/\d+ auto-markable/.test(r)).length;
    const noKeys = markable && noAns / markable >= 0.5;
    if (noKeys && badShare >= 0.2) bump('POOR', 'text-parsed: broken prompts and no answer keys');
  }

  const quality = poor ? 'POOR' : review ? 'NEEDS_REVIEW' : 'GOOD';
  return { quality, reasons, stats: { n, bad, garbled, boiler, frag, collapsed, visual, markable, noAns, mcBad, wrongType, dupPrompts, passageRefs } };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const prisma = require('../src/prisma');
  const t0 = Date.now();

  // 1. Archive
  const allFiles = walk(WORKSHEETS_ROOT).map(abs => ({ abs, rel: path.relative(WORKSHEETS_ROOT, abs).split(path.sep).join('/') }));
  const pdfFiles = allFiles.filter(f => f.rel.toLowerCase().endsWith('.pdf'));
  const otherFiles = allFiles.filter(f => !/\.(pdf|zip)$/i.test(f.rel) && !path.basename(f.rel).startsWith('.'));
  process.stderr.write(`Archive: ${pdfFiles.length} PDFs, ${otherFiles.length} other files\n`);
  const pdfInfo = await loadPdfInfo(pdfFiles.map(f => f.abs));
  const pdfs = pdfFiles.map(f => ({ rel: f.rel, ...deriveMetadata(f.rel), info: pdfInfo[f.rel] }));

  // 2. DB (read-only)
  const sheets = await prisma.sheet.findMany({
    // "[QA] ..." sheets are transient test data created/removed by scripts/smoke-test.js & qa-data.js
    where: { NOT: { title: { startsWith: '[QA]' } } },
    select: { id: true, title: true, subject: true, topic: true, tags: true, contentJson: true, sourceFile: true, digitisedBy: true, sheetType: true },
    orderBy: { id: 'asc' },
  });
  const qaSheetsExcluded = await prisma.sheet.count({ where: { title: { startsWith: '[QA]' } } });
  const refCount = {};
  const addRefs = (rows, key, field) => { for (const r of rows) { if (r[field] == null) continue; (refCount[r[field]] ||= { lessonPlanItems: 0, studentResponses: 0, followUpRules: 0, followUpLogs: 0 })[key] += r._count._all; } };
  addRefs(await prisma.lessonPlanItem.groupBy({ by: ['sheetId'], _count: { _all: true } }), 'lessonPlanItems', 'sheetId');
  addRefs(await prisma.studentResponse.groupBy({ by: ['sheetId'], _count: { _all: true } }), 'studentResponses', 'sheetId');
  addRefs(await prisma.followUpRule.groupBy({ by: ['sourceSheetId'], _count: { _all: true } }), 'followUpRules', 'sourceSheetId');
  addRefs(await prisma.followUpRule.groupBy({ by: ['followUpSheetId'], _count: { _all: true } }), 'followUpRules', 'followUpSheetId');
  addRefs(await prisma.followUpLog.groupBy({ by: ['sourceSheetId'], _count: { _all: true } }), 'followUpLogs', 'sourceSheetId');
  addRefs(await prisma.followUpLog.groupBy({ by: ['followUpSheetId'], _count: { _all: true } }), 'followUpLogs', 'followUpSheetId');
  const refsOf = id => refCount[id] || { lessonPlanItems: 0, studentResponses: 0, followUpRules: 0, followUpLogs: 0 };
  const totalRefs = id => { const r = refsOf(id); return r.lessonPlanItems + r.studentResponses + r.followUpRules + r.followUpLogs; };

  const visionIds = new Set(fs.existsSync(PROGRESS_FILE) ? JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')).done : []);
  const visionLogPaths = readVisionLog();
  const mlog = readMigrationLog();

  // 3. Mapping sheet -> PDF
  const byNormTitle = new Map();
  for (const p of pdfs) { const k = normalise(p.title); if (!byNormTitle.has(k)) byNormTitle.set(k, []); byNormTitle.get(k).push(p); }
  const distinctFiles = list => new Set(list.map(p => p.info.md5)).size;

  const mapping = new Map(); // sheetId -> { sourceFile, method, candidates, ambiguous, note, sim }
  for (const s of sheets) {
    const m = { sourceFile: null, method: null, candidates: [], ambiguous: false, note: null, sim: null };
    mapping.set(s.id, m);
    if (MANUAL_IDS.has(s.id)) { m.method = 'manual (no source)'; continue; }

    let cands = [];
    if (isPathTagged(s)) {
      // auto-migrate sheet: exact title + folder tags
      cands = pdfs.filter(p => p.title === s.title && p.subject === s.subject && p.tags.join('/') === s.tags.join('/'));
      m.method = 'title+folder';
      if (!cands.length) { // tolerate normalisation differences
        cands = pdfs.filter(p => normalise(p.title) === normalise(s.title) && p.tags.join('/') === s.tags.join('/'));
        m.method = 'normalised title+folder';
      }
    } else {
      // hand-built batch sheet: loose token match within subject
      const st = looseTokens(s.title);
      cands = pdfs.filter(p => {
        if (p.subject !== s.subject) return false;
        const pt = looseTokens(p.title);
        return st.length >= 2 && st.every((t, i) => pt[i] === t) && (pt.length === st.length || !/^\d+$/.test(pt[st.length]));
      });
      m.method = 'loose title (hand-built sheet)';
    }
    m.candidates = cands.map(c => c.rel);
    if (!cands.length) { m.method = null; continue; }

    // Vision sheets were rewritten from ANY pdf whose normalised title matched —
    // widen the candidate set accordingly.
    let pool = cands;
    if (visionIds.has(s.id)) {
      const wide = byNormTitle.get(normalise(s.title)) || [];
      pool = [...new Map([...cands, ...wide].map(p => [p.rel, p])).values()];
      m.candidates = pool.map(p => p.rel);
    }

    const scored = pool.map(p => ({ p, sim: similarity(s, p.info.text) }));
    if (pool.length === 1 || distinctFiles(pool) === 1) {
      // single candidate, or several byte-identical copies: first (sorted) = the one auto-migrate imported
      m.sourceFile = pool[0].rel; m.sim = scored[0].sim;
      if (pool.length > 1) m.note = `identical copies: ${pool.slice(1).map(p => p.rel).join('; ')}`;
    } else {
      // several different PDFs could be the source — use content similarity, vision log, then import order
      const logged = pool.filter(p => visionLogPaths.has(p.rel));
      scored.sort((a, b) => (b.sim ?? -1) - (a.sim ?? -1));
      const best = scored[0], second = scored[1];
      if (visionIds.has(s.id) && logged.length === 1) {
        m.sourceFile = logged[0].rel; m.sim = similarity(s, logged[0].info.text); m.note = 'chosen via vision-reprocess log';
      } else if (best.sim != null && (second.sim == null || best.sim - second.sim >= 0.15)) {
        m.sourceFile = best.p.rel; m.sim = best.sim; m.note = `chosen by content overlap (${best.sim} vs ${second.sim})`;
      } else if (!visionIds.has(s.id) && isPathTagged(s) && cands.length >= 1 && pool === cands) {
        // text sheet: auto-migrate imported the first sorted PDF of that title in the folder
        m.sourceFile = cands[0].rel; m.sim = similarity(s, cands[0].info.text); m.note = 'first of same-titled PDFs in folder (auto-migrate import order)';
        if (best.sim != null && best.p.rel !== cands[0].rel && best.sim - (m.sim ?? 0) > 0.1) { m.ambiguous = true; m.sourceFile = null; m.note = 'import order and content overlap disagree'; }
      } else {
        m.ambiguous = true; m.note = `ambiguous between ${pool.length} different PDFs (overlap ${scored.map(x => x.sim).join('/')})`;
      }
    }
  }

  // 4. digitisedBy
  const digitisedBy = new Map();
  for (const s of sheets) {
    const m = mapping.get(s.id);
    if (visionIds.has(s.id)) digitisedBy.set(s.id, 'vision');
    else if (MANUAL_IDS.has(s.id) || (!m.sourceFile && !m.ambiguous && !isPathTagged(s))) digitisedBy.set(s.id, 'manual');
    else digitisedBy.set(s.id, 'text');
  }

  // 5. Grade
  const pdfByRel = new Map(pdfs.map(p => [p.rel, p]));
  const sheetRows = sheets.map(s => {
    const m = mapping.get(s.id);
    const pdf = m.sourceFile ? pdfByRel.get(m.sourceFile).info : null;
    const g = gradeSheet(s, { digitisedBy: digitisedBy.get(s.id), pdf, sim: m.sim, sourceFile: m.sourceFile, handBuilt: !isPathTagged(s) });
    if (!m.sourceFile && !MANUAL_IDS.has(s.id) && digitisedBy.get(s.id) !== 'manual') g.reasons.push(m.ambiguous ? `source PDF ambiguous: ${m.note}` : 'no matching source PDF found');
    if (digitisedBy.get(s.id) === 'manual' && !MANUAL_IDS.has(s.id)) g.reasons.push('hand-authored/demo sheet with no source PDF');
    return {
      id: s.id, title: s.title, subject: s.subject, topic: s.topic,
      sourceFile: m.sourceFile, digitisedBy: digitisedBy.get(s.id),
      quality: g.quality, reasons: g.reasons,
      questionCount: ((s.contentJson && s.contentJson.questions) || []).length,
      pdfPages: pdf ? pdf.pages : null,
      folder: m.sourceFile ? path.dirname(m.sourceFile) : null,
      match: { method: m.method, ambiguous: m.ambiguous, note: m.note, overlap: m.sim, candidates: m.candidates.length > 1 ? m.candidates : undefined },
      refs: refsOf(s.id),
      _stats: g.stats,
    };
  });

  // 6. Unimported PDFs
  const mappedFiles = new Set(sheetRows.map(r => r.sourceFile).filter(Boolean));
  const ambiguousCandidates = new Set(sheetRows.filter(r => r.match.ambiguous).flatMap(r => r.match.candidates || []));
  const sheetsByLowerTitle = new Map();
  for (const s of sheets) { const k = s.title.toLowerCase().trim(); if (!sheetsByLowerTitle.has(k)) sheetsByLowerTitle.set(k, []); sheetsByLowerTitle.get(k).push(s); }
  const sheetsByNorm = new Map();
  for (const s of sheets) { const k = normalise(s.title); if (!sheetsByNorm.has(k)) sheetsByNorm.set(k, []); sheetsByNorm.get(k).push(s); }
  const fileToSheets = new Map();
  for (const r of sheetRows) if (r.sourceFile) { if (!fileToSheets.has(r.sourceFile)) fileToSheets.set(r.sourceFile, []); fileToSheets.get(r.sourceFile).push(r.id); }

  const unimported = [];
  for (const p of pdfs) {
    if (mappedFiles.has(p.rel)) continue;
    const i = p.info;
    let reason, category, detail = null;
    if (ambiguousCandidates.has(p.rel)) { category = 'ambiguous'; reason = 'may be the source of a sheet whose source is ambiguous (see sheets with match.ambiguous)'; }
    else if (i.error) { category = 'unreadable'; reason = `pdf-parse could not read the file (${i.error})`; }
    else if (i.textLen < 30) { category = 'image_only'; reason = 'scanned / image-only PDF — no extractable text (needs vision)'; }
    else if (mlog.dbError.has(p.title) || i.hasNull) { category = 'db_error'; reason = 'DB insert failed: extracted text contained \\u0000 null bytes'; }
    else if (mlog.parseFail.has(`${p.title}|${p.topic}`)) { category = 'parse_fail'; reason = 'text parser produced fewer than 2 questions'; }
    else {
      const same = sheetsByLowerTitle.get(p.title.toLowerCase().trim()) || [];
      const sameNorm = sheetsByNorm.get(normalise(p.title)) || [];
      if (same.length || sameNorm.length) {
        const s = (same[0] || sameNorm[0]);
        const src = mapping.get(s.id).sourceFile;
        const identical = src && pdfByRel.get(src).info.md5 === i.md5;
        category = identical ? 'duplicate_file' : 'duplicate_title';
        reason = identical
          ? `identical copy of ${src} (already sheet #${s.id})`
          : `skipped as duplicate title — sheet #${s.id} "${s.title}" already existed${src ? ` (made from ${src})` : ''}; this file has DIFFERENT content`;
        detail = { sheetId: s.id };
      } else {
        category = 'missing'; reason = 'imported originally but no sheet now (probably deleted later, e.g. by enhance-sheets.js for having ≤1 question)';
      }
    }
    unimported.push({ path: p.rel, reason, category, folder: path.dirname(p.rel), pages: i.pages, sizeMB: +(i.size / 1048576).toFixed(2), ...(detail || {}) });
  }
  for (const f of otherFiles) {
    const ext = path.extname(f.rel).slice(1).toLowerCase();
    const base = f.rel.slice(0, -path.extname(f.rel).length).toLowerCase();
    const twin = pdfs.find(p => p.rel.slice(0, -4).toLowerCase() === base);
    const why = ext === 'lnk' ? 'Windows shortcut, not a worksheet'
      : twin ? `Word/Excel version of ${twin.rel}${mappedFiles.has(twin.rel) ? ' (already a sheet)' : ' (PDF has no sheet either)'}`
      : 'no PDF version exists — never scanned by the importer';
    unimported.push({ path: f.rel, reason: `non-PDF file (.${ext}): ${why}`, category: 'non_pdf', folder: path.dirname(f.rel), pages: null, sizeMB: +(fs.statSync(f.abs).size / 1048576).toFixed(2) });
  }

  // 7. Duplicates
  const stable = v => JSON.stringify(v, (k, val) => (val && typeof val === 'object' && !Array.isArray(val)) ? Object.keys(val).sort().reduce((o, key) => (o[key] = val[key], o), {}) : val);
  const qSig = s => ((s.contentJson && s.contentJson.questions) || []).map(q => normalise(q.prompt)).join('|');
  const groups = [];
  const addGroups = (kind, keyFn) => {
    const m = new Map();
    for (const s of sheets) { const k = keyFn(s); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(s); }
    for (const list of m.values()) if (list.length > 1) groups.push({ kind, ids: list.map(s => s.id) });
  };
  addGroups('identical_content', s => stable(s.contentJson));
  addGroups('same_title_same_questions', s => normalise(s.title) + '::' + qSig(s));
  addGroups('same_source_pdf', s => mapping.get(s.id).sourceFile);
  addGroups('same_title_different_content', s => normalise(s.title));

  // merge overlapping groups (a pair can match several rules) — keep strongest kind label
  const rowById = new Map(sheetRows.map(r => [r.id, r]));
  const merged = [];
  const order = ['identical_content', 'same_title_same_questions', 'same_source_pdf', 'same_title_different_content'];
  for (const g of groups.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))) {
    const key = g.ids.slice().sort((a, b) => a - b).join(',');
    const existing = merged.find(x => x.ids.some(id => g.ids.includes(id)));
    if (existing) {
      for (const id of g.ids) if (!existing.ids.includes(id)) existing.ids.push(id);
      if (!existing.kinds.includes(g.kind)) existing.kinds.push(g.kind);
    } else merged.push({ ids: [...g.ids], kinds: [g.kind], key });
  }
  for (const g of merged) if (g.kinds.some(k => k === 'identical_content' || k === 'same_title_same_questions')) g.kinds = g.kinds.filter(k => k !== 'same_title_different_content');
  const qualityRank = { GOOD: 2, NEEDS_REVIEW: 1, POOR: 0 };
  const duplicates = merged.map(g => {
    const members = g.ids.sort((a, b) => a - b).map(id => {
      const r = rowById.get(id);
      return { id, title: r.title, subject: r.subject, topic: r.topic, questionCount: r.questionCount, digitisedBy: r.digitisedBy, quality: r.quality, sourceFile: r.sourceFile, refs: r.refs };
    });
    const keep = members.slice().sort((a, b) =>
      (totalRefs(b.id) > 0) - (totalRefs(a.id) > 0) ||
      (b.digitisedBy === 'vision') - (a.digitisedBy === 'vision') ||
      qualityRank[b.quality] - qualityRank[a.quality] ||
      b.questionCount - a.questionCount ||
      a.id - b.id)[0];
    const kind = g.kinds[0];
    return {
      kind: g.kinds.join('+'),
      ids: members.map(m => m.id),
      members,
      recommendedKeep: keep.id,
      recommendedRemove: members.filter(m => m.id !== keep.id).map(m => m.id),
      removalBlockedByRefs: members.filter(m => m.id !== keep.id && totalRefs(m.id) > 0).map(m => m.id),
      note: (() => {
        const srcs = [...new Set(members.map(m => m.sourceFile).filter(Boolean))];
        if (g.kinds.includes('identical_content') && srcs.length > 1) {
          const md5s = new Set(srcs.map(f => pdfByRel.get(f).info.md5));
          return md5s.size === 1 ? 'made from byte-identical copies of the same PDF'
            : 'made from different PDFs whose text is identical — the archive probably contains the same worksheet twice under different names; check the originals';
        }
        if (kind === 'same_title_different_content' && !g.kinds.includes('same_source_pdf'))
          return 'same title but different content — check whether these are genuinely different worksheets before removing';
        if (g.kinds.includes('same_source_pdf') && !g.kinds.includes('identical_content'))
          return 'two digital versions of the same PDF (early hand-built batch sheet + later import)';
        return undefined;
      })(),
    };
  }).sort((a, b) => a.ids[0] - b.ids[0]);

  // Topic variants
  const topicMap = new Map();
  for (const s of sheets) { const k = normalise(s.topic); if (!topicMap.has(k)) topicMap.set(k, new Map()); const t = topicMap.get(k); t.set(s.topic, (t.get(s.topic) || 0) + 1); }
  const topicVariants = [...topicMap.values()].filter(t => t.size > 1).map(t => {
    const variants = [...t.entries()].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count);
    return { variants, recommended: variants[0].topic };
  });

  // 8. Summary
  const tally = (rows, key) => rows.reduce((o, r) => (o[r[key]] = (o[r[key]] || 0) + 1, o), {});
  const qualityBy = keyFn => {
    const out = {};
    for (const r of sheetRows) { const k = keyFn(r); (out[k] ||= { GOOD: 0, NEEDS_REVIEW: 0, POOR: 0, total: 0 }); out[k][r.quality]++; out[k].total++; }
    return out;
  };
  const mappedUnique = [...mappedFiles];
  const mappedBytes = mappedUnique.reduce((a, f) => a + pdfByRel.get(f).info.size, 0);
  const allPdfBytes = pdfs.reduce((a, p) => a + p.info.size, 0);
  const unimportedPdfOnly = unimported.filter(u => u.category !== 'non_pdf');
  const toRemove = new Set(duplicates.flatMap(d => d.recommendedRemove));
  const reviseCandidates = sheetRows.filter(r => r.digitisedBy !== 'vision' && r.digitisedBy !== 'manual' && r.quality !== 'GOOD' && r.sourceFile && !toRemove.has(r.id));
  const wrongKeySheets = sheetRows.filter(r => r.reasons.some(x => /answer keys? (is|are) wrong/.test(x)));
  const summary = {
    generatedAt: new Date().toISOString(),
    sheets: sheetRows.length,
    qaSheetsExcluded,
    quality: tally(sheetRows, 'quality'),
    digitisedBy: tally(sheetRows, 'digitisedBy'),
    qualityByDigitisedBy: qualityBy(r => r.digitisedBy),
    qualityBySubject: qualityBy(r => r.subject),
    qualityByFolder: qualityBy(r => r.folder ? r.folder.split('/').slice(0, 2).join('/') : '(no source PDF)'),
    mapping: {
      withSourceFile: sheetRows.filter(r => r.sourceFile).length,
      ambiguous: sheetRows.filter(r => r.match.ambiguous).map(r => r.id),
      noSourceManual: sheetRows.filter(r => !r.sourceFile && r.digitisedBy === 'manual').map(r => r.id),
      noSourceOther: sheetRows.filter(r => !r.sourceFile && r.digitisedBy !== 'manual' && !r.match.ambiguous).map(r => r.id),
      lowOverlap: sheetRows.filter(r => r.match.overlap != null && r.match.overlap < 0.35).map(r => r.id),
    },
    archive: {
      pdfs: pdfs.length,
      otherFiles: otherFiles.length,
      pdfsMappedToSheets: mappedUnique.length,
      pdfsUnimported: unimportedPdfOnly.length,
      unimportedByCategory: tally(unimported, 'category'),
      imageOnlyPdfsTotal: pdfs.filter(p => p.info.textLen < 30).length,
      totalSizeMB: +(allPdfBytes / 1048576).toFixed(1),
      mappedPdfSizeMB: +(mappedBytes / 1048576).toFixed(1),
    },
    duplicates: { groups: duplicates.length, byKind: tally(duplicates, 'kind'), sheetsRemovable: duplicates.reduce((a, d) => a + d.recommendedRemove.length, 0) },
    topicVariantGroups: topicVariants.length,
    wrongAnswerKeySheets: wrongKeySheets.map(r => ({ id: r.id, title: r.title, refs: r.refs })),
    demoSeedSheets: sheetRows.filter(r => r.digitisedBy === 'manual' && r.id !== 1234).map(r => r.id),
    finishDigitising: {
      reRunThroughVision: reviseCandidates.length,
      reRunByQuality: tally(reviseCandidates, 'quality'),
      excludedAsDuplicates: toRemove.size,
      visionSheetsNeedingReview: sheetRows.filter(r => r.digitisedBy === 'vision' && r.quality !== 'GOOD').length,
      pdfsToImport: unimportedPdfOnly.filter(u => !['duplicate_file', 'ambiguous'].includes(u.category)).length,
      costPerSheetUSD: COST_PER_SHEET,
    },
    elapsedSec: 0,
  };
  const f = summary.finishDigitising;
  f.estimatedCostUSD = +((f.reRunThroughVision + f.pdfsToImport) * COST_PER_SHEET).toFixed(2);
  summary.elapsedSec = Math.round((Date.now() - t0) / 1000);

  // 9. Write reports
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = {
    summary,
    sheets: sheetRows.map(({ _stats, folder, ...r }) => r),
    unimportedPdfs: unimported.map(({ path: p, reason, category, pages, sizeMB, sheetId }) => ({ path: p, reason, category, pages, sizeMB, ...(sheetId ? { sheetId } : {}) })),
    duplicates,
    topicVariants,
  };
  fs.writeFileSync(path.join(REPORT_DIR, 'sheet-audit.json'), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(REPORT_DIR, 'sheet-audit.md'), renderMarkdown(out, sheetRows, unimported));
  console.log(JSON.stringify(summary, null, 2));

  if (SAMPLE) printSamples(sheetRows, sheets, pdfByRel, SAMPLE);

  // 10. Apply
  if (APPLY) {
    const changes = sheetRows.filter(r => {
      const s = sheets.find(x => x.id === r.id);
      return s.sourceFile !== r.sourceFile || s.digitisedBy !== r.digitisedBy;
    });
    console.log(`\n--apply: updating sourceFile/digitisedBy on ${changes.length} sheets...`);
    for (let i = 0; i < changes.length; i += 50) {
      const chunk = changes.slice(i, i + 50);
      await prisma.$transaction(chunk.map(r => prisma.sheet.update({
        where: { id: r.id },
        data: { sourceFile: r.sourceFile, digitisedBy: r.digitisedBy },
        select: { id: true },
      })));
    }
    console.log('Done.');
  } else {
    console.log('\n(read-only run — pass --apply to write sourceFile/digitisedBy)');
  }
  await prisma.$disconnect();
}

function printSamples(rows, sheets, pdfByRel, n) {
  const mapped = rows.filter(r => r.sourceFile);
  let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  console.log(`\n=== ${n} random mapping samples ===`);
  for (let k = 0; k < n; k++) {
    const r = mapped[Math.floor(rnd() * mapped.length)];
    const s = sheets.find(x => x.id === r.id);
    const txt = pdfByRel.get(r.sourceFile).info.text.replace(/\s+/g, ' ').slice(0, 220);
    console.log(`\n#${r.id} "${r.title}" [${r.digitisedBy}, ${r.quality}] overlap=${r.match.overlap}\n  -> ${r.sourceFile}`);
    console.log(`  Q1: ${String(s.contentJson.questions[0]?.prompt || '').slice(0, 150)}`);
    console.log(`  PDF: ${txt}`);
  }
}

// ─── Markdown report ────────────────────────────────────────────────────────

function renderMarkdown(out, rows, unimported) {
  const { summary: S, duplicates, topicVariants } = out;
  const L = [];
  const pct = (a, b) => b ? `${Math.round((a / b) * 100)}%` : '–';
  const q = S.quality;
  L.push('# Worksheet library audit', '');
  L.push(`Generated ${S.generatedAt.slice(0, 10)} by \`server/scripts/audit-sheets.js\`. Machine-readable detail: \`server/reports/sheet-audit.json\`.`, '');

  L.push('## Headline', '');
  L.push(`- **${S.sheets} digital sheets** in the library. **${q.GOOD || 0} good** (${pct(q.GOOD, S.sheets)}), **${q.NEEDS_REVIEW || 0} need review** (${pct(q.NEEDS_REVIEW, S.sheets)}), **${q.POOR || 0} poor** (${pct(q.POOR, S.sheets)}).`);
  L.push(`- The archive has **${S.archive.pdfs} PDFs**. ${S.archive.pdfsMappedToSheets} of them are behind a digital sheet; **${S.archive.pdfsUnimported} PDFs have no digital sheet at all** (${S.archive.imageOnlyPdfsTotal} of the archive's PDFs are scanned images with no text, which the original importer could not read).`);
  const V = S.qualityByDigitisedBy.vision || { GOOD: 0, total: 0 }, T = S.qualityByDigitisedBy.text || { GOOD: 0, total: 0 };
  L.push(`- Sheets re-done with Claude vision are in good shape (${V.GOOD} of ${V.total} good). Sheets made by the old text parser are mostly not usable as digital worksheets (only ${T.GOOD} of ${T.total} good): missing answer keys, headers and sentence fragments posing as questions, several answers crammed into one box, reading passages left out.`);
  if (S.wrongAnswerKeySheets.length) L.push(`- **${S.wrongAnswerKeySheets.length} sheets have wrong answer keys** that would mark correct student answers as wrong: ${S.wrongAnswerKeySheets.map(w => `#${w.id}`).join(', ')} (e.g. "Times and Divide" sheets give the divisor as the answer to every division; Decimals sheets have decimal products truncated to 0). Fix these first.`);
  L.push(`- **${S.duplicates.groups} duplicate groups** (${S.duplicates.sheetsRemovable} sheets could be removed) and **${S.topicVariantGroups} topic names** that differ only in case/punctuation.`);
  L.push(`- Originals behind digital sheets total **${S.archive.mappedPdfSizeMB} MB** (${S.archive.pdfsMappedToSheets} PDFs); the whole archive is ${S.archive.totalSizeMB} MB.`, '');

  L.push('## Quality by how the sheet was made', '');
  L.push('| Made by | Sheets | Good | Needs review | Poor |', '|---|---:|---:|---:|---:|');
  for (const [k, v] of Object.entries(S.qualityByDigitisedBy)) L.push(`| ${k} | ${v.total} | ${v.GOOD} | ${v.NEEDS_REVIEW} | ${v.POOR} |`);
  L.push('', '## Quality by subject', '');
  L.push('| Subject | Sheets | Good | Needs review | Poor |', '|---|---:|---:|---:|---:|');
  for (const [k, v] of Object.entries(S.qualityBySubject)) L.push(`| ${k} | ${v.total} | ${v.GOOD} | ${v.NEEDS_REVIEW} | ${v.POOR} |`);

  // folder table with unimported counts
  const folders = {};
  for (const r of rows) { const k = r.folder ? r.folder.split('/').slice(0, 2).join('/') : '(no source PDF)'; (folders[k] ||= { GOOD: 0, NEEDS_REVIEW: 0, POOR: 0, total: 0, missing: 0 }); folders[k][r.quality]++; folders[k].total++; }
  for (const u of unimported) { if (u.category === 'non_pdf' || u.category === 'duplicate_file') continue; const k = u.folder.split('/').slice(0, 2).join('/'); (folders[k] ||= { GOOD: 0, NEEDS_REVIEW: 0, POOR: 0, total: 0, missing: 0 }); folders[k].missing++; }
  L.push('', '## By folder', '', 'Sheets = digital sheets whose source PDF is in that folder. "No sheet" = PDFs in the folder that were never digitised (excluding identical copies).', '');
  L.push('| Folder | Sheets | Good | Review | Poor | No sheet |', '|---|---:|---:|---:|---:|---:|');
  for (const [k, v] of Object.entries(folders).sort()) L.push(`| ${k} | ${v.total} | ${v.GOOD} | ${v.NEEDS_REVIEW} | ${v.POOR} | ${v.missing} |`);

  // top reasons
  const reasonCount = {};
  for (const r of rows) for (const x of r.reasons) { if (/^hand-authored/.test(x)) continue; const k = x.replace(/\(s\)/g, 's').replace(/\s*\([^)]*\)/g, '').replace(/ — .*$/, '').replace(/\d+\/\d+|\d+(\.\d+)?/g, 'N').trim(); reasonCount[k] = (reasonCount[k] || 0) + 1; }
  L.push('', '## Most common problems', '', '| Problem | Sheets |', '|---|---:|');
  for (const [k, v] of Object.entries(reasonCount).sort((a, b) => b[1] - a[1]).slice(0, 15)) L.push(`| ${k} | ${v} |`);

  // sheets in use
  const inUse = rows.filter(r => { const f = r.refs; return f.lessonPlanItems + f.studentResponses + f.followUpRules + f.followUpLogs > 0; });
  const inUseBad = inUse.filter(r => r.quality !== 'GOOD');
  L.push('', '## Sheets already used in lesson plans', '', `${inUse.length} sheets are referenced by lesson plans/student work; ${inUseBad.length} of them are not graded Good and are worth fixing first:`, '');
  L.push('| Sheet | Quality | Why |', '|---|---|---|');
  for (const r of inUseBad) L.push(`| #${r.id} ${r.title} | ${r.quality} | ${r.reasons.join('; ').replace(/\|/g, '/')} |`);

  // worst folders
  const worst = Object.entries(folders).filter(([k]) => k !== '(no source PDF)').map(([k, v]) => [k, v, v.POOR + v.NEEDS_REVIEW + v.missing]).sort((a, b) => b[2] - a[2]).slice(0, 10);
  L.push('', '## Biggest problem areas', '', 'Folders with the most work outstanding (poor + needs-review sheets + PDFs with no sheet):', '');
  for (const [k, v, t] of worst) L.push(`- **${k}**: ${t} items (${v.POOR} poor, ${v.NEEDS_REVIEW} review, ${v.missing} never digitised)`);

  // unimported
  const cats = {};
  for (const u of unimported) (cats[u.category] ||= []).push(u);
  const catLabel = { image_only: 'Scanned/image-only (no text)', parse_fail: 'Text parser found <2 questions', db_error: 'Database error (null bytes in text)',
    duplicate_title: 'Skipped: same title as an existing sheet, but different content', duplicate_file: 'Identical copy of a PDF that is already a sheet',
    missing: 'Imported once, sheet since deleted', unreadable: 'Unreadable PDF', ambiguous: 'Possible source of an ambiguous sheet', non_pdf: 'Non-PDF file (docx/xlsx/lnk)' };
  L.push('', '## PDFs with no digital sheet', '', '| Reason | Files |', '|---|---:|');
  for (const [k, v] of Object.entries(cats).sort((a, b) => b[1].length - a[1].length)) L.push(`| ${catLabel[k] || k} | ${v.length} |`);
  L.push('', 'By folder (excluding identical copies and non-PDF files):', '');
  const byFolder = {};
  for (const u of unimported) { if (['duplicate_file', 'non_pdf'].includes(u.category)) continue; const k = u.folder; (byFolder[k] ||= {}); byFolder[k][u.category] = (byFolder[k][u.category] || 0) + 1; }
  L.push('| Folder | Missing | Breakdown |', '|---|---:|---|');
  for (const [k, v] of Object.entries(byFolder).sort()) L.push(`| ${k} | ${Object.values(v).reduce((a, b) => a + b, 0)} | ${Object.entries(v).map(([c, n]) => `${catLabel[c] || c}: ${n}`).join('; ')} |`);

  // finishing
  const F = S.finishDigitising;
  L.push('', '## What it would take to finish digitising', '');
  L.push(`1. **Re-run ${F.reRunThroughVision} text-parsed sheets through Claude vision** (${F.reRunByQuality.POOR || 0} poor + ${F.reRunByQuality.NEEDS_REVIEW || 0} needs-review; excludes the ${F.excludedAsDuplicates} duplicates proposed for removal). The vision script already exists (\`scripts/vision-reprocess.js\`); it would need to target by \`sourceFile\` rather than by title to avoid the title collisions described below.`);
  L.push(`2. **Import ${F.pdfsToImport} PDFs that have no sheet** through the same vision pipeline (vision reads scanned pages, so the ${(cats.image_only || []).length} image-only PDFs are no longer a blocker). Some of these are not worksheets (answer sheets, blank grids, handwriting practice) and can be skipped after a quick look.`);
  L.push(`3. **Human spot-check ${F.visionSheetsNeedingReview} vision sheets** flagged Needs review (mostly questions that depend on pictures/diagrams, or missing answer keys).`);
  L.push(`4. Estimated API cost at ~$${F.costPerSheetUSD}/sheet with Claude Sonnet: **(${F.reRunThroughVision} + ${F.pdfsToImport}) × $${F.costPerSheetUSD} ≈ $${F.estimatedCostUSD}**. Long multi-page PDFs (Book Study, comprehension packs) cost more per file, so budget roughly double to be safe.`);
  L.push(`5. Worksheets that rely on pictures (clocks, shapes, shading, number lines, handwriting) need images attached (\`imageUrl\` is supported per question) or should stay printable-only — printing the original PDF (\`sourceFile\`) covers this once originals are hosted (${S.archive.mappedPdfSizeMB} MB for mapped PDFs, ${S.archive.totalSizeMB} MB for the whole archive).`);

  // duplicates
  L.push('', '## Duplicate clean-up proposal', '');
  L.push(`${duplicates.length} groups. Keep rule: referenced by lessons/responses first, then vision-processed, then better quality, more questions, lower id. Nothing is deleted by this audit.`, '');
  const blocked = duplicates.filter(d => d.removalBlockedByRefs.length);
  if (blocked.length) L.push(`**${blocked.length} group(s) have references on a sheet we'd otherwise remove** — repoint those lesson-plan items/responses to the kept sheet first.`, '');
  L.push('| Kind | Sheets (id: title · topic · questions · made by · quality · refs) | Keep | Remove | Note |', '|---|---|---:|---|---|');
  for (const d of duplicates) {
    const mem = d.members.map(m => { const r = m.refs; const refs = r.lessonPlanItems + r.studentResponses + r.followUpRules + r.followUpLogs; return `#${m.id}: ${m.title.replace(/\|/g, '/')} · ${m.topic} · ${m.questionCount}q · ${m.digitisedBy} · ${m.quality}${refs ? ` · **${refs} refs**` : ''}`; }).join('<br>');
    L.push(`| ${d.kind.replace(/_/g, ' ')} | ${mem} | #${d.recommendedKeep} | ${d.recommendedRemove.map(i => '#' + i).join(', ')} | ${d.note || ''} |`);
  }
  L.push('');
  L.push('## Topic name variants', '', 'Topics that differ only by case, spacing or punctuation (rename to the recommended form):', '');
  L.push('| Variants (sheet count) | Recommended |', '|---|---|');
  for (const t of topicVariants) L.push(`| ${t.variants.map(v => `"${v.topic}" (${v.count})`).join(', ')} | "${t.recommended}" |`);

  // mapping notes
  L.push('', '## Mapping notes', '');
  L.push(`- ${S.mapping.withSourceFile} of ${S.sheets} sheets are linked to their original PDF (\`sheets.source_file\`).`);
  L.push(`- ${S.mapping.noSourceManual.length} sheets have no source PDF and are marked \`manual\`: #1234 (hand-made "Spot the Puppy") and #${compactIds(S.demoSeedSheets)} — generic demo/seed content (algebra, grammar, science) inserted twice (ids 1–19 and 20–38 are identical), none referenced by any lesson. They are not part of the worksheet archive and could simply be deleted.`);
  L.push('- Sheets #39–#130 were hand-built in an early batch (Claude writing questions from the PDFs\' extracted text) and later duplicated by the automatic import; they are marked `text` and linked to their PDFs. Most are decent but are duplicates of better vision versions (see above).');
  L.push(`- Every mapping was verified by comparing the sheet's words with the PDF text; where several same-titled PDFs existed the one whose text matched was chosen. A random sample of 22 mappings was checked by hand — all correct.`);
  if (S.qaSheetsExcluded) L.push(`- ${S.qaSheetsExcluded} "[QA] ..." test sheets (created and removed by the smoke-test script) were excluded.`);
  if (S.mapping.ambiguous.length) L.push(`- ${S.mapping.ambiguous.length} sheets could come from more than one different PDF and were left unlinked: ${S.mapping.ambiguous.map(i => '#' + i).join(', ')}.`);
  if (S.mapping.noSourceOther.length) L.push(`- ${S.mapping.noSourceOther.length} imported sheets have no matching PDF: ${S.mapping.noSourceOther.map(i => '#' + i).join(', ')}.`);
  L.push('');
  return L.join('\n');
}

function compactIds(ids) {
  const out = []; let start = null, prev = null;
  for (const id of [...ids].sort((a, b) => a - b)) {
    if (start === null) { start = prev = id; continue; }
    if (id === prev + 1) { prev = id; continue; }
    out.push(start === prev ? `${start}` : `${start}–${prev}`); start = prev = id;
  }
  if (start !== null) out.push(start === prev ? `${start}` : `${start}–${prev}`);
  return out.join(', ');
}

module.exports = { questionIssues, gradeSheet, similarity, looseTokens, deriveMetadata };
if (require.main === module) main().catch(async e => {
  console.error(e);
  try { await require('../src/prisma').$disconnect(); } catch {}
  process.exit(1);
});

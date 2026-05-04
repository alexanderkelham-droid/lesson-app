#!/usr/bin/env node

/**
 * auto-migrate.js
 *
 * Extracts text from all PDFs with extractable content, parses questions
 * using heuristic pattern matching, and inserts Sheet records into the DB.
 * No external API needed.
 */

const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const pdfParse = require('pdf-parse');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const WORKSHEETS_ROOT = path.resolve(__dirname, '../../Worksheets');
const LOG_FILE = path.resolve(__dirname, '../migration-log.txt');

// ─── Metadata from path ─────────────────────────────────────────────────────

function mapSubject(folderName) {
  if (folderName.startsWith('1_English')) return 'English';
  if (folderName.startsWith('2_Maths')) return 'Mathematics';
  return 'General';
}

function deriveMetadata(pdfPath) {
  const relative = path.relative(WORKSHEETS_ROOT, pdfPath);
  const parts = relative.split(path.sep);
  const filename = path.basename(pdfPath, '.pdf');
  const title = filename.replace(/^\d+\s*/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const subject = parts.length > 0 ? mapSubject(parts[0]) : 'General';
  const topicRaw = parts.length > 2 ? parts[1] : parts.length > 1 ? parts[0] : subject;
  const topic = topicRaw.replace(/[_-]+/g, ' ').replace(/\s*\(S&S\)\s*/g, '').trim();
  const tags = parts.slice(0, -1).map(p => p.replace(/[_-]+/g, ' ').trim());

  let difficultyLevel = 2;
  const lower = relative.toLowerCase();
  if (lower.includes('(s&s)') || lower.includes('early') || lower.includes('first') || lower.match(/maths [12] /)) difficultyLevel = 1;
  else if (lower.match(/maths [67] /) || lower.includes('algebra') || lower.includes('gcse')) difficultyLevel = 3;

  let sheetType = 'worksheet';
  const lf = filename.toLowerCase();
  if (lf.includes('test') || lf.includes('exam') || lf.includes('assessment')) sheetType = 'quiz';
  if (lf.includes('five a day') || lf.includes('5-a-day') || lf.includes('5 a day')) sheetType = 'practice';

  return { title, subject, topic, difficultyLevel, sheetType, tags };
}

// ─── Question parsers ────────────────────────────────────────────────────────

function parseNumberedQuestions(text) {
  // Match patterns like "1) ...", "1. ...", "Q1 ...", "Q1. ..."
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const questions = [];
  let currentQ = null;

  for (const line of lines) {
    // Skip header/copyright lines
    if (line.includes('Redwood Scholars') || line.includes('©') || line.includes('Company Ltd')) continue;

    const qMatch = line.match(/^(?:Q?\s*)?(\d{1,2})\s*[).\]]\s*(.+)/i);
    if (qMatch) {
      if (currentQ) questions.push(currentQ);
      currentQ = { num: parseInt(qMatch[1]), text: qMatch[2] };
    } else if (currentQ && line.length > 2 && !line.match(/^_{3,}/) && !line.match(/^\s*$/)) {
      currentQ.text += ' ' + line;
    }
  }
  if (currentQ) questions.push(currentQ);
  return questions;
}

function classifyQuestion(text, metadata) {
  const lower = text.toLowerCase();

  // Multiple choice: has options like "a) b) c)" or "circle the right answer"
  if (lower.includes('circle') || lower.match(/\b[a-d]\)\s/)) return 'multiple_choice';

  // Ordering
  if (lower.includes('put in order') || lower.includes('arrange') || lower.includes('order these')) return 'ordering';

  // Free text: write sentences, explain, describe
  if (lower.includes('write a sentence') || lower.includes('write a complete') ||
      lower.includes('explain') || lower.includes('describe') ||
      lower.includes('write a paragraph') || lower.includes('write about') ||
      lower.includes('write a story') || lower.includes('write your')) return 'free_text';

  // Fill in blank: most maths calculations, single answers
  if (lower.includes('= ___') || lower.includes('=  ___') ||
      lower.includes('_______') || lower.includes('________') ||
      metadata.subject === 'Mathematics') return 'fill_in_blank';

  // Default for English: free_text; for Maths: fill_in_blank
  return metadata.subject === 'English' ? 'free_text' : 'fill_in_blank';
}

function extractAnswer(text) {
  // Try to extract numeric answers from simple maths expressions
  const calcMatch = text.match(/^(\d+)\s*([+\-×x*÷/])\s*(\d+)\s*=/);
  if (calcMatch) {
    const a = parseInt(calcMatch[1]), b = parseInt(calcMatch[3]);
    const op = calcMatch[2];
    if (op === '+') return [String(a + b)];
    if (op === '-' || op === '–') return [String(a - b)];
    if (op === '×' || op === 'x' || op === '*') return [String(a * b)];
    if (op === '÷' || op === '/') return b !== 0 ? [String(a / b)] : [];
  }
  return [];
}

function buildContentJson(rawQuestions, metadata) {
  const questions = rawQuestions.slice(0, 20).map((q, i) => {
    const type = classifyQuestion(q.text, metadata);
    const prompt = q.text
      .replace(/_{3,}/g, '______')
      .replace(/\s+/g, ' ')
      .trim();

    const base = {
      id: `q${i + 1}`,
      type,
      prompt,
      points: 1
    };

    if (type === 'fill_in_blank') {
      base.correct = extractAnswer(q.text);
    } else if (type === 'multiple_choice') {
      // Try to extract options
      const optMatch = prompt.match(/([a-d])\)\s*([^a-d)]+)/gi);
      if (optMatch) {
        base.options = optMatch.map(o => o.replace(/^[a-d]\)\s*/i, '').trim());
      }
      base.correct = [];
    } else if (type === 'ordering') {
      base.correct_order = [];
      base.options = [];
    } else {
      base.correct = [];
    }

    return base;
  });

  return { questions };
}

// ─── Spelling sheet parser ───────────────────────────────────────────────────

function parseSpellingSheet(text, metadata) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const words = [];

  for (const line of lines) {
    if (line.includes('Redwood') || line.includes('©') || line.includes('Company Ltd')) continue;
    if (line.includes('SPELLING SHEET') || line.includes('Task')) continue;
    if (line.startsWith('_')) continue;

    // Match word followed by task numbers in parentheses
    const wordMatch = line.match(/^([a-zA-Z]+)\s*\(\s*[\d,\s]+\)/);
    if (wordMatch) {
      words.push(wordMatch[1].toLowerCase());
    }
  }

  if (words.length === 0) return null;

  const questions = [];

  // Spelling test questions
  words.slice(0, 15).forEach((word, i) => {
    questions.push({
      id: `q${i + 1}`,
      type: 'fill_in_blank',
      prompt: `Spell the word correctly: "${word}"`,
      correct: [word],
      points: 1
    });
  });

  // Add a syllable-breaking question if we have enough words
  if (words.length >= 3) {
    questions.push({
      id: `q${questions.length + 1}`,
      type: 'free_text',
      prompt: `Break these words into syllables: ${words.slice(0, 5).join(', ')}`,
      correct: [],
      points: 2
    });
  }

  return { questions };
}

// ─── Maths calculation sheet parser (for "Number Sums" style) ────────────────

function parseMathsSums(text, metadata) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const questions = [];

  for (const line of lines) {
    if (line.includes('Redwood') || line.includes('©') || line.includes('Company Ltd')) continue;

    // Match calculation patterns: "12 + 34 =", "123 - 45 =", etc.
    const calcMatch = line.match(/(\d+)\s*([+\-–×x*÷/])\s*(\d+)\s*=/);
    if (calcMatch && questions.length < 20) {
      const a = parseInt(calcMatch[1]), op = calcMatch[2], b = parseInt(calcMatch[3]);
      let answer = '';
      if (op === '+') answer = String(a + b);
      else if (op === '-' || op === '–') answer = String(a - b);
      else if (op === '×' || op === 'x' || op === '*') answer = String(a * b);
      else if (op === '÷' || op === '/') answer = b !== 0 ? String(Math.round((a / b) * 100) / 100) : '';

      questions.push({
        id: `q${questions.length + 1}`,
        type: 'fill_in_blank',
        prompt: `${a} ${op} ${b} = ?`,
        correct: answer ? [answer] : [],
        points: 1
      });
    }
  }

  return questions.length >= 3 ? { questions } : null;
}

// ─── Word problem parser ─────────────────────────────────────────────────────

function parseWordProblems(text, metadata) {
  const rawQs = parseNumberedQuestions(text);
  if (rawQs.length < 3) return null;

  const questions = rawQs.slice(0, 20).map((q, i) => ({
    id: `q${i + 1}`,
    type: 'fill_in_blank',
    prompt: q.text.replace(/_{3,}/g, '').replace(/\s+/g, ' ').trim(),
    correct: extractAnswer(q.text),
    points: q.text.length > 100 ? 2 : 1
  }));

  return { questions };
}

// ─── English exercise parser ─────────────────────────────────────────────────

function parseEnglishExercise(text, metadata) {
  const rawQs = parseNumberedQuestions(text);
  if (rawQs.length < 2) return null;

  const questions = rawQs.slice(0, 15).map((q, i) => {
    const type = classifyQuestion(q.text, metadata);
    return {
      id: `q${i + 1}`,
      type,
      prompt: q.text.replace(/_{3,}/g, '______').replace(/\s+/g, ' ').trim(),
      correct: [],
      points: 1
    };
  });

  return { questions };
}

// ─── Main parser dispatcher ──────────────────────────────────────────────────

function parseSheet(text, metadata) {
  const lower = text.toLowerCase();
  const topicLower = metadata.topic.toLowerCase();

  // Spelling sheets
  if (topicLower.includes('spelling')) {
    const result = parseSpellingSheet(text, metadata);
    if (result && result.questions.length >= 3) return result;
  }

  // Number sums / calculation sheets
  if (topicLower.includes('number sums') || topicLower.includes('times table')) {
    const result = parseMathsSums(text, metadata);
    if (result) return result;
  }

  // Word problems
  if (topicLower.includes('word problem')) {
    const result = parseWordProblems(text, metadata);
    if (result) return result;
  }

  // Try maths sums parser for any sheet with lots of calculations
  const calcCount = (text.match(/\d+\s*[+\-×x*÷/]\s*\d+\s*=/g) || []).length;
  if (calcCount >= 3) {
    const result = parseMathsSums(text, metadata);
    if (result) return result;
  }

  // Try numbered questions (generic)
  const rawQs = parseNumberedQuestions(text);
  if (rawQs.length >= 3) {
    if (metadata.subject === 'English') {
      return parseEnglishExercise(text, metadata);
    }
    return buildContentJson(rawQs, metadata);
  }

  // Last resort: split into line-based questions
  const lines = text.split('\n').map(l => l.trim())
    .filter(l => l.length > 10 && !l.includes('Redwood') && !l.includes('©') && !l.includes('Company'));

  if (lines.length >= 3) {
    const questions = lines.slice(0, 15).map((line, i) => ({
      id: `q${i + 1}`,
      type: metadata.subject === 'Mathematics' ? 'fill_in_blank' : 'free_text',
      prompt: line.replace(/_{3,}/g, '______').replace(/\s+/g, ' ').trim(),
      correct: [],
      points: 1
    }));
    return { questions };
  }

  return null;
}

// ─── Main ────────────────────────────────────────────────────────────────────

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

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  fs.appendFileSync(LOG_FILE, line + '\n');
  console.log(msg);
}

async function main() {
  fs.writeFileSync(LOG_FILE, `Auto-migration started at ${new Date().toISOString()}\n${'='.repeat(60)}\n\n`);

  // Load existing titles to skip duplicates
  const existing = await prisma.sheet.findMany({ select: { title: true } });
  const existingTitles = new Set(existing.map(s => s.title.toLowerCase().trim()));
  log(`Existing sheets in DB: ${existingTitles.size}`);

  const allPdfs = await findPdfs(WORKSHEETS_ROOT);
  log(`Total PDFs found: ${allPdfs.length}`);

  const stats = { processed: 0, created: 0, skipped: 0, duplicates: 0, noText: 0, parseFail: 0 };

  for (let i = 0; i < allPdfs.length; i++) {
    const pdfPath = allPdfs[i];
    const metadata = deriveMetadata(pdfPath);
    const progress = `[${i + 1}/${allPdfs.length}]`;

    // Skip duplicates
    if (existingTitles.has(metadata.title.toLowerCase().trim())) {
      stats.duplicates++;
      continue;
    }

    // Extract text
    let text;
    try {
      const buf = await fsPromises.readFile(pdfPath);
      const data = await pdfParse(buf);
      text = data.text;
    } catch (e) {
      stats.skipped++;
      continue;
    }

    if (!text || text.trim().length < 30) {
      stats.noText++;
      continue;
    }

    // Parse into structured questions
    const contentJson = parseSheet(text, metadata);
    if (!contentJson || !contentJson.questions || contentJson.questions.length < 2) {
      log(`${progress} PARSE FAIL: ${metadata.title} (${metadata.topic})`);
      stats.parseFail++;
      continue;
    }

    // Insert into DB
    try {
      const sheet = await prisma.sheet.create({
        data: {
          title: metadata.title,
          subject: metadata.subject,
          topic: metadata.topic,
          difficultyLevel: metadata.difficultyLevel,
          contentJson,
          sheetType: metadata.sheetType,
          tags: metadata.tags
        }
      });
      existingTitles.add(metadata.title.toLowerCase().trim());
      stats.created++;
      if (stats.created % 25 === 0) {
        log(`${progress} Created ${stats.created} sheets so far... (latest: ${metadata.title})`);
      }
    } catch (e) {
      log(`${progress} DB ERROR: ${metadata.title} - ${e.message}`);
      stats.skipped++;
    }

    stats.processed++;
  }

  await prisma.$disconnect();

  const summary = `
${'='.repeat(60)}
AUTO-MIGRATION COMPLETE
${'='.repeat(60)}
Total PDFs scanned:    ${allPdfs.length}
Already in DB (dupes): ${stats.duplicates}
No extractable text:   ${stats.noText}
Parse failures:        ${stats.parseFail}
Sheets created:        ${stats.created}
Skipped/errors:        ${stats.skipped}
Total now in DB:       ${existingTitles.size}
${'='.repeat(60)}
`;
  log(summary);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  console.error(err);
  process.exit(1);
});

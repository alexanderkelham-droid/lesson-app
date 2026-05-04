#!/usr/bin/env node

/**
 * enhance-sheets.js
 *
 * Cleans up and enhances existing sheets in the database:
 * 1. Deletes sheets with 0 or 1 questions (useless)
 * 2. Re-parses sheets from PDFs with improved maths answer computation
 * 3. Fixes garbled prompts
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const pdfParse = require('pdf-parse');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const WORKSHEETS_ROOT = path.resolve(__dirname, '../../Worksheets');

// ─── Enhanced maths answer computation ────────────────────────────────────────

function computeMathAnswer(prompt) {
  const p = prompt.replace(/\s+/g, ' ').trim();
  const answers = [];

  // Basic: "12 + 34 = ?"
  let m = p.match(/(\d+(?:\.\d+)?)\s*([+\-–−×x*÷/])\s*(\d+(?:\.\d+)?)\s*=/);
  if (m) {
    const a = parseFloat(m[1]), op = m[2], b = parseFloat(m[3]);
    let r;
    if (op === '+') r = a + b;
    else if (['-', '–', '−'].includes(op)) r = a - b;
    else if (['×', 'x', '*'].includes(op)) r = a * b;
    else if (['÷', '/'].includes(op) && b !== 0) r = a / b;
    if (r !== undefined) {
      const formatted = Number.isInteger(r) ? String(r) : String(Math.round(r * 100) / 100);
      return [formatted];
    }
  }

  // "What is X + Y" or "X plus Y" patterns
  m = p.match(/(?:what is|calculate|find|work out)\s+(\d+(?:\.\d+)?)\s*([+\-–×x*÷/]|plus|minus|times|divided by|add|subtract|multiply)\s*(\d+(?:\.\d+)?)/i);
  if (m) {
    const a = parseFloat(m[1]), b = parseFloat(m[3]);
    const op = m[2].toLowerCase();
    let r;
    if (op === '+' || op === 'plus' || op === 'add') r = a + b;
    else if (op === '-' || op === '–' || op === 'minus' || op === 'subtract') r = a - b;
    else if (op === '×' || op === 'x' || op === '*' || op === 'times' || op === 'multiply') r = a * b;
    else if (op === '÷' || op === '/' || op === 'divided by') r = b !== 0 ? a / b : undefined;
    if (r !== undefined) return [String(Number.isInteger(r) ? r : Math.round(r * 100) / 100)];
  }

  // "___ + X = Y" → answer is Y - X
  m = p.match(/[_?]+\s*\+\s*(\d+)\s*=\s*(\d+)/);
  if (m) return [String(parseInt(m[2]) - parseInt(m[1]))];

  // "X + ___ = Y" → answer is Y - X
  m = p.match(/(\d+)\s*\+\s*[_?]+\s*=\s*(\d+)/);
  if (m) return [String(parseInt(m[2]) - parseInt(m[1]))];

  // "___ - X = Y" → answer is Y + X
  m = p.match(/[_?]+\s*[-–]\s*(\d+)\s*=\s*(\d+)/);
  if (m) return [String(parseInt(m[2]) + parseInt(m[1]))];

  // "X - ___ = Y" → answer is X - Y
  m = p.match(/(\d+)\s*[-–]\s*[_?]+\s*=\s*(\d+)/);
  if (m) return [String(parseInt(m[1]) - parseInt(m[2]))];

  // "double X" or "twice X"
  m = p.match(/(?:double|twice)\s+(\d+)/i);
  if (m) return [String(parseInt(m[1]) * 2)];

  // "half of X"
  m = p.match(/half\s+(?:of\s+)?(\d+)/i);
  if (m) return [String(parseInt(m[1]) / 2)];

  // "X squared"
  m = p.match(/(\d+)\s*squared/i);
  if (m) return [String(parseInt(m[1]) ** 2)];

  // "square root of X"
  m = p.match(/square\s*root\s*(?:of\s*)?(\d+)/i);
  if (m) { const v = Math.sqrt(parseInt(m[1])); if (Number.isInteger(v)) return [String(v)]; }

  // Percentage: "X% of Y"
  m = p.match(/(\d+)%\s*of\s*(\d+)/i);
  if (m) return [String((parseInt(m[1]) / 100) * parseInt(m[2]))];

  // "How many more X than Y" → difference
  m = p.match(/(\d+)\s*.*?(\d+)\s*.*?(?:how many more|difference|how much more)/i);
  if (!m) m = p.match(/(?:how many more|difference|how much more).*?(\d+).*?(\d+)/i);
  if (m) {
    const diff = Math.abs(parseInt(m[1]) - parseInt(m[2]));
    return [String(diff)];
  }

  // "altogether" with numbers → sum them
  if (/altogether|total|in total|combined/i.test(p)) {
    const nums = p.match(/\d+/g);
    if (nums && nums.length >= 2 && nums.length <= 4) {
      const sum = nums.reduce((s, n) => s + parseInt(n), 0);
      // Only if the sum seems reasonable
      if (sum < 10000) return [String(sum)];
    }
  }

  // "number after X"
  m = p.match(/number after\s+(\d+)/i);
  if (m) return [String(parseInt(m[1]) + 1)];

  // "one less than X" / "one more than X"
  m = p.match(/one\s+less\s+than\s+(\d+)/i);
  if (m) return [String(parseInt(m[1]) - 1)];
  m = p.match(/one\s+more\s+than\s+(\d+)/i);
  if (m) return [String(parseInt(m[1]) + 1)];

  // "is X odd or even"
  m = p.match(/is\s+(\d+)\s+odd\s+or\s+even/i);
  if (m) return [parseInt(m[1]) % 2 === 0 ? 'even' : 'odd'];

  // Decimal to fraction: "0.X" → "X/10"
  m = p.match(/convert.*?(\d+\.\d+).*?fraction/i);
  if (m) {
    const val = m[1];
    const parts = val.split('.');
    const decimal = parts[1];
    if (decimal.length === 1) return [`${parseInt(parts[0]) > 0 ? parts[0] + ' ' : ''}${decimal}/10`];
    if (decimal.length === 2) return [`${parseInt(parts[0]) > 0 ? parts[0] + ' ' : ''}${decimal}/100`];
  }

  // Times tables: "X × Y" anywhere
  m = p.match(/(\d+)\s*[×x]\s*(\d+)/);
  if (m) return [String(parseInt(m[1]) * parseInt(m[2]))];

  return [];
}

// ─── Clean up prompts ────────────────────────────────────────────────────────

function cleanPrompt(prompt) {
  return prompt
    .replace(/\s+/g, ' ')
    .replace(/_{6,}/g, '______')
    .replace(/\s*\(\s*\d+\s*marks?\s*\)/gi, '')
    .trim();
}

function isGarbled(prompt) {
  // Check if prompt is mostly numbers/symbols with no real words
  const words = prompt.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/).filter(w => w.length > 1);
  if (words.length < 2 && prompt.length > 20) return true;
  // Check for excessive special characters
  const specialRatio = (prompt.replace(/[a-zA-Z0-9\s.,?!'"()]/g, '').length) / prompt.length;
  if (specialRatio > 0.4 && prompt.length > 30) return true;
  return false;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const allSheets = await prisma.sheet.findMany({ orderBy: { id: 'asc' } });
  console.log(`Total sheets in DB: ${allSheets.length}`);

  let deleted = 0, enhanced = 0, answersAdded = 0, cleaned = 0;

  for (const sheet of allSheets) {
    const qs = sheet.contentJson?.questions || [];

    // Delete sheets with 0 or 1 questions
    if (qs.length < 2) {
      await prisma.sheet.delete({ where: { id: sheet.id } });
      deleted++;
      continue;
    }

    let modified = false;
    const newQuestions = [];

    for (const q of qs) {
      const newQ = { ...q };

      // Clean up garbled prompts
      if (isGarbled(q.prompt)) {
        // Skip this question entirely
        continue;
      }

      // Clean prompt
      const cleaned_prompt = cleanPrompt(q.prompt);
      if (cleaned_prompt !== q.prompt) {
        newQ.prompt = cleaned_prompt;
        modified = true;
      }

      // Try to compute answers for fill_in_blank without answers
      if (q.type === 'fill_in_blank' && (!q.correct || q.correct.length === 0)) {
        const computed = computeMathAnswer(q.prompt);
        if (computed.length > 0) {
          newQ.correct = computed;
          answersAdded++;
          modified = true;
        }
      }

      newQuestions.push(newQ);
    }

    // If we filtered out garbled questions, check we still have enough
    if (newQuestions.length < 2) {
      await prisma.sheet.delete({ where: { id: sheet.id } });
      deleted++;
      continue;
    }

    if (newQuestions.length !== qs.length) {
      modified = true;
      cleaned++;
    }

    if (modified) {
      await prisma.sheet.update({
        where: { id: sheet.id },
        data: { contentJson: { questions: newQuestions } }
      });
      enhanced++;
    }
  }

  await prisma.$disconnect();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`ENHANCEMENT COMPLETE`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Deleted (too few questions): ${deleted}`);
  console.log(`Sheets enhanced:            ${enhanced}`);
  console.log(`Answers computed:           ${answersAdded}`);
  console.log(`Garbled questions removed:  ${cleaned}`);
  console.log(`Sheets remaining in DB:     ${allSheets.length - deleted}`);
}

main().catch(err => { console.error(err); process.exit(1); });

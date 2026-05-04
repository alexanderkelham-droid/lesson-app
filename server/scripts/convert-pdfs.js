#!/usr/bin/env node

/**
 * convert-pdfs.js
 *
 * Scans a directory of PDF worksheets, extracts text with pdf-parse,
 * sends the text to Claude to convert into structured content_json,
 * and inserts Sheet records into the database via Prisma.
 *
 * Usage:
 *   node scripts/convert-pdfs.js --dir /path/to/pdfs
 *   node scripts/convert-pdfs.js --dir /path/to/pdfs --dry-run
 *   node scripts/convert-pdfs.js --dir /path/to/pdfs --limit 5
 */

const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');

// Load .env from the server root (one level up from scripts/)
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const pdfParse = require('pdf-parse');
const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dir: null, dryRun: false, limit: Infinity };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dir':
        opts.dir = args[++i];
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--limit':
        opts.limit = parseInt(args[++i], 10);
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!opts.dir) {
    console.error('Usage: node scripts/convert-pdfs.js --dir /path/to/pdfs [--dry-run] [--limit N]');
    process.exit(1);
  }

  return opts;
}

// ---------------------------------------------------------------------------
// System prompt for Claude
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a worksheet-to-JSON converter for an educational tutoring platform. Given the text content of a PDF worksheet, extract all questions and convert them into structured JSON format.

Return ONLY valid JSON with this structure:
{
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice" | "fill_in_blank" | "free_text" | "matching" | "ordering",
      "prompt": "The question text",
      "options": ["only for multiple_choice and ordering"],
      "correct": ["correct answer(s) - array of strings"],
      "pairs": [{"left": "...", "right": "..."}],
      "correct_order": ["..."],
      "points": 1
    }
  ]
}

Rules:
- Use "multiple_choice" for questions with clear option lists (A/B/C/D, numbered options, etc.)
- Use "fill_in_blank" for single-word or short-phrase answers, gap fills, calculations with a definite answer
- Use "free_text" for open-ended questions, explanations, essay prompts, "write a sentence" tasks
- Use "matching" for pair-matching exercises (draw lines, match columns)
- Use "ordering" for sequence/ranking tasks
- For maths calculation questions, use "fill_in_blank" with the numeric answer as correct
- For reading comprehension with no explicit questions, generate 3-5 comprehension questions about the passage
- Each question must have a unique id: q1, q2, q3...
- Points: 1 for simple, 2 for medium, 3 for complex/multi-part
- Always include correct answers where determinable
- If you cannot determine the correct answer, still include the question with correct as an empty array
- Return at minimum 3 questions per worksheet, maximum 20`;

// ---------------------------------------------------------------------------
// Folder-name to subject mapping
// ---------------------------------------------------------------------------

function mapFolderToSubject(folderName) {
  const name = folderName.trim();

  if (name.startsWith('1_English_PDF')) return 'English';
  if (name.startsWith('2_Maths_PDF')) return 'Mathematics';
  if (name.startsWith('11+ Exams') || name.startsWith('Independent School Exams')) return '11+ Preparation';
  if (name.startsWith('GCSE')) {
    // e.g. "GCSE English" or "GCSE Maths"
    return name; // keep full folder name as subject
  }
  if (name.startsWith('SATs')) return 'SATs';

  // Fallback: use the folder name itself
  return name;
}

// ---------------------------------------------------------------------------
// Derive metadata from a PDF's file path relative to the root scan dir
// ---------------------------------------------------------------------------

function deriveMetadata(pdfPath, rootDir) {
  const relative = path.relative(rootDir, pdfPath);
  const parts = relative.split(path.sep);

  // The filename (without extension) becomes the base for the title
  const filename = path.basename(pdfPath, '.pdf');
  const title = filename
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // First directory component -> subject mapping
  const subjectFolder = parts.length > 1 ? parts[0] : '';
  const subject = subjectFolder ? mapFolderToSubject(subjectFolder) : 'General';

  // Second directory component (if any) -> topic
  const topic = parts.length > 2 ? parts[1].replace(/[_-]+/g, ' ').trim() : subject;

  // Tags: all folder names in the path
  const tags = parts.slice(0, -1).map((p) => p.replace(/[_-]+/g, ' ').trim());

  // Difficulty: default 2, bump up for advanced / GCSE content
  let difficultyLevel = 2;
  const lowerPath = relative.toLowerCase();
  if (lowerPath.includes('advanced') || lowerPath.includes('hard') || lowerPath.includes('challenge')) {
    difficultyLevel = 4;
  } else if (lowerPath.includes('gcse') || lowerPath.includes('11+') || lowerPath.includes('exam')) {
    difficultyLevel = 3;
  } else if (lowerPath.includes('easy') || lowerPath.includes('beginner') || lowerPath.includes('foundation')) {
    difficultyLevel = 1;
  }

  // Sheet type
  const lowerFilename = filename.toLowerCase();
  let sheetType = 'worksheet';
  if (lowerFilename.includes('test') || lowerFilename.includes('exam') || lowerFilename.includes('assessment')) {
    sheetType = 'quiz';
  }

  return { title, subject, topic, difficultyLevel, sheetType, tags };
}

// ---------------------------------------------------------------------------
// Recursively find all PDF files in a directory
// ---------------------------------------------------------------------------

async function findPdfs(dir) {
  const results = [];

  async function walk(currentDir) {
    const entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        results.push(fullPath);
      }
    }
  }

  await walk(dir);
  return results.sort();
}

// ---------------------------------------------------------------------------
// Extract text from a PDF file
// ---------------------------------------------------------------------------

async function extractPdfText(filePath) {
  const buffer = await fsPromises.readFile(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

// ---------------------------------------------------------------------------
// Send text to Claude and get back content_json
// ---------------------------------------------------------------------------

async function convertWithClaude(client, text, metadata) {
  const userPrompt = `Convert the following worksheet content into the JSON format described. The worksheet is from subject "${metadata.subject}", topic "${metadata.topic}".

Worksheet text:
---
${text.slice(0, 30000)}
---

Return ONLY the JSON object, no markdown code fences, no explanation.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  // Extract text from the response
  const responseText = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  // Try to parse JSON — handle cases where Claude wraps it in code fences
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  const parsed = JSON.parse(cleaned);
  return parsed;
}

// ---------------------------------------------------------------------------
// Sleep helper for rate limiting
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  const rootDir = path.resolve(opts.dir);

  // Validate the directory exists
  if (!fs.existsSync(rootDir)) {
    console.error(`Directory not found: ${rootDir}`);
    process.exit(1);
  }

  // Validate API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY environment variable. Set it in your .env file.');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('PDF-to-Sheet Converter');
  console.log('='.repeat(60));
  console.log(`Scanning: ${rootDir}`);
  console.log(`Dry run:  ${opts.dryRun}`);
  console.log(`Limit:    ${opts.limit === Infinity ? 'none' : opts.limit}`);
  console.log('');

  // Discover PDFs
  const allPdfs = await findPdfs(rootDir);
  const pdfs = allPdfs.slice(0, opts.limit);

  console.log(`Found ${allPdfs.length} PDF files. Processing ${pdfs.length}.`);
  console.log('-'.repeat(60));

  // Initialise clients
  const anthropic = new Anthropic();
  const prisma = new PrismaClient();

  // Load existing sheet titles to skip duplicates
  const existingSheets = await prisma.sheet.findMany({ select: { title: true } });
  const existingTitles = new Set(existingSheets.map(s => s.title.toLowerCase().trim()));
  console.log(`Existing sheets in DB: ${existingTitles.size} (will skip duplicates)\n`);

  const stats = { processed: 0, created: 0, skipped: 0, duplicates: 0, errors: 0 };
  const errors = [];

  try {
    for (let i = 0; i < pdfs.length; i++) {
      const pdfPath = pdfs[i];
      const relative = path.relative(rootDir, pdfPath);
      const progress = `[${i + 1}/${pdfs.length}]`;

      // Quick duplicate check by title before doing any work
      const quickMeta = deriveMetadata(pdfPath, rootDir);
      if (existingTitles.has(quickMeta.title.toLowerCase().trim())) {
        console.log(`${progress} SKIP (already exists): ${quickMeta.title}`);
        stats.duplicates++;
        continue;
      }

      console.log(`\n${progress} Processing: ${relative}`);

      // 1. Extract text
      let text;
      try {
        text = await extractPdfText(pdfPath);
      } catch (err) {
        console.log(`  ERROR reading PDF: ${err.message}`);
        errors.push({ file: relative, error: `PDF read error: ${err.message}` });
        stats.errors++;
        continue;
      }

      if (!text || text.trim().length < 20) {
        console.log('  SKIPPED: PDF has no extractable text (possibly scanned image)');
        stats.skipped++;
        continue;
      }

      // 2. Derive metadata from folder structure
      const metadata = deriveMetadata(pdfPath, rootDir);
      console.log(`  Title:   ${metadata.title}`);
      console.log(`  Subject: ${metadata.subject}`);
      console.log(`  Topic:   ${metadata.topic}`);
      console.log(`  Type:    ${metadata.sheetType}`);

      // 3. Send to Claude API
      let contentJson;
      try {
        contentJson = await convertWithClaude(anthropic, text, metadata);
      } catch (err) {
        console.log(`  ERROR from Claude API: ${err.message}`);
        errors.push({ file: relative, error: `Claude API error: ${err.message}` });
        stats.errors++;
        continue;
      }

      // Validate that we got questions
      if (!contentJson || !contentJson.questions || !Array.isArray(contentJson.questions)) {
        console.log('  ERROR: Claude returned invalid JSON structure (missing questions array)');
        errors.push({ file: relative, error: 'Invalid JSON structure from Claude' });
        stats.errors++;
        continue;
      }

      console.log(`  Questions extracted: ${contentJson.questions.length}`);
      stats.processed++;

      // 4. Insert into database (or log in dry-run mode)
      if (opts.dryRun) {
        console.log('  DRY RUN: Would create Sheet record:');
        console.log(`    title:           ${metadata.title}`);
        console.log(`    subject:         ${metadata.subject}`);
        console.log(`    topic:           ${metadata.topic}`);
        console.log(`    difficultyLevel: ${metadata.difficultyLevel}`);
        console.log(`    sheetType:       ${metadata.sheetType}`);
        console.log(`    tags:            [${metadata.tags.join(', ')}]`);
        console.log(`    questions:       ${contentJson.questions.length}`);
      } else {
        try {
          const sheet = await prisma.sheet.create({
            data: {
              title: metadata.title,
              subject: metadata.subject,
              topic: metadata.topic,
              difficultyLevel: metadata.difficultyLevel,
              contentJson: contentJson,
              sheetType: metadata.sheetType,
              tags: metadata.tags,
            },
          });
          console.log(`  CREATED: Sheet #${sheet.id}`);
          existingTitles.add(metadata.title.toLowerCase().trim());
          stats.created++;
        } catch (err) {
          console.log(`  ERROR inserting into DB: ${err.message}`);
          errors.push({ file: relative, error: `DB insert error: ${err.message}` });
          stats.errors++;
          continue;
        }
      }

      // 5. Rate limiting: wait 1 second between API calls
      if (i < pdfs.length - 1) {
        await sleep(1000);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Files found:     ${allPdfs.length}`);
  console.log(`Files processed: ${stats.processed}`);
  console.log(`Sheets created:  ${opts.dryRun ? `${stats.processed} (dry run)` : stats.created}`);
  console.log(`Duplicates:      ${stats.duplicates}`);
  console.log(`Files skipped:   ${stats.skipped}`);
  console.log(`Errors:          ${stats.errors}`);

  if (errors.length > 0) {
    console.log('\nError details:');
    for (const e of errors) {
      console.log(`  - ${e.file}: ${e.error}`);
    }
  }

  console.log('');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

const express = require('express');
const fs = require('fs');
const path = require('path');
const { worksheetsRoot, resolveInside } = require('../lib/originals');
const storage = require('../lib/storage');
const Anthropic = require('@anthropic-ai/sdk');
const prisma = require('../prisma');
const { auth, requireRole } = require('../middleware/auth');
const { stripAnswers } = require('../lib/scoring');
const { validateIdParam, parseId } = require('../lib/access');

const router = express.Router();
router.param('id', validateIdParam);

const isStaff = user => user.role === 'manager' || user.role === 'tutor';

// Staff see whether an original PDF exists (hosted pdfUrl or a file in the
// local Worksheets archive). The archive path itself is never sent out.
function presentSheet(sheet, user) {
  const { sourceFile, pdfUrl, digitisedBy, ...rest } = sheet;
  if (!isStaff(user)) return rest;
  // Digital version not yet checked/redone → worth reviewing before use
  if (digitisedBy !== undefined) {
    rest.needsReview = digitisedBy === 'text' || digitisedBy === 'vision_review';
    // No digital questions yet — use the original PDF
    rest.printOnly = digitisedBy === 'print_only';
  }
  // pdfUrl is an internal storage reference — clients just get hasOriginal
  return { ...rest, hasOriginal: !!(pdfUrl || sourceFile) };
}


// AI improvement system prompt — keeps responses to clean JSON
const AI_IMPROVE_SYSTEM = `You are improving a tutoring worksheet's questions. The current questions may have garbled prompts, wrong types, or missing answers (because they came from imperfect PDF text extraction).

Return a single JSON object matching this schema:
{
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice" | "fill_in_blank" | "free_text" | "matching" | "ordering",
      "prompt": "Clear, complete sentence",
      "options": ["..."],            // multiple_choice or ordering only
      "correct": ["..."],            // array of acceptable answers
      "pairs": [{"left":"...", "right":"..."}],  // matching only
      "correct_order": ["..."],      // ordering only
      "points": 1
    }
  ]
}

Rules:
1. Clean up garbled or fragmentary prompts into clear, complete sentences.
2. Pick the right type for each question. Maths calculations should be fill_in_blank with the computed answer. A/B/C/D options → multiple_choice. Open writing tasks → free_text.
3. For maths, COMPUTE the correct answer yourself (e.g. "5 + 7" → correct: ["12"]).
4. Include multiple acceptable variants where reasonable (e.g. ["£2.50", "2.50", "2.5"]).
5. For free_text with no determinable answer, leave correct as [].
6. Preserve the original intent — don't invent unrelated questions.
7. Drop genuinely unsalvageable items (single-character prompts, random fragments) rather than guess.
8. Return ONLY the JSON object, no markdown fences, no commentary.
9. Never use emojis or decorative symbols in prompts or answers.`;

// POST /api/sheets/:id/ai-improve - manager only
router.post('/:id/ai-improve', requireRole('manager'), async (req, res, next) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: 'ANTHROPIC_API_KEY not set on server. Add it to the Vercel project environment variables.'
      });
    }

    const sheetId = parseInt(req.params.id);
    const sheet = await prisma.sheet.findUnique({ where: { id: sheetId } });
    if (!sheet) return res.status(404).json({ error: 'Sheet not found' });

    // Use the unsaved client-side content if provided, otherwise the DB content
    const currentContent = req.body.contentJson || sheet.contentJson || { questions: [] };

    const userPrompt = `Improve the following worksheet questions.

Subject: ${sheet.subject}
Topic: ${sheet.topic}
Title: ${sheet.title}

Current questions (JSON):
${JSON.stringify(currentContent, null, 2)}

Return ONLY the improved JSON.`;

    // Timeout just under Vercel's 60s function limit so we return a clean
    // error instead of the platform killing the request.
    const client = new Anthropic({ timeout: 55_000, maxRetries: 0 });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: AI_IMPROVE_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });

    let text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const improved = JSON.parse(text);
    if (!improved.questions || !Array.isArray(improved.questions)) {
      return res.status(502).json({ error: 'AI returned an unexpected response. Try again.' });
    }

    // Sanitise null bytes
    improved.questions = improved.questions.map(q => ({
      ...q,
      prompt: q.prompt ? String(q.prompt).replace(/\0/g, '') : ''
    }));

    res.json({ improved, usage: response.usage });
  } catch (err) {
    if (err.status === 401) return res.status(500).json({ error: 'Invalid ANTHROPIC_API_KEY.' });
    if (err.status === 429) return res.status(429).json({ error: 'Anthropic rate limit. Try again in a moment.' });
    if (err.name === 'APIConnectionTimeoutError') return res.status(504).json({ error: 'The AI took too long. Try again, or improve a smaller sheet.' });
    if (err instanceof SyntaxError) return res.status(502).json({ error: 'AI returned invalid JSON. Try again.' });
    next(err);
  }
});

// GET /api/sheets - all roles, with filters
router.get('/', auth, async (req, res, next) => {
  try {
    const { subject, topic, difficulty, sheetType, tags, search } = req.query;

    const where = {};
    if (subject) where.subject = { equals: subject, mode: 'insensitive' };
    if (topic) where.topic = { contains: topic, mode: 'insensitive' };
    if (difficulty) {
      const d = parseId(difficulty);
      if (!d) return res.status(400).json({ error: 'Invalid difficulty' });
      where.difficultyLevel = d;
    }
    if (sheetType) {
      if (!['worksheet', 'quiz', 'practice'].includes(sheetType)) return res.status(400).json({ error: 'Invalid sheetType' });
      where.sheetType = sheetType;
    }
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim());
      where.tags = { hasSome: tagList };
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
        { topic: { contains: search, mode: 'insensitive' } }
      ];
    }

    const sheets = await prisma.sheet.findMany({
      where,
      select: {
        id: true, title: true, subject: true, topic: true,
        difficultyLevel: true, sheetType: true, tags: true, createdAt: true,
        sourceFile: true, pdfUrl: true, digitisedBy: true
      },
      orderBy: [{ subject: 'asc' }, { difficultyLevel: 'asc' }]
    });

    res.json(sheets.map(s => presentSheet(s, req.user)));
  } catch (err) { next(err); }
});

// GET /api/sheets/:id - includes full content_json
router.get('/:id', auth, async (req, res, next) => {
  try {
    const sheetId = parseId(req.params.id);
    const sheet = await prisma.sheet.findUnique({ where: { id: sheetId } });
    if (!sheet) return res.status(404).json({ error: 'Sheet not found' });

    // Students only get the answer key once they've submitted this sheet
    // (so the review screen can show ticks and crosses).
    if (req.user.role === 'student') {
      const submitted = await prisma.studentResponse.count({
        where: { sheetId, studentId: req.user.userId }
      });
      if (!submitted) return res.json(presentSheet({ ...sheet, contentJson: stripAnswers(sheet.contentJson) }, req.user));
    }
    res.json(presentSheet(sheet, req.user));
  } catch (err) { next(err); }
});

// GET /api/sheets/:id/original - staff only. The original worksheet PDF.
//  ?link=1 → JSON { url } with a 1-hour signed URL to the hosted copy
//            (or { url: null } if only the local archive has it)
//  otherwise → redirect to the hosted copy, or stream from the local
//            Worksheets archive (WORKSHEETS_DIR), else 404.
router.get('/:id/original', requireRole('manager', 'tutor'), async (req, res, next) => {
  try {
    const sheet = await prisma.sheet.findUnique({
      where: { id: parseId(req.params.id) },
      select: { id: true, title: true, sourceFile: true, pdfUrl: true },
    });
    if (!sheet) return res.status(404).json({ error: 'Sheet not found' });

    const hosted = sheet.pdfUrl
      ? (/^https?:\/\//i.test(sheet.pdfUrl) ? sheet.pdfUrl : await storage.signedUrl(sheet.pdfUrl, 3600))
      : null;
    if (req.query.link) {
      if (hosted) return res.json({ url: hosted });
      const root = worksheetsRoot();
      const local = root && sheet.sourceFile && await resolveInside(root, sheet.sourceFile);
      if (local) return res.json({ url: null });
      return res.status(404).json({ error: 'No original PDF available for this sheet' });
    }
    if (hosted) return res.redirect(302, hosted);

    const root = worksheetsRoot();
    if (root && sheet.sourceFile) {
      const file = await resolveInside(root, sheet.sourceFile);
      if (file) {
        const name = path.basename(file).replace(/[^\w .()-]/g, '_');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${name}"`);
        res.setHeader('Cache-Control', 'private, max-age=300');
        const stream = fs.createReadStream(file);
        stream.on('error', next);
        return stream.pipe(res);
      }
    }
    res.status(404).json({ error: 'No original PDF available for this sheet' });
  } catch (err) { next(err); }
});


// POST /api/sheets - manager only
router.post('/', requireRole('manager'), async (req, res, next) => {
  try {
    const { title, subject, topic, difficultyLevel, contentJson, sheetType, tags } = req.body;
    if (!title || !subject || !topic || !difficultyLevel || !contentJson || !sheetType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const err = validateSheetFields({ difficultyLevel, contentJson, sheetType, tags });
    if (err) return res.status(400).json({ error: err });
    const sheet = await prisma.sheet.create({
      data: { title, subject, topic, difficultyLevel: Number(difficultyLevel), contentJson, sheetType, tags: tags || [] }
    });
    res.status(201).json(sheet);
  } catch (err) { next(err); }
});

function validateSheetFields({ difficultyLevel, contentJson, sheetType, tags }) {
  if (difficultyLevel !== undefined && !(Number.isInteger(Number(difficultyLevel)) && Number(difficultyLevel) >= 1 && Number(difficultyLevel) <= 5)) {
    return 'difficultyLevel must be 1-5';
  }
  if (contentJson !== undefined && !(contentJson && Array.isArray(contentJson.questions))) {
    return 'contentJson must be an object with a questions array';
  }
  if (sheetType !== undefined && !['worksheet', 'quiz', 'practice'].includes(sheetType)) {
    return 'sheetType must be worksheet, quiz or practice';
  }
  if (tags !== undefined && !Array.isArray(tags)) return 'tags must be an array';
  return null;
}

// PUT /api/sheets/:id - manager only
router.put('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const { title, subject, topic, difficultyLevel, contentJson, sheetType, tags, reviewed } = req.body;
    const err = validateSheetFields({ difficultyLevel, contentJson, sheetType, tags });
    if (err) return res.status(400).json({ error: err });
    const sheet = await prisma.sheet.update({
      where: { id: parseId(req.params.id) },
      data: {
        ...(title && { title }),
        ...(subject && { subject }),
        ...(topic && { topic }),
        ...(difficultyLevel && { difficultyLevel: Number(difficultyLevel) }),
        ...(contentJson && { contentJson }),
        ...(sheetType && { sheetType }),
        ...(tags && { tags }),
        // A person has checked the digital version against the original
        ...(reviewed === true && { digitisedBy: 'reviewed' })
      }
    });
    res.json(sheet);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Sheet not found' });
    next(err);
  }
});

// DELETE /api/sheets/:id - manager only. Refused if the sheet is used in
// any lesson plan, response or follow-up rule (so history isn't broken).
router.delete('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    await prisma.sheet.delete({ where: { id: parseId(req.params.id) } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Sheet not found' });
    if (err.code === 'P2003') return res.status(409).json({ error: 'This sheet is used in lesson plans or student history and cannot be deleted' });
    next(err);
  }
});

module.exports = router;

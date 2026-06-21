const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const prisma = require('../prisma');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

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
8. Return ONLY the JSON object, no markdown fences, no commentary.`;

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

    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
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
    if (difficulty) where.difficultyLevel = parseInt(difficulty);
    if (sheetType) where.sheetType = sheetType;
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
        difficultyLevel: true, sheetType: true, tags: true, createdAt: true
      },
      orderBy: [{ subject: 'asc' }, { difficultyLevel: 'asc' }]
    });

    res.json(sheets);
  } catch (err) { next(err); }
});

// GET /api/sheets/:id - includes full content_json
router.get('/:id', auth, async (req, res, next) => {
  try {
    const sheet = await prisma.sheet.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!sheet) return res.status(404).json({ error: 'Sheet not found' });
    res.json(sheet);
  } catch (err) { next(err); }
});

// POST /api/sheets - manager only
router.post('/', requireRole('manager'), async (req, res, next) => {
  try {
    const { title, subject, topic, difficultyLevel, contentJson, sheetType, tags } = req.body;
    if (!title || !subject || !topic || !difficultyLevel || !contentJson || !sheetType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const sheet = await prisma.sheet.create({
      data: { title, subject, topic, difficultyLevel: parseInt(difficultyLevel), contentJson, sheetType, tags: tags || [] }
    });
    res.status(201).json(sheet);
  } catch (err) { next(err); }
});

// PUT /api/sheets/:id - manager only
router.put('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const { title, subject, topic, difficultyLevel, contentJson, sheetType, tags } = req.body;
    const sheet = await prisma.sheet.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...(title && { title }),
        ...(subject && { subject }),
        ...(topic && { topic }),
        ...(difficultyLevel && { difficultyLevel: parseInt(difficultyLevel) }),
        ...(contentJson && { contentJson }),
        ...(sheetType && { sheetType }),
        ...(tags && { tags })
      }
    });
    res.json(sheet);
  } catch (err) { next(err); }
});

// DELETE /api/sheets/:id - manager only
router.delete('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    await prisma.sheet.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;

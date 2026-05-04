const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

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

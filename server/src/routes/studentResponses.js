const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

function calculateScore(contentJson, responsesJson) {
  const questions = contentJson.questions || [];
  if (questions.length === 0) return null;

  let totalPoints = 0;
  let earnedPoints = 0;

  for (const q of questions) {
    const points = q.points || 1;
    totalPoints += points;
    const answer = responsesJson[q.id];
    if (answer === undefined || answer === null) continue;

    switch (q.type) {
      case 'multiple_choice': {
        const correct = Array.isArray(q.correct) ? q.correct : [q.correct];
        const given = Array.isArray(answer) ? answer : [answer];
        const isCorrect = correct.length === given.length && correct.every(c => given.includes(c));
        if (isCorrect) earnedPoints += points;
        break;
      }
      case 'fill_in_blank': {
        const correct = Array.isArray(q.correct) ? q.correct : [q.correct];
        const normalise = s => String(s).trim().toLowerCase();
        if (correct.some(c => normalise(c) === normalise(answer))) earnedPoints += points;
        break;
      }
      case 'matching': {
        // answer: { leftItem: rightItem, ... }
        const pairs = q.pairs || [];
        const allCorrect = pairs.every(p => answer[p.left] === p.right);
        if (allCorrect) earnedPoints += points;
        break;
      }
      case 'ordering': {
        // answer: array of items in user's order
        const correct = q.correct_order || [];
        const isCorrect = Array.isArray(answer) &&
          answer.length === correct.length &&
          answer.every((v, i) => v === correct[i]);
        if (isCorrect) earnedPoints += points;
        break;
      }
      case 'free_text':
      case 'image_based': {
        // Award full points for any non-empty answer (manual grading)
        if (answer && String(answer).trim().length > 0) earnedPoints += points;
        break;
      }
    }
  }

  return totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
}

// GET /api/student-responses
router.get('/', auth, async (req, res, next) => {
  try {
    const { userId, role } = req.user;
    const { studentId, sheetId, lessonPlanItemId } = req.query;

    const where = {};
    if (role === 'student') {
      where.studentId = userId;
    } else if (studentId) {
      where.studentId = parseInt(studentId);
    }
    if (sheetId) where.sheetId = parseInt(sheetId);
    if (lessonPlanItemId) where.lessonPlanItemId = parseInt(lessonPlanItemId);

    const responses = await prisma.studentResponse.findMany({
      where,
      include: {
        sheet: { select: { id: true, title: true, subject: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(responses);
  } catch (err) { next(err); }
});

// POST /api/student-responses
router.post('/', auth, async (req, res, next) => {
  try {
    const { userId, role } = req.user;
    const { sheetId, lessonPlanItemId, responsesJson, timeSpentSeconds, manualScore } = req.body;

    if (!sheetId || !lessonPlanItemId || !responsesJson) {
      return res.status(400).json({ error: 'sheetId, lessonPlanItemId, responsesJson required' });
    }

    const studentId = role === 'student' ? userId : parseInt(req.body.studentId);

    // Fetch sheet for scoring
    const sheet = await prisma.sheet.findUnique({ where: { id: parseInt(sheetId) } });
    if (!sheet) return res.status(404).json({ error: 'Sheet not found' });

    // Manual score (managers/tutors only) overrides auto-scoring
    let score;
    if (manualScore !== undefined && manualScore !== null && manualScore !== '' && role !== 'student') {
      const n = parseFloat(manualScore);
      if (isNaN(n) || n < 0 || n > 100) {
        return res.status(400).json({ error: 'manualScore must be between 0 and 100' });
      }
      score = n;
    } else {
      score = calculateScore(sheet.contentJson, responsesJson);
    }

    // Mark item as in_progress during save
    await prisma.lessonPlanItem.update({
      where: { id: parseInt(lessonPlanItemId) },
      data: { status: 'in_progress' }
    });

    const response = await prisma.studentResponse.create({
      data: {
        studentId,
        sheetId: parseInt(sheetId),
        lessonPlanItemId: parseInt(lessonPlanItemId),
        responsesJson,
        score,
        completedAt: new Date(),
        timeSpentSeconds: timeSpentSeconds || null
      }
    });

    res.status(201).json(response);
  } catch (err) { next(err); }
});

module.exports = router;

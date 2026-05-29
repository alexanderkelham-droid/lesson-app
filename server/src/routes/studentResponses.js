const express = require('express');
const prisma = require('../prisma');
const { auth } = require('../middleware/auth');

const router = express.Router();

function calculateScore(contentJson, responsesJson) {
  const questions = contentJson.questions || [];
  if (questions.length === 0) return null;

  let totalPoints = 0;
  let earnedPoints = 0;

  for (const q of questions) {
    // Free-text / image-based questions can't be auto-graded. Exclude them
    // from both numerator and denominator so the score reflects only what
    // we can actually verify. Tutor can override with manualScore.
    if (q.type === 'free_text' || q.type === 'image_based') continue;

    // Auto-gradeable questions need a `correct` value to be counted. If
    // the sheet was migrated without one, exclude it from scoring so it
    // doesn't unfairly drag scores down to 0.
    const correctRaw = q.type === 'ordering' ? q.correct_order : q.correct;
    const hasCorrect = Array.isArray(correctRaw)
      ? correctRaw.length > 0
      : !!correctRaw;
    if (!hasCorrect) continue;

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
        const pairs = q.pairs || [];
        const allCorrect = pairs.every(p => answer[p.left] === p.right);
        if (allCorrect) earnedPoints += points;
        break;
      }
      case 'ordering': {
        const correct = q.correct_order || [];
        const isCorrect = Array.isArray(answer) &&
          answer.length === correct.length &&
          answer.every((v, i) => v === correct[i]);
        if (isCorrect) earnedPoints += points;
        break;
      }
    }
  }

  // If nothing is auto-gradeable, score is null (needs manual review).
  if (totalPoints === 0) return null;
  return Math.round((earnedPoints / totalPoints) * 100);
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

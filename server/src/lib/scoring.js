// Auto-scoring for sheet answers. Shared by student submissions
// (routes/studentResponses.js) and tutor-finalised live sessions
// (routes/sessions.js).
//
// Rules:
// - free_text / image_based questions are never auto-scored (tutor reviews)
// - a question without an answer key is skipped (not counted as wrong)
// - returns 0-100, or null when nothing on the sheet is auto-gradeable

const normalise = s => String(s).trim().toLowerCase();

// Lenient comparison for typed answers, so children aren't marked wrong for
// formatting: case, surrounding punctuation, separators ("5 6 7" = "5, 6, 7"),
// thousands commas, and units/currency on numbers ("10p" = "10", "£2.50" = "2.5").
const NUMBER_WITH_UNITS = /^[£$€]?\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:p|pence|cm|mm|m|km|g|kg|ml|l|s|mins?|minutes?|hours?|h|%|°c?|degrees?)?$/;

function canonical(value) {
  let s = normalise(value).replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
  s = s.replace(/(\d),(\d{3})\b/g, '$1$2'); // 1,000 → 1000
  const num = s.match(NUMBER_WITH_UNITS);
  if (num) return String(Number(num[1]));
  // Lists: split on commas/semicolons/spaces/"and", canonicalise each part
  const parts = s.split(/\s*(?:,|;|\band\b|\s)\s*/).filter(Boolean);
  if (parts.length > 1) return parts.map(p => { const m = p.match(NUMBER_WITH_UNITS); return m ? String(Number(m[1])) : p; }).join(',');
  return s;
}

function textMatches(expected, given) {
  if (given === undefined || given === null) return false;
  if (normalise(expected) === normalise(given)) return true;
  return canonical(expected) === canonical(given);
}

function hasAnswerKey(q) {
  if (q.type === 'matching') return Array.isArray(q.pairs) && q.pairs.length > 0;
  const key = q.type === 'ordering' ? q.correct_order : q.correct;
  return Array.isArray(key) ? key.length > 0 : !!key;
}

function isAnswerCorrect(q, answer) {
  if (answer === undefined || answer === null || answer === '') return false;
  switch (q.type) {
    case 'multiple_choice': {
      const correct = Array.isArray(q.correct) ? q.correct : [q.correct];
      const given = Array.isArray(answer) ? answer : [answer];
      return correct.length === given.length && correct.every(c => given.some(g => textMatches(c, g)));
    }
    case 'fill_in_blank': {
      const correct = Array.isArray(q.correct) ? q.correct : [q.correct];
      return correct.some(c => textMatches(c, answer));
    }
    case 'matching': {
      if (typeof answer !== 'object') return false;
      return (q.pairs || []).every(p => answer[p.left] === p.right);
    }
    case 'ordering': {
      const correct = q.correct_order || [];
      // Typed in the live lesson as text ("13, 24, 31") rather than dragged
      if (typeof answer === 'string') return textMatches(correct.join(', '), answer);
      return Array.isArray(answer) && answer.length === correct.length && answer.every((v, i) => textMatches(correct[i], v));
    }
    default:
      return false;
  }
}

function calculateScore(contentJson, responsesJson) {
  const questions = (contentJson && contentJson.questions) || [];
  const answers = responsesJson || {};
  let totalPoints = 0;
  let earnedPoints = 0;

  for (const q of questions) {
    if (q.type === 'free_text' || q.type === 'image_based') continue;
    if (!hasAnswerKey(q)) continue;
    const points = q.points || 1;
    totalPoints += points;
    if (isAnswerCorrect(q, answers[q.id])) earnedPoints += points;
  }

  if (totalPoints === 0) return null;
  return Math.round((earnedPoints / totalPoints) * 100);
}

// Remove answer keys from a sheet's content before sending it to a student.
function stripAnswers(contentJson) {
  if (!contentJson || !Array.isArray(contentJson.questions)) return contentJson;
  return {
    ...contentJson,
    questions: contentJson.questions.map(q => {
      const { correct, correct_order, ...rest } = q;
      // The UI needs to know checkbox vs radio without seeing the answers
      if (q.type === 'multiple_choice') rest.multi = Array.isArray(correct) && correct.length > 1;
      if (q.type === 'matching' && Array.isArray(q.pairs)) {
        // Keep the left/right items so the student can match them, but
        // don't reveal which right goes with which left.
        const rights = q.pairs.map(p => p.right).sort((a, b) => String(a).localeCompare(String(b)));
        rest.pairs = q.pairs.map((p, i) => ({ left: p.left, right: rights[i] }));
      }
      return rest;
    }),
  };
}

module.exports = { calculateScore, isAnswerCorrect, hasAnswerKey, stripAnswers, textMatches };

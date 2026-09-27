// Client copy of the server's lenient answer matching (server/src/lib/scoring.js)
// so review ticks/crosses agree with the score. Keep the two in sync.
const normalise = s => String(s).trim().toLowerCase()
const NUMBER_WITH_UNITS = /^[£$€]?\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:p|pence|cm|mm|m|km|g|kg|ml|l|s|mins?|minutes?|hours?|h|%|°c?|degrees?)?$/

function canonical(value) {
  let s = normalise(value).replace(/[.!?]+$/, '').replace(/\s+/g, ' ')
  s = s.replace(/(\d),(\d{3})\b/g, '$1$2')
  const num = s.match(NUMBER_WITH_UNITS)
  if (num) return String(Number(num[1]))
  const parts = s.split(/\s*(?:,|;|\band\b|\s)\s*/).filter(Boolean)
  if (parts.length > 1) return parts.map(p => { const m = p.match(NUMBER_WITH_UNITS); return m ? String(Number(m[1])) : p }).join(',')
  return s
}

export function textMatches(expected, given) {
  if (given === undefined || given === null) return false
  if (normalise(expected) === normalise(given)) return true
  return canonical(expected) === canonical(given)
}

// Returns true/false, or null when the question can't be auto-marked
// (open writing, or no answer key) — those show no tick/cross.
// Mirrors the server's per-question scoring.
export function isQuestionCorrect(question, answer) {
  if (!question) return null
  if (question.type === 'free_text' || question.type === 'image_based') return null
  const key = question.type === 'matching' ? question.pairs
            : question.type === 'ordering' ? question.correct_order
            : question.correct
  if (!key || (Array.isArray(key) && key.length === 0)) return null
  if (answer === undefined || answer === null || answer === '') return false
  switch (question.type) {
    case 'multiple_choice': {
      const correct = Array.isArray(question.correct) ? question.correct : [question.correct]
      const given = Array.isArray(answer) ? answer : [answer]
      return correct.length === given.length && correct.every(c => given.some(g => textMatches(c, g)))
    }
    case 'fill_in_blank': {
      const correct = Array.isArray(question.correct) ? question.correct : [question.correct]
      return correct.some(c => textMatches(c, answer))
    }
    case 'matching': {
      if (typeof answer !== 'object' || Array.isArray(answer)) return false
      const pairs = question.pairs || []
      return pairs.every(p => answer[p.left] === p.right)
    }
    case 'ordering': {
      const correct = question.correct_order || []
      return Array.isArray(answer) && answer.length === correct.length && answer.every((v, i) => v === correct[i])
    }
    default:
      return false
  }
}

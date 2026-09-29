// AI lesson planner: looks at a student's history (sessions, what was set,
// completed, carried over, scores and the specific questions they got wrong,
// tutor notes) and proposes the next lessons from the worksheet library.
//
// Nothing is saved here — the API returns suggestions and the tutor chooses
// what to add.

const Anthropic = require('@anthropic-ai/sdk');
const prisma = require('../prisma');
const { isAnswerCorrect, hasAnswerKey } = require('./scoring');

const MODEL = process.env.PLANNER_MODEL || 'claude-sonnet-5';
const CUSTOM_TYPES = ['ixl_maths', 'ixl_english', 'paper', 'other'];

const SYSTEM = `You are an experienced UK primary/secondary tutor and curriculum planner at Redwood Scholars, a tuition centre. You plan 1:1 lessons (typically 45–60 minutes) for children aged ~5–16 in Maths and English.

You are given: the student's profile, their lesson history (what was set, finished, carried over, scores, the specific questions they got wrong, tutor notes) and the centre's worksheet library. Plan the NEXT lessons.

Planning principles:
- Diagnose first: identify secure skills, gaps and misconceptions from scores and wrong answers (not just topic names). Low scores or repeated carry-overs = revisit at the same or a slightly easier level before moving on; high scores (≥80%) = progress to the next level/topic.
- Build sensible progressions (e.g. equivalent fractions → adding fractions with same denominator → different denominators). Respect the student's age and subject focus; balance Maths/English if focus is "both".
- Mix: usually one main teaching sheet, one practice/consolidation sheet, a short warm-up or retrieval task, and optionally an IXL or paper task. Fit the lesson length (estimate minutes; a typical sheet takes 10–20 min).
- Items under "ALREADY PLANNED / UNSCHEDULED" are already in the plan — never suggest them again; plan AROUND them (they will be done first). Don't repeat sheets already completed with a good score. Re-setting a sheet the student did poorly on is fine if you say why. Unfinished carried-over work should normally come first.
- Prefer library sheets that are NOT marked [review] (those may have digital errors); if you do pick one, mention the tutor should use the printed original. Sheets marked [paper only] have no online version: fine for in-centre lessons (printed), mention it in the reason.
- Only use sheet ids from the library list. If nothing suitable exists, use a custom item (IXL skill, paper activity) and describe it precisely.
- Follow any tutor instructions exactly (they override these defaults).
- Never use emojis or decorative symbols; plain text only.
- Be concrete and brief. Reasons are for the tutor: one sentence each, referencing evidence ("scored 40% on adding fractions; errors with unlike denominators").`;

// Deliberately flat (two simple lists) — deeply nested arrays are where
// models most often slip into malformed output.
const TOOL = {
  name: 'propose_lessons',
  description: 'Return the assessment and the proposed lessons.',
  input_schema: {
    type: 'object',
    properties: {
      assessment: { type: 'string', description: '2–3 short sentences (max ~70 words): strengths, gaps, misconceptions.' },
      focusAreas: {
        type: 'array',
        description: 'At most 4.',
        items: { type: 'object', properties: { topic: { type: 'string' }, why: { type: 'string' } }, required: ['topic', 'why'] },
      },
      lessons: {
        type: 'array',
        description: 'One entry per lesson, in order (lesson 1 = next lesson).',
        items: {
          type: 'object',
          properties: {
            lesson: { type: 'integer', description: '1-based lesson number' },
            goal: { type: 'string', description: 'Learning objective for this lesson' },
            tutorNotes: { type: 'string', description: 'Teaching tips (optional)' },
          },
          required: ['lesson', 'goal'],
        },
      },
      items: {
        type: 'array',
        description: 'Every activity across all lessons, in teaching order.',
        items: {
          type: 'object',
          properties: {
            lesson: { type: 'integer', description: 'Which lesson (1-based) this belongs to' },
            sheetId: { type: 'integer', description: 'Library sheet id, or omit for a custom item' },
            customTitle: { type: 'string' },
            customType: { type: 'string', enum: CUSTOM_TYPES },
            reason: { type: 'string' },
            minutes: { type: 'integer' },
          },
          required: ['lesson', 'reason'],
        },
      },
    },
    required: ['assessment', 'lessons', 'items'],
  },
};

// Models occasionally return nested arrays as JSON strings — sometimes with
// stray markup or cut short. Accept real arrays, clean JSON strings, and
// salvage the longest valid prefix of a damaged one.
function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string') return [];
  let str = v.trim();
  const markup = str.search(/<\/?(parameter|invoke|\w+>)/);
  if (markup > 0) str = str.slice(0, markup).trim();
  const tryParse = t => { try { const p = JSON.parse(t); return Array.isArray(p) ? p : null; } catch { return null; } };
  const direct = tryParse(str);
  if (direct) return direct;
  const open = str.indexOf('[');
  if (open === -1) return [];
  str = str.slice(open);
  // Cut back to each closing brace and close the array there
  for (let i = str.length - 1; i > 0; i--) {
    if (str[i] !== '}') continue;
    const fixed = tryParse(str.slice(0, i + 1) + ']');
    if (fixed) return fixed;
  }
  return [];
}

// Occasionally a long string field swallows the following fields as raw
// markup ('…text</assessment> <parameter name="focusAreas">[...]').
// Split them back out so nothing leaks into the UI.
function repairToolInput(input) {
  const out = { ...input };
  for (const [key, val] of Object.entries(input)) {
    if (typeof val !== 'string' || !/<parameter name="/.test(val)) continue;
    const parts = val.split(/<\/?\w*>?\s*<parameter name="(\w+)">/);
    out[key] = parts[0].replace(/<\/\w+>\s*$/, '').trim();
    for (let i = 1; i < parts.length; i += 2) {
      const name = parts[i];
      const raw = (parts[i + 1] || '').replace(/<\/parameter>[\s\S]*$/, '').trim();
      if (out[name] !== undefined && !(typeof out[name] === 'string' && !out[name])) continue;
      try { out[name] = JSON.parse(raw); } catch { out[name] = raw; }
    }
  }
  return out;
}

const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
const fmtDate = d => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: process.env.APP_TIMEZONE || 'Europe/London' });

// Compact library listing (cached across requests by the API)
let catalogueCache = { at: 0, text: '', ids: new Set() };
async function libraryCatalogue() {
  if (Date.now() - catalogueCache.at < 10 * 60 * 1000 && catalogueCache.text) return catalogueCache;
  const sheets = await prisma.sheet.findMany({
    where: { NOT: { title: { startsWith: '[QA]' } } },
    select: { id: true, title: true, subject: true, topic: true, difficultyLevel: true, sheetType: true, digitisedBy: true },
    orderBy: [{ subject: 'asc' }, { topic: 'asc' }, { title: 'asc' }],
  });
  const lines = [];
  let current = '';
  for (const s of sheets) {
    const head = `${s.subject} › ${s.topic}`;
    if (head !== current) { lines.push(`\n## ${head}`); current = head; }
    const review = s.digitisedBy === 'print_only' ? ' [paper only]'
      : s.digitisedBy === 'text' || s.digitisedBy === 'vision_review' ? ' [review]' : '';
    lines.push(`#${s.id} L${s.difficultyLevel} ${s.title}${s.sheetType !== 'worksheet' ? ` (${s.sheetType})` : ''}${review}`);
  }
  catalogueCache = { at: Date.now(), text: lines.join('\n'), ids: new Set(sheets.map(s => s.id)) };
  return catalogueCache;
}

// Everything the planner needs to know about this student, as plain text
async function studentContext(planId) {
  const plan = await prisma.lessonPlan.findUnique({
    where: { id: planId },
    select: {
      id: true, title: true, studentId: true, studentNotes: true, lessonDayOfWeek: true, lessonTime: true,
      student: { select: { name: true, age: true, subjectFocus: true } },
      tutor: { select: { name: true } },
    },
  });

  // All of this student's plans, so history survives plan changes
  const items = await prisma.lessonPlanItem.findMany({
    where: { lessonPlan: { studentId: plan.studentId } },
    select: {
      id: true, status: true, sequenceOrder: true, tutorNotes: true, customTitle: true, customType: true,
      carriedFromId: true, lessonPlanId: true, autoGenerated: true,
      _count: { select: { carriedTo: true } },
      sheet: { select: { id: true, title: true, subject: true, topic: true, difficultyLevel: true, contentJson: true } },
      session: { select: { id: true, scheduledAt: true, attendedAt: true, notes: true, durationMins: true } },
      studentResponses: { orderBy: { createdAt: 'desc' }, take: 1, select: { score: true, responsesJson: true, createdAt: true } },
    },
    orderBy: [{ sequenceOrder: 'asc' }],
  });

  const now = new Date();
  const sessions = new Map();
  const unscheduled = [];
  for (const it of items) {
    if (it.session) {
      if (!sessions.has(it.session.id)) sessions.set(it.session.id, { ...it.session, items: [] });
      sessions.get(it.session.id).items.push(it);
    } else unscheduled.push(it);
  }

  function describe(it) {
    const name = it.sheet ? `#${it.sheet.id} "${it.sheet.title}" (${it.sheet.subject} › ${it.sheet.topic}, L${it.sheet.difficultyLevel})` : `[${it.customType || 'task'}] ${it.customTitle}`;
    const r = it.studentResponses[0];
    let status = it.status === 'completed' ? 'completed' : it._count.carriedTo ? 'not finished → carried over' : it.status.replace('_', ' ');
    if (r?.score != null) status += `, scored ${Math.round(r.score)}%`;
    else if (it.status === 'completed' && r) status += ', awaiting tutor marking';
    let line = `- ${name}: ${status}${it.carriedFromId ? ' (carried over from an earlier lesson)' : ''}${it.autoGenerated ? ' (auto follow-up)' : ''}`;
    // Which questions were wrong — the most useful signal for planning
    if (r && it.sheet?.contentJson?.questions) {
      const answers = r.responsesJson || {};
      const marks = answers._tutorMarks || {};
      // If the tutor marked it (live lesson), trust only their marks
      const tutorMarked = Object.keys(marks).length > 0;
      const wrong = it.sheet.contentJson.questions.filter(q => tutorMarked
        ? marks[q.id] === 'wrong'
        : hasAnswerKey(q) && q.type !== 'free_text' && !isAnswerCorrect(q, answers[q.id]));
      if (wrong.length) {
        line += `\n    wrong: ${wrong.slice(0, 5).map(q => {
          const given = answers[q.id];
          return `"${clip(q.prompt, 70)}" (answered ${given == null || given === '' ? 'nothing' : JSON.stringify(given).slice(0, 25)}, expected ${JSON.stringify((q.correct || q.correct_order || [])[0] ?? '').slice(0, 25)})`;
        }).join('; ')}${wrong.length > 5 ? `; +${wrong.length - 5} more` : ''}`;
      }
    }
    if (it.tutorNotes) line += `\n    tutor note: ${clip(it.tutorNotes, 160)}`;
    return line;
  }

  const ordered = [...sessions.values()].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const past = ordered.filter(s => new Date(s.scheduledAt) < now || s.attendedAt).slice(-8);
  const upcoming = ordered.filter(s => new Date(s.scheduledAt) >= now && !s.attendedAt);

  const parts = [];
  parts.push(`STUDENT: ${plan.student.name}, age ${plan.student.age ?? 'unknown'}, focus: ${plan.student.subjectFocus || 'not set'}. Tutor: ${plan.tutor.name}. Plan: "${plan.title}".`);
  if (plan.studentNotes) parts.push(`Note to student: ${clip(plan.studentNotes, 300)}`);
  const durations = past.map(s => s.durationMins).filter(Boolean);
  parts.push(`Typical lesson length: ${durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 60} minutes.`);

  parts.push(`\nPAST LESSONS (oldest → newest, last ${past.length}):`);
  if (!past.length) parts.push('(none yet — this is a new student; plan a diagnostic first lesson)');
  for (const s of past) {
    parts.push(`\n${fmtDate(s.scheduledAt)} — ${s.attendedAt ? 'attended' : 'no attendance recorded'}${s.notes ? `\n  session notes: ${clip(s.notes, 240)}` : ''}`);
    s.items.forEach(it => parts.push(describe(it)));
  }

  parts.push('\nALREADY PLANNED / UNSCHEDULED:');
  const pending = [...upcoming.flatMap(s => s.items.map(it => ({ it, when: fmtDate(s.scheduledAt) }))), ...unscheduled.filter(i => i.status !== 'completed').map(it => ({ it, when: 'unscheduled' }))];
  if (!pending.length) parts.push('(nothing)');
  pending.slice(0, 20).forEach(({ it, when }) => parts.push(`${describe(it)} [${when}]`));

  const done = items.filter(i => i.status === 'completed' && i.sheet).map(i => `#${i.sheet.id}${i.studentResponses[0]?.score != null ? `:${Math.round(i.studentResponses[0].score)}%` : ''}`);
  if (done.length) parts.push(`\nALL SHEETS COMPLETED SO FAR (id:score): ${done.join(', ')}`);

  const pendingSheetIds = pending.map(({ it }) => it.sheet?.id).filter(Boolean);
  const allUpcoming = await prisma.lessonSession.findMany({
    where: { lessonPlanId: planId, attendedAt: null, scheduledAt: { gte: now } },
    orderBy: { scheduledAt: 'asc' },
    take: 8,
    select: { id: true, scheduledAt: true },
  });
  return { text: parts.join('\n'), upcoming: allUpcoming, pendingSheetIds };
}

async function suggestLessons(planId, { lessons = 1, instructions = '' } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('AI planning is not configured (ANTHROPIC_API_KEY missing)');
    err.status = 503;
    throw err;
  }
  const count = Math.min(4, Math.max(1, Number(lessons) || 1));
  const [catalogue, ctx] = await Promise.all([libraryCatalogue(), studentContext(planId)]);

  const client = new Anthropic({ timeout: 55_000, maxRetries: 1 });
  const ask = () => client.messages.create({
    model: MODEL,
    max_tokens: 10000,
    system: [
      { type: 'text', text: SYSTEM },
      // The library is identical for every request — cache it
      { type: 'text', text: `WORKSHEET LIBRARY (id, level L1–L5, title):\n${catalogue.text}`, cache_control: { type: 'ephemeral' } },
    ],
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'propose_lessons' },
    messages: [{
      role: 'user',
      content: `${ctx.text}\n\nPlan the next ${count} lesson${count > 1 ? 's' : ''}.${instructions ? `\n\nTUTOR INSTRUCTIONS: ${clip(String(instructions), 800)}` : ''}`,
    }],
  });

  // Normalise either the flat shape (lessons + items) or a nested one
  function parse(res) {
    const tool = res.content.find(b => b.type === 'tool_use');
    if (res.stop_reason === 'max_tokens') return null; // cut off — retry
    if (process.env.PLANNER_DEBUG) console.error('[planner] stop', res.stop_reason, 'blocks', res.content.map(b => b.type), 'input', JSON.stringify(tool?.input).slice(0, 1500));
    if (!tool) return null;
    const out = repairToolInput(tool.input);
    const lessons = asArray(out.lessons);
    const flatItems = asArray(out.items);
    const grouped = lessons.map((l, idx) => {
      const n = Number(l.lesson) || idx + 1;
      const nested = asArray(l.items);
      return { goal: l.goal, tutorNotes: l.tutorNotes, items: nested.length ? nested : flatItems.filter(i => (Number(i.lesson) || 1) === n) };
    });
    // Items with no matching lesson entry still count (lesson goal unknown)
    if (!grouped.length && flatItems.length) {
      const max = Math.max(...flatItems.map(i => Number(i.lesson) || 1));
      for (let n = 1; n <= max; n++) grouped.push({ goal: `Lesson ${n}`, items: flatItems.filter(i => (Number(i.lesson) || 1) === n) });
    }
    return { assessment: typeof out.assessment === 'string' ? out.assessment : '', focusAreas: asArray(out.focusAreas), lessons: grouped, usage: res.usage };
  }

  const failures = [];
  const attempt = async () => {
    const res = await ask();
    const p = parse(res);
    if (!p || !p.lessons.some(l => l.items.length)) failures.push({ stop: res.stop_reason, input: res.content.find(b => b.type === 'tool_use')?.input });
    return p;
  };
  let parsed = await attempt();
  if (!parsed || !parsed.lessons.some(l => l.items.length)) parsed = await attempt(); // one retry
  if (failures.length) {
    // Keep the raw replies so a failure can be diagnosed without re-running (best effort)
    try { require('fs').appendFileSync(require('path').join(require('os').tmpdir(), 'redwood-planner-failures.jsonl'), JSON.stringify({ at: new Date().toISOString(), planId, failures }) + '\n'); } catch { /* read-only FS */ }
  }
  if (!parsed || !parsed.lessons.some(l => l.items.length)) {
    throw Object.assign(new Error('The AI didn\'t return a usable plan this time. Please try again.'), { status: 502 });
  }
  const out = parsed;
  const res = { usage: parsed.usage };

  // Keep only real sheets; look up titles for display
  const ids = [...new Set((out.lessons || []).flatMap(l => (l.items || []).map(i => i.sheetId)).filter(Boolean))];
  const sheets = await prisma.sheet.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, subject: true, topic: true, difficultyLevel: true, digitisedBy: true },
  });
  const byId = Object.fromEntries(sheets.map(s => [s.id, s]));
  const pending = new Set(ctx.pendingSheetIds);

  const lessonsOut = (out.lessons || []).slice(0, count).map(l => ({
    goal: l.goal,
    tutorNotes: l.tutorNotes || null,
    items: (l.items || []).map(i => {
      if (i.sheetId && pending.has(i.sheetId)) return null; // already in the plan
      if (i.sheetId && byId[i.sheetId]) {
        const s = byId[i.sheetId];
        return { sheetId: s.id, sheet: { ...s, needsReview: s.digitisedBy === 'text' || s.digitisedBy === 'vision_review', digitisedBy: undefined }, reason: i.reason, minutes: i.minutes || null };
      }
      if (i.customTitle) return { customTitle: clip(i.customTitle, 200), customType: CUSTOM_TYPES.includes(i.customType) ? i.customType : 'other', reason: i.reason, minutes: i.minutes || null };
      return null; // unknown sheet id — dropped
    }).filter(Boolean),
  }));

  return {
    assessment: out.assessment,
    focusAreas: out.focusAreas || [],
    lessons: lessonsOut,
    upcomingSessions: ctx.upcoming,
    usage: { input: res.usage.input_tokens, cached: res.usage.cache_read_input_tokens || 0, output: res.usage.output_tokens },
  };
}

module.exports = { suggestLessons, studentContext, libraryCatalogue };

#!/usr/bin/env node
// End-to-end API smoke test.
//
// Exercises every role (manager, tutor, student) against a RUNNING API and
// checks both the happy paths and the permission boundaries. All data it
// creates is namespaced (emails @qa.redwood.test, sheets titled "[QA] ...")
// and is deleted again at the end, even if tests fail.
//
// Usage (API must be running, e.g. `npm run dev:server`):
//   node server/scripts/smoke-test.js                     # http://localhost:3001/api
//   API_URL=https://example.com/api node server/scripts/smoke-test.js
//
// Needs DATABASE_URL (from server/.env) because it creates a temporary QA
// manager account directly and cleans up afterwards.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../src/prisma');
const { zonedParts, zonedToUtc } = require('../src/lib/time');
const { cleanupQa, QA_DOMAIN } = require('./qa-data');

const API = (process.env.API_URL || 'http://localhost:3001/api').replace(/\/$/, '');
const RUN = Date.now().toString(36);
const email = (name) => `${name}-${RUN}@${QA_DOMAIN}`;
const pw = () => `qa-${crypto.randomBytes(9).toString('base64url')}`;

let passed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; process.stdout.write(`  \x1b[32mok\x1b[0m ${name}\n`); }
  else { failures.push(name); process.stdout.write(`  \x1b[31mFAIL ${name}\x1b[0m${detail !== undefined ? `  → ${JSON.stringify(detail).slice(0, 300)}` : ''}\n`); }
}
function section(title) { process.stdout.write(`\n\x1b[1m${title}\x1b[0m\n`); }

async function call(token, method, path, body, { raw } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, data };
}
const as = (token) => ({
  get: (p) => call(token, 'GET', p),
  post: (p, b) => call(token, 'POST', p, b ?? {}),
  put: (p, b) => call(token, 'PUT', p, b ?? {}),
  patch: (p, b) => call(token, 'PATCH', p, b ?? {}),
  del: (p) => call(token, 'DELETE', p),
});
async function login(emailAddr, password) {
  const r = await call(null, 'POST', '/auth/login', { email: emailAddr, password });
  if (r.status !== 200) throw new Error(`Login failed for ${emailAddr}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.token;
}

async function main() {
  const health = await call(null, 'GET', '/health').catch(() => null);
  if (!health || health.status !== 200) {
    console.error(`API not reachable at ${API}. Start it first (npm run dev:server).`);
    process.exit(2);
  }
  console.log(`Smoke testing ${API}  (run ${RUN})`);

  // ── Setup: temporary QA manager, created directly in the DB ──────────────
  const mgrPw = pw();
  await prisma.user.create({
    data: { email: email('manager'), name: 'QA Manager', role: 'manager', passwordHash: await bcrypt.hash(mgrPw, 10) },
  });
  const M = as(await login(email('manager'), mgrPw));

  section('Auth & platform');
  check('health ok', health.data.status === 'ok');
  check('wrong password → 401', (await call(null, 'POST', '/auth/login', { email: email('manager'), password: 'nope' })).status === 401);
  check('unknown email → 401 (same message)', (await call(null, 'POST', '/auth/login', { email: email('ghost'), password: 'x' })).data?.error === 'Invalid credentials');
  check('no token → 401', (await call(null, 'GET', '/lesson-plans')).status === 401);
  check('garbage token → 401', (await call('abc.def.ghi', 'GET', '/lesson-plans')).status === 401);
  check('malformed JSON → 400', (await call(null, 'POST', '/auth/login', undefined, { raw: '{bad' })).status === 400);
  check('unknown API route → 404', (await call(null, 'GET', '/definitely-not-here')).status === 404);
  const me = await M.get('/auth/me');
  check('GET /auth/me returns manager', me.data?.role === 'manager');
  {
    const bogus = email('bruteforce');
    let last;
    for (let i = 0; i < 11; i++) last = await call(null, 'POST', '/auth/login', { email: bogus, password: 'guess' + i });
    check('11th failed login is rate-limited (429)', last.status === 429, last);
  }

  section('Manager: people');
  check('short password rejected', (await M.post('/users', { name: 'X', email: email('short'), password: 'abc', role: 'tutor' })).status === 400);
  check('invalid email rejected', (await M.post('/users', { name: 'X', email: 'not-an-email', password: 'longenough1' })).status === 400);
  const tutorPw = pw(), tutor2Pw = pw(), stuAPw = pw(), stuBPw = pw();
  const tutor = await M.post('/users', { name: 'QA Tutor', email: email('tutor'), password: tutorPw, role: 'tutor' });
  check('create tutor', tutor.status === 201, tutor.data);
  const tutor2 = await M.post('/users', { name: 'QA Tutor Two', email: email('tutor2'), password: tutor2Pw, role: 'tutor' });
  const stuA = await M.post('/users', { name: 'QA Student Alice', email: email('alice'), password: stuAPw, role: 'student', age: 9, subjectFocus: 'maths', lessonDays: [0, 3] });
  check('create student with lesson days', stuA.status === 201 && stuA.data.lessonDays.length === 2, stuA.data);
  const stuB = await M.post('/users', { name: 'QA Student Ben', email: email('ben'), password: stuBPw, role: 'student' });
  check('duplicate email → 400', (await M.post('/users', { name: 'Dup', email: email('ben'), password: 'longenough1' })).status === 400);
  check('bad lesson day rejected', (await M.put(`/users/${stuB.data.id}`, { lessonDays: [9] })).status === 400);
  const upd = await M.put(`/users/${stuB.data.id}`, { age: 11, lessonDays: [2] });
  check('update student profile', upd.status === 200 && upd.data.age === 11 && upd.data.lessonDays[0].dayOfWeek === 2, upd.data);

  section('Manager: sheets & rules');
  const sheetBody = {
    title: `[QA] Addition check ${RUN}`, subject: 'Maths', topic: 'Addition', difficultyLevel: 1, sheetType: 'worksheet', tags: ['qa'],
    contentJson: { questions: [
      { id: 'q1', type: 'fill_in_blank', prompt: '2 + 2 = ?', correct: ['4'], points: 1 },
      { id: 'q2', type: 'multiple_choice', prompt: 'Pick 10', options: ['5', '10'], correct: ['10'], points: 1 },
      { id: 'q3', type: 'free_text', prompt: 'Explain how you added', correct: [], points: 1 },
    ] },
  };
  check('invalid sheet rejected', (await M.post('/sheets', { ...sheetBody, difficultyLevel: 9 })).status === 400);
  const S1 = await M.post('/sheets', sheetBody);
  check('create sheet', S1.status === 201, S1.data);
  const S2 = await M.post('/sheets', { ...sheetBody, title: `[QA] Addition follow-up ${RUN}` });
  const rule = await M.post('/follow-up-rules', { triggerCondition: 'score < 60', sourceSheetId: S1.data.id, followUpSheetId: S2.data.id, priority: 1 });
  check('create follow-up rule', rule.status === 201, rule.data);

  section('Manager: lesson plan + recurring sessions');
  const now = zonedParts(new Date());
  const tomorrowDow = (new Date(Date.UTC(now.year, now.month0, now.day + 1)).getUTCDay() + 6) % 7; // 0 = Monday
  const planA = await M.post('/lesson-plans', {
    title: `[QA] Alice plan ${RUN}`, studentId: stuA.data.id, tutorId: tutor.data.id,
    status: 'active', lessonDayOfWeek: tomorrowDow, lessonTime: '17:00', studentNotes: 'Loves football',
  });
  check('create plan', planA.status === 201, planA.data);
  check('plan with student as tutor rejected', (await M.post('/lesson-plans', { title: 'x', studentId: stuA.data.id, tutorId: stuB.data.id })).status === 400);
  check('invalid lessonTime rejected', (await M.put(`/lesson-plans/${planA.data.id}`, { lessonTime: '25:00' })).status === 400);
  const planADetail = await M.get(`/lesson-plans/${planA.data.id}`);
  const sessions = planADetail.data.sessions || [];
  check('recurring sessions generated', sessions.length >= 4, sessions.length);
  const expectedFirst = zonedToUtc(now.year, now.month0, now.day + 1, 17, 0).toISOString();
  check('first session is tomorrow 17:00 UK time', sessions[0] && new Date(sessions[0].scheduledAt).toISOString() === expectedFirst, { got: sessions[0]?.scheduledAt, expectedFirst });
  const again = await M.get(`/lesson-plans/${planA.data.id}`);
  check('re-reading does not duplicate sessions', again.data.sessions.length === sessions.length);

  const nextSessionId = sessions[0].id;
  const itemS1 = await M.post(`/lesson-plans/${planA.data.id}/items`, { sheetId: S1.data.id, sessionId: nextSessionId, tutorNotes: 'PRIVATE: watch carrying' });
  check('add sheet item to next session', itemS1.status === 201 && itemS1.data.sessionId === nextSessionId, itemS1.data);
  const itemCustom = await M.post(`/lesson-plans/${planA.data.id}/items`, { customTitle: 'IXL: A.1 counting', customType: 'ixl_maths', sessionId: nextSessionId });
  check('add custom (IXL) item', itemCustom.status === 201, itemCustom.data);
  check('nonexistent sheet → 400', (await M.post(`/lesson-plans/${planA.data.id}/items`, { sheetId: 99999999 })).status === 400);

  const planB2 = await M.post('/lesson-plans', { title: `[QA] Ben w/ tutor2 ${RUN}`, studentId: stuB.data.id, tutorId: tutor2.data.id, status: 'active' });
  const itemB2 = await M.post(`/lesson-plans/${planB2.data.id}/items`, { sheetId: S1.data.id });

  section('Tutor');
  const T = as(await login(email('tutor'), tutorPw));
  const tUsers = await T.get('/users');
  check('tutor sees only students + self in /users', tUsers.status === 200 && tUsers.data.every(u => u.role === 'student' || u.id === tutor.data.id), tUsers.data?.map(u => u.role));
  check('tutor cannot view manager profile', (await T.get(`/users/${me.data.id}`)).status === 403);
  const benRow = tUsers.data.find(u => u.id === stuB.data.id);
  check("tutor gets no email for students they don't teach", benRow && benRow.email === undefined, benRow);
  check("tutor can't open profile of student they don't teach", (await T.get(`/users/${stuB.data.id}`)).status === 403);
  check('tutor can open own student profile', (await T.get(`/users/${stuA.data.id}`)).status === 200);
  check('tutor cannot create users', (await T.post('/users', { name: 'x', email: email('x'), password: 'longenough1' })).status === 403);
  const tPlans = await T.get('/lesson-plans');
  check('tutor sees only own plans', tPlans.data.length >= 1 && tPlans.data.every(p => p.tutorId === tutor.data.id));
  check("tutor cannot open another tutor's plan", (await T.get(`/lesson-plans/${planB2.data.id}`)).status === 403);
  check("tutor cannot add items to another tutor's plan", (await T.post(`/lesson-plans/${planB2.data.id}/items`, { customTitle: 'x' })).status === 403);
  const tPlan = await T.post('/lesson-plans', { title: `[QA] Ben by tutor ${RUN}`, studentId: stuB.data.id, tutorId: tutor2.data.id });
  check('tutor-created plan is forced to themselves', tPlan.status === 201 && tPlan.data.tutorId === tutor.data.id, tPlan.data);
  await T.put(`/lesson-plans/${tPlan.data.id}`, { tutorId: tutor2.data.id });
  check('tutor cannot reassign plan to another tutor', (await M.get(`/lesson-plans/${tPlan.data.id}`)).data.tutorId === tutor.data.id);
  const reset = await T.post(`/users/${stuA.data.id}/reset-password`, {});
  check('tutor resets own student password', reset.status === 200 && reset.data.newPassword?.length >= 8, reset.data);
  const stuAPw2 = reset.data.newPassword;
  check('tutor cannot reset manager password', (await T.post(`/users/${me.data.id}/reset-password`, {})).status === 403);
  check('tutor cannot reset tutor password', (await T.post(`/users/${tutor2.data.id}/reset-password`, {})).status === 403);
  check('tutor cannot delete plans', (await T.del(`/lesson-plans/${planA.data.id}`)).status === 403);
  check('tutor can read follow-up rules', (await T.get('/follow-up-rules')).status === 200);
  check('tutor cannot edit follow-up rules', (await T.post('/follow-up-rules', {})).status === 403);

  section('Student');
  check('old password no longer works after reset', (await call(null, 'POST', '/auth/login', { email: email('alice'), password: stuAPw })).status === 401);
  const Stoken = await login(email('alice'), stuAPw2);
  const S = as(Stoken);
  check('student cannot list users', (await S.get('/users')).status === 403);
  check('student cannot view other student', (await S.get(`/users/${stuB.data.id}`)).status === 403);
  check('student can view self', (await S.get(`/users/${stuA.data.id}`)).status === 200);
  const sPlans = await S.get('/lesson-plans');
  check('student sees only own plans', sPlans.data.length === 1 && sPlans.data[0].studentId === stuA.data.id);
  check('student plan hides tutor notes', sPlans.data[0].items.every(i => i.tutorNotes === undefined));
  check('plan payload has no answer keys', !JSON.stringify(sPlans.data).includes('"correct"'));
  check("student cannot open another student's plan", (await S.get(`/lesson-plans/${planB2.data.id}`)).status === 403);
  const sheetForStudent = await S.get(`/sheets/${S1.data.id}`);
  check('sheet answers hidden before submitting', sheetForStudent.data.contentJson.questions.every(q => q.correct === undefined), sheetForStudent.data.contentJson.questions);
  check('multi-select flag survives stripping', sheetForStudent.data.contentJson.questions[1].multi === false);
  check('student cannot create sheets', (await S.post('/sheets', sheetBody)).status === 403);
  check('student cannot download original packs', (await S.get(`/lesson-plans/${planA.data.id}/originals?session=all`)).status === 403);
  check('student cannot download a day print run', (await S.get('/sessions/originals?date=2026-01-01')).status === 403);
  check('student cannot use the AI planner', (await S.post(`/lesson-plans/${planA.data.id}/ai-plan`, {})).status === 403);
  check('student cannot edit plans', (await S.put(`/lesson-plans/${planA.data.id}`, { title: 'hacked' })).status === 403);
  check("student cannot submit on another student's item", (await S.post('/student-responses', { lessonPlanItemId: itemB2.data.id, responsesJson: { q1: '4' } })).status === 403);
  check('student cannot submit on custom item', (await S.post('/student-responses', { lessonPlanItemId: itemCustom.data.id, responsesJson: {} })).status === 400);
  const lenient = await S.post('/student-responses', { lessonPlanItemId: (await M.post(`/lesson-plans/${planA.data.id}/items`, { sheetId: S2.data.id })).data.id, responsesJson: { q1: ' 4. ', q2: ['10'] } });
  check('marking is lenient about formatting (" 4. " = "4")', lenient.data.score === 100, lenient.data.score);
  const submit = await S.post('/student-responses', { lessonPlanItemId: itemS1.data.id, responsesJson: { q1: '5', q2: ['10'], q3: 'I counted' }, timeSpentSeconds: 95, manualScore: 100, studentId: stuB.data.id });
  check('student submits sheet', submit.status === 201, submit.data);
  check('score auto-marked 50% (free text excluded, manualScore ignored)', submit.data.score === 50, submit.data.score);
  check('response attributed to the plan student, not client studentId', submit.data.studentId === stuA.data.id);
  const done = await S.post(`/lesson-plans/${planA.data.id}/process-completion`, { lessonPlanItemId: itemS1.data.id, studentResponseId: submit.data.id });
  check('completion triggers follow-up (score < 60)', done.status === 200 && done.data.followUpCreated === true, done.data);
  check('follow-up lands in the same session', done.data.followUpItem?.sessionId === nextSessionId, done.data.followUpItem);
  const done2 = await S.post(`/lesson-plans/${planA.data.id}/process-completion`, { lessonPlanItemId: itemS1.data.id, studentResponseId: submit.data.id });
  check('process-completion is idempotent', done2.data.alreadyCompleted === true && !done2.data.followUpCreated, done2.data);
  const sheetAfter = await S.get(`/sheets/${S1.data.id}`);
  check('answers visible for review after submitting', sheetAfter.data.contentJson.questions[0].correct?.[0] === '4');
  const myResponses = await S.get(`/student-responses?studentId=${stuB.data.id}`);
  check("student can't read other students' responses", myResponses.data.every(r => r.studentId === stuA.data.id));
  check('student sees own session list without notes', (await S.get('/sessions')).data.every(s => s.notes === undefined));

  section('Live lesson');
  const liveT = await T.get(`/lesson-plans/${planA.data.id}/live-session`);
  check('tutor opens live lesson (session for today)', liveT.status === 200 && !!liveT.data.sessionId, liveT.data);
  const liveS = await S.get(`/lesson-plans/${planA.data.id}/live-session`);
  check('student joins the same session', liveS.data.sessionId === liveT.data.sessionId, liveS.data);
  const sid = liveT.data.sessionId;
  const liveItem = await T.post(`/lesson-plans/${planA.data.id}/items`, { sheetId: S1.data.id, sessionId: sid });
  check('student cannot change active sheet', (await S.patch(`/sessions/${sid}/live-state`, { activeItemId: liveItem.data.id })).status === 403);
  check('tutor cannot set item from another plan', (await T.patch(`/sessions/${sid}/live-state`, { activeItemId: itemB2.data.id })).status === 400);
  check('tutor sets active sheet', (await T.patch(`/sessions/${sid}/live-state`, { activeItemId: liveItem.data.id })).status === 200);
  check('answers require itemId', (await S.patch(`/sessions/${sid}/live-state`, { answers: { q1: '4' } })).status === 400);
  // Fired concurrently, like a child tabbing quickly between boxes
  await Promise.all([
    S.patch(`/sessions/${sid}/live-state`, { itemId: liveItem.data.id, answers: { q1: '4' } }),
    S.patch(`/sessions/${sid}/live-state`, { itemId: liveItem.data.id, answers: { q2: ['5'] } }),
    S.patch(`/sessions/${sid}/live-state`, { itemId: liveItem.data.id, answers: { q3: 'counted on' } }),
  ]);
  check('tutor cannot type student answers', (await T.patch(`/sessions/${sid}/live-state`, { itemId: liveItem.data.id, answers: { q1: 'x' } })).status === 403);
  check('student cannot mark', (await S.patch(`/sessions/${sid}/live-state`, { itemId: liveItem.data.id, marks: { q1: 'correct' } })).status === 403);
  await T.patch(`/sessions/${sid}/live-state`, { itemId: liveItem.data.id, marks: { q1: 'correct', q2: 'wrong', q3: 'correct' } });
  const state = await T.get(`/sessions/${sid}/live-state`);
  const la = state.data.liveAnswers?.[liveItem.data.id] || {};
  check('concurrent live answers all kept', la.q1 === '4' && Array.isArray(la.q2) && la.q3 === 'counted on', state.data.liveAnswers);
  check('student cannot finalize', (await S.post(`/sessions/${sid}/finalize-item`, { itemId: liveItem.data.id })).status === 403);
  const fin = await T.post(`/sessions/${sid}/finalize-item`, { itemId: liveItem.data.id });
  check('tutor saves live result (score from marks = 67%)', fin.status === 200 && fin.data.score === 67, fin.data);
  check('student cannot answer a finished sheet', (await S.patch(`/sessions/${sid}/live-state`, { itemId: liveItem.data.id, answers: { q1: 'x' } })).status === 409);
  await T.patch(`/sessions/${sid}/live-state`, { itemId: liveItem.data.id, marks: { q1: 'correct', q2: 'correct', q3: 'correct' } });
  const fin2 = await T.post(`/sessions/${sid}/finalize-item`, { itemId: liveItem.data.id });
  const liveResps = (await T.get(`/student-responses?lessonPlanItemId=${liveItem.data.id}`)).data;
  check('re-saving a live result updates it (no duplicate)', fin2.data.score === 100 && liveResps.length === 1 && liveResps[0].score === 100, liveResps);
  const afterFin = await T.get(`/lesson-plans/${planA.data.id}`);
  check('live item marked completed', afterFin.data.items.find(i => i.id === liveItem.data.id)?.status === 'completed');

  section('Sessions & carryover');
  const upcoming = afterFin.data.sessions.filter(s => new Date(s.scheduledAt) > new Date());
  const [first, second] = upcoming;
  check('student cannot edit sessions', (await S.put(`/sessions/${first.id}`, { notes: 'x' })).status === 403);
  check('invalid duration rejected', (await T.put(`/sessions/${first.id}`, { durationMins: 9999 })).status === 400);
  const attend = await T.put(`/sessions/${first.id}`, { attendedAt: new Date().toISOString(), durationMins: 60, notes: 'PRIVATE session note' });
  check('mark session attended', attend.status === 200, attend.data);
  const afterCarry = await T.get(`/lesson-plans/${planA.data.id}`);
  const origCustom = afterCarry.data.items.find(i => i.id === itemCustom.data.id);
  const clones = afterCarry.data.items.filter(i => i.carriedFromId === itemCustom.data.id);
  check('incomplete item stays on the past session (history)', origCustom.sessionId === first.id);
  check('incomplete item cloned to the next session', clones.length === 1 && clones[0].sessionId === second.id, clones);
  await T.post(`/sessions/${first.id}/carryover`);
  const afterCarry2 = await T.get(`/lesson-plans/${planA.data.id}`);
  check('carryover does not duplicate clones', afterCarry2.data.items.filter(i => i.carriedFromId === itemCustom.data.id).length === 1);
  check('carried original is flagged (_count.carriedTo)', afterCarry2.data.items.find(i => i.id === itemCustom.data.id)?._count?.carriedTo === 1);
  await T.put(`/lesson-plans/${planA.data.id}/items/${itemCustom.data.id}`, { status: 'completed' });
  const afterLate = await T.get(`/lesson-plans/${planA.data.id}`);
  check('finishing the original late removes its unused copy', afterLate.data.items.filter(i => i.carriedFromId === itemCustom.data.id).length === 0);

  const sessBefore = afterLate.data.sessions.filter(s => new Date(s.scheduledAt) > new Date());
  const victim = sessBefore[2];
  await T.del(`/sessions/${victim.id}`);
  await T.put(`/lesson-plans/${planA.data.id}`, { title: `[QA] Alice plan ${RUN} (renamed)` });
  const afterDel = await T.get(`/lesson-plans/${planA.data.id}`);
  check('deleted recurring session is not recreated on save/read', !afterDel.data.sessions.some(s => s.scheduledAt === victim.scheduledAt));
  const moved = sessBefore[3];
  const newTime = new Date(new Date(moved.scheduledAt).getTime() + 86400000).toISOString();
  await T.put(`/sessions/${moved.id}`, { scheduledAt: newTime });
  const afterMove = await T.get(`/lesson-plans/${planA.data.id}`);
  check('moved session is not recreated at its old time', !afterMove.data.sessions.some(s => s.scheduledAt === moved.scheduledAt));
  const dateKey = new Date(first.scheduledAt).toISOString().slice(0, 10);
  const byDate = await T.get(`/sessions?date=${dateKey}`);
  check('sessions filter by date', byDate.status === 200 && byDate.data.some(s => s.id === first.id));
  check('bad date filter rejected', (await T.get('/sessions?date=notadate')).status === 400);
  check('student hidden from session notes', (await S.get('/sessions')).data.every(s => s.notes === undefined));

  section('Sheet memory & scheduling');
  const hist = await T.get(`/lesson-plans/${planA.data.id}/sheet-history`);
  check('sheet history remembers completed sheets with score', hist.status === 200 && hist.data[S1.data.id]?.completed >= 1 && hist.data[S1.data.id]?.lastScore != null, hist.data[S1.data.id]);
  check('student cannot read sheet history', (await S.get(`/lesson-plans/${planA.data.id}/sheet-history`)).status === 403);
  {
    const d = await T.get(`/lesson-plans/${planA.data.id}`);
    const future = d.data.sessions.filter(x => !x.attendedAt && new Date(x.scheduledAt) > new Date());
    const [c1, c2] = future;
    const cancelItem = await T.post(`/lesson-plans/${planA.data.id}/items`, { customTitle: 'QA cancel test task', sessionId: c1.id });
    const cancel = await T.post(`/sessions/${c1.id}/cancel`, { moveWork: 'next' });
    check('cancel lesson moves its work to the next lesson', cancel.status === 200 && cancel.data.deleted && cancel.data.movedTo?.id === c2.id, cancel.data);
    const moved = (await T.get(`/lesson-plans/${planA.data.id}`)).data.items.find(i => i.id === cancelItem.data.id);
    check('moved item now sits in the next lesson', moved?.sessionId === c2.id, moved);
    const [, , c3] = future;
    const clash = await T.put(`/sessions/${c3.id}`, { scheduledAt: new Date(new Date(c2.scheduledAt).getTime() + 3600000).toISOString() });
    check('rescheduling onto a day with a lesson asks first (409)', clash.status === 409 && clash.data.conflict?.id === c2.id, clash.data);
    const merge = await T.put(`/sessions/${c3.id}`, { scheduledAt: new Date(new Date(c2.scheduledAt).getTime() + 3600000).toISOString(), merge: true });
    check('confirming merges the two lessons', merge.status === 200 && merge.data.merged && merge.data.mergedInto === c2.id, merge.data);
  }

  section('Recording a past lesson');
  {
    const when = new Date(Date.now() - 10 * 86400000); when.setUTCHours(16, 0, 0, 0);
    const past = await T.post(`/lesson-plans/${planA.data.id}/past-lesson`, {
      scheduledAt: when.toISOString(), durationMins: 60, notes: 'Worked hard on fractions',
      items: [
        { sheetId: S2.data.id, done: true, score: 80 },
        { customTitle: 'IXL, Level G, F.2, Literary devices, 25 questions', customType: 'ixl_english', done: true },
        { customTitle: 'Corbett Maths, nth term, Q.20-31', customType: 'paper', done: false },
      ],
    });
    check('record a past lesson with scores', past.status === 201 && past.data.added === 3, past.data);
    check('unfinished work from it carries to the next lesson', past.data.carriedOver === 1, past.data);
    const h2 = (await T.get(`/lesson-plans/${planA.data.id}/sheet-history`)).data;
    check('sheet memory sees the past lesson score', h2[S2.data.id]?.completed >= 1, h2[S2.data.id]);
    check('future dates are rejected for past lessons', (await T.post(`/lesson-plans/${planA.data.id}/past-lesson`, { scheduledAt: new Date(Date.now() + 5 * 86400000).toISOString(), items: [{ customTitle: 'x' }] })).status === 400);
    check('students cannot record past lessons', (await S.post(`/lesson-plans/${planA.data.id}/past-lesson`, { scheduledAt: when.toISOString(), items: [{ customTitle: 'x' }] })).status === 403);
    const paperDone = await T.post('/student-responses', { lessonPlanItemId: (await T.post(`/lesson-plans/${planA.data.id}/items`, { sheetId: S1.data.id })).data.id, responsesJson: { _tutorGraded: true } });
    check('marking a sheet done on paper without a score is not 0%', paperDone.status === 201 && paperDone.data.score === null, paperDone.data);
  }

  section('Group sessions');
  {
    const d = await T.get(`/lesson-plans/${planA.data.id}`);
    const base = new Date(Date.now() + 20 * 86400000); base.setUTCHours(15, 0, 0, 0);
    const grp = await M.post('/groups', { title: `[QA] Year 3 Maths ${RUN}`, tutorId: tutor.data.id, scheduledAt: base.toISOString(), durationMins: 60, location: 'Retford', repeatWeeks: 1, studentIds: [stuA.data.id, stuB.data.id] });
    check('manager creates a weekly group with 2 students', grp.status === 201 && grp.data.occurrences === 2 && grp.data.members.length === 2, grp.data);
    const gid = grp.data.id;
    check('group tutor can open the group', (await T.get(`/groups/${gid}`)).status === 200);
    const otherTutor = as(await login(email('tutor2'), tutor2Pw));
    check("another tutor can't open it", (await otherTutor.get(`/groups/${gid}`)).status === 403);
    check('students cannot see groups', (await S.get(`/groups/${gid}`)).status === 403);
    const benPlanId = grp.data.members.find(m => m.student.id === stuB.data.id)?.planId;
    check('group tutor can see a group student taught by someone else', (await T.get(`/lesson-plans/${benPlanId}`)).status === 200);
    const listed = await T.get(`/groups?from=${new Date().toISOString()}`);
    check('tutor sees their groups in the list', listed.data.some(g => g.id === gid));
    const moved = await T.put(`/groups/${gid}`, { scheduledAt: new Date(base.getTime() + 86400000).toISOString() });
    const memberTimes = (await T.get(`/groups/${gid}`)).data.members.map(m => m.sessionId);
    const sessions = (await T.get(`/sessions?from=${new Date(base.getTime() + 86000000).toISOString()}&to=${new Date(base.getTime() + 87000000).toISOString()}`)).data;
    check('rescheduling the group moves every student', moved.status === 200 && memberTimes.every(id => sessions.some(s => s.id === id)), { memberTimes, got: sessions.map(s => s.id) });
    const att = await T.post(`/groups/${gid}/attendance`, { present: [stuA.data.id] });
    check('group attendance marks the present student', att.status === 200 && att.data.members.find(m => m.student.id === stuA.data.id)?.attendedAt, att.data.members);
    const pack = await T.get(`/groups/${gid}/originals`);
    check('group print run builds (cover per child)', pack.status === 200 && pack.data.pages >= 2, pack.data);
    const rm = await T.del(`/groups/${gid}/members/${stuB.data.id}`);
    check('remove a student from the group', rm.status === 200 && rm.data.removed === 1);
    const series = grp.data.seriesId;
    const next = (await T.get(`/groups?from=${new Date(base.getTime() + 3 * 86400000).toISOString()}`)).data.find(g => g.seriesId === series);
    const cancel = await T.post(`/groups/${next.id}/cancel`, { moveWork: 'next' });
    check('cancel a group occurrence', cancel.status === 200 && cancel.data.occurrences === 1, cancel.data);
    check('deleting a tutor who leads upcoming groups is blocked', (await M.del(`/users/${tutor.data.id}`)).status === 409);
  }

  section('Data integrity guards');
  check('item with student work cannot be deleted', (await T.del(`/lesson-plans/${planA.data.id}/items/${itemS1.data.id}`)).status === 409);
  check('sheet in use cannot be deleted', (await M.del(`/sheets/${S1.data.id}`)).status === 409);
  check('tutor with plans cannot be deleted', (await M.del(`/users/${tutor.data.id}`)).status === 409);
  check('manager accounts cannot be deleted via API', (await M.del(`/users/${me.data.id}`)).status === 400);
  check('invalid id → 400', (await M.get('/lesson-plans/abc')).status === 400);
  check('missing plan → 404', (await M.get('/lesson-plans/99999999')).status === 404);
  const logs = await T.get('/follow-up-rules/logs');
  check('tutor sees follow-up log for own student', logs.data.some(l => l.lessonPlan.id === planA.data.id));
  const t2 = as(await login(email('tutor2'), tutor2Pw));
  check("other tutor can't download another tutor's originals", (await t2.get(`/lesson-plans/${planA.data.id}/originals?session=all`)).status === 403);
  check('print run rejects a bad date', (await T.get('/sessions/originals?date=tomorrow')).status === 400);
  check("other tutor can't AI-plan someone else's student", (await t2.post(`/lesson-plans/${planA.data.id}/ai-plan`, {})).status === 403);
  check("other tutor doesn't see that log", (await t2.get('/follow-up-rules/logs')).data.every(l => l.lessonPlan.id !== planA.data.id));
  const stats = await T.get('/users/students');
  const aliceRow = stats.data.find(s => s.id === stuA.data.id);
  check('tutor dashboard stats include Alice', !!aliceRow && aliceRow.plan?.id === planA.data.id, aliceRow);

  section('Manager deletes');
  const delPlan = await M.del(`/lesson-plans/${tPlan.data.id}`);
  check('manager deletes a plan', delPlan.status === 200);
  const delStu = await M.del(`/users/${stuB.data.id}`);
  check('manager deletes a student with history', delStu.status === 200, delStu.data);
}

const cleanup = () => cleanupQa(RUN);

main()
  .catch(err => { failures.push(`CRASH: ${err.message}`); console.error('\n', err); })
  .finally(async () => {
    try {
      const removed = await cleanup();
      console.log(`\nCleaned up QA data: ${JSON.stringify(removed)}`);
    } catch (e) {
      console.error('\nCLEANUP FAILED — remove @qa.redwood.test users / [QA] sheets manually:', e.message);
    }
    await prisma.$disconnect();
    console.log(`\n${passed} passed, ${failures.length} failed`);
    if (failures.length) { console.log(failures.map(f => `  - ${f}`).join('\n')); process.exit(1); }
  });

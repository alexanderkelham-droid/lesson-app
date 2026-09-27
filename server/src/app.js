// Express app factory — exported without app.listen() so it can be reused
// by both local dev (`index.js`) and Vercel serverless (`api/index.js`).
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const sheetRoutes = require('./routes/sheets');
const lessonPlanRoutes = require('./routes/lessonPlans');
const studentResponseRoutes = require('./routes/studentResponses');
const followUpRuleRoutes = require('./routes/followUpRules');
const sessionRoutes = require('./routes/sessions');
const groupRoutes = require('./routes/groups');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set — the API cannot sign or verify logins');
}
if (process.env.JWT_SECRET.length < 32) {
  console.warn('WARNING: JWT_SECRET is shorter than 32 characters; use a long random value in production');
}

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

const app = express();
app.set('trust proxy', 1); // correct req.ip behind Vercel / reverse proxies
app.disable('x-powered-by');

// CORS: frontend and API are served from the same origin on Vercel, so CORS
// isn't strictly required. We allow:
//   - Any explicit CLIENT_URL values (comma-separated, for custom domains)
//   - This deployment's own Vercel URLs (VERCEL_URL / VERCEL_BRANCH_URL)
//   - localhost on any port, outside production only
// Auth is via JWT bearer tokens, not cookies, so credentials:false is safe.
const explicitOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin / curl / non-browser clients
  if (explicitOrigins.includes(origin)) return true;
  try {
    const u = new URL(origin);
    if (!isProduction && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
    const ownHosts = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean);
    if (ownHosts.includes(u.hostname)) return true;
  } catch { /* invalid URL */ }
  return false;
}

app.use(cors({
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
}));
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/sheets', sheetRoutes);
app.use('/api/lesson-plans', lessonPlanRoutes);
app.use('/api/student-responses', studentResponseRoutes);
app.use('/api/follow-up-rules', followUpRuleRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/groups', groupRoutes);

// Health + which optional features are configured (booleans only, never values)
app.get('/api/health', (req, res) => res.json({
  status: 'ok',
  features: {
    ai: !!process.env.ANTHROPIC_API_KEY,
    originalsStorage: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    localWorksheets: !!process.env.WORKSHEETS_DIR,
  },
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  // Malformed JSON body
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  if (err.message === 'Not allowed by CORS') return res.status(403).json({ error: 'Origin not allowed' });

  const status = err.status || 500;
  if (status >= 500) console.error(err.stack || err);
  // Never leak internal error details (SQL, stack traces) in production
  const message = status >= 500 && isProduction ? 'Internal server error' : (err.message || 'Internal server error');
  res.status(status).json({ error: message });
});

module.exports = app;

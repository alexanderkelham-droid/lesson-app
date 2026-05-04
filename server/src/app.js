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

const app = express();

// CORS: frontend and API are served from the same origin on Vercel, so CORS
// isn't strictly required. We allow:
//   - Any *.vercel.app domain (covers production + preview deploys)
//   - Any explicit CLIENT_URL values (comma-separated, for custom domains)
//   - localhost on any port (for local dev)
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
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    if (u.hostname.endsWith('.vercel.app')) return true;
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

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

module.exports = app;

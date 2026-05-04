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

// CORS: in production we serve frontend + API from the same Vercel origin so
// CORS isn't strictly needed, but allow CLIENT_URL for local dev / staging.
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
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

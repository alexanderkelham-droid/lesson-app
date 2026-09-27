const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Simple in-memory brute-force protection: max 10 failed attempts per
// IP+email in 15 minutes. (Per serverless instance — good enough to stop
// casual guessing; put a WAF / Vercel firewall rule in front for more.)
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map();

function failureKey(req, email) {
  return `${req.ip}|${email}`;
}
function isLocked(key) {
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) { failures.delete(key); return false; }
  return entry.count >= MAX_FAILURES;
}
function recordFailure(key) {
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || now - entry.first > WINDOW_MS) failures.set(key, { count: 1, first: now });
  else entry.count++;
  if (failures.size > 10_000) failures.clear(); // bound memory
}

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { password } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const key = failureKey(req, email);
    if (isLocked(key)) {
      return res.status(429).json({ error: 'Too many failed attempts. Please wait 15 minutes and try again.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user ? await bcrypt.compare(String(password), user.passwordHash) : false;
    if (!valid) {
      recordFailure(key);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    failures.delete(key);

    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '60d' }
    );

    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) { next(err); }
});

module.exports = router;

#!/usr/bin/env node
// Safely set a user's password, or create a manager account. Touches only
// that one user — never deletes anything.
//
//   node server/scripts/set-password.js --email magda@example.com --password "NewPass123"
//   node server/scripts/set-password.js --email new@example.com --password "…" --create-manager --name "New Manager"

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const prisma = require('../src/prisma');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = (arg('email') || '').trim().toLowerCase();
  const password = arg('password') || '';
  const create = process.argv.includes('--create-manager');
  if (!email || password.length < 8) {
    throw new Error('Usage: --email <email> --password <at least 8 chars> [--create-manager --name "Name"]');
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({ where: { email }, data: { passwordHash } });
    console.log(`Password updated for ${email} (${existing.role}).`);
  } else if (create) {
    await prisma.user.create({ data: { email, passwordHash, name: arg('name') || 'Manager', role: 'manager' } });
    console.log(`Manager account created: ${email}`);
  } else {
    throw new Error(`No user with email ${email}. Add --create-manager to create a manager account.`);
  }
}

main()
  .catch(e => { console.error(e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

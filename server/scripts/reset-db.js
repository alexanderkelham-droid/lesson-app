#!/usr/bin/env node

/**
 * reset-db.js
 *
 * Wipes all demo/test data while keeping the sheet library intact, then
 * seeds a fresh manager account.
 *
 * What it KEEPS:
 *  - sheets table (the 1,200+ worksheets)
 *  - sheet content_json
 *
 * What it DELETES:
 *  - All users (students, tutors, managers — including demo accounts)
 *  - All lesson plans, items, sessions, student responses
 *  - All student lesson days
 *  - All follow-up rules and logs
 *
 * What it CREATES:
 *  - One manager account using credentials from CLI args or env
 *
 * Usage:
 *   node scripts/reset-db.js --email manager@redwoodscholars.co.uk --password "ChangeMe!" --name "Sarah Manager"
 *
 *   Or via env:
 *   MANAGER_EMAIL=...  MANAGER_PASSWORD=...  MANAGER_NAME=...  node scripts/reset-db.js
 *
 *   Add --keep-current-users to skip user deletion (only wipe plans/sessions/responses).
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    email: process.env.MANAGER_EMAIL,
    password: process.env.MANAGER_PASSWORD,
    name: process.env.MANAGER_NAME || 'Manager',
    keepUsers: false,
    yes: false,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email') opts.email = args[++i];
    else if (args[i] === '--password') opts.password = args[++i];
    else if (args[i] === '--name') opts.name = args[++i];
    else if (args[i] === '--keep-current-users') opts.keepUsers = true;
    else if (args[i] === '--yes' || args[i] === '-y') opts.yes = true;
  }
  return opts;
}

async function confirm(message) {
  if (process.argv.includes('--yes') || process.argv.includes('-y')) return true;
  process.stdout.write(message + ' Type "yes" to continue: ');
  return new Promise(resolve => {
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', data => {
      resolve(data.trim().toLowerCase() === 'yes');
      process.stdin.pause();
    });
  });
}

async function main() {
  const opts = parseArgs();

  if (!opts.email || !opts.password) {
    console.error('ERROR: --email and --password are required (or set MANAGER_EMAIL / MANAGER_PASSWORD in env)');
    console.error('       Run with --keep-current-users to skip seeding a fresh manager.');
    process.exit(1);
  }

  // Show current state
  const stats = await Promise.all([
    prisma.user.count(),
    prisma.lessonPlan.count(),
    prisma.lessonPlanItem.count(),
    prisma.lessonSession.count(),
    prisma.studentResponse.count(),
    prisma.followUpLog.count(),
    prisma.followUpRule.count(),
    prisma.studentLessonDay.count(),
    prisma.sheet.count(),
  ]);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Current database state');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Users:                 ${stats[0]}`);
  console.log(`  Lesson plans:          ${stats[1]}`);
  console.log(`  Lesson plan items:     ${stats[2]}`);
  console.log(`  Lesson sessions:       ${stats[3]}`);
  console.log(`  Student responses:     ${stats[4]}`);
  console.log(`  Follow-up logs:        ${stats[5]}`);
  console.log(`  Follow-up rules:       ${stats[6]}`);
  console.log(`  Student lesson days:   ${stats[7]}`);
  console.log(`  Sheets (KEPT):         ${stats[8]}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('  This will DELETE everything except sheets, then');
  console.log(`  create a fresh manager account: ${opts.email}`);
  console.log('');

  const ok = await confirm('  Are you sure?');
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }

  console.log('\nResetting database...');

  // Delete in correct order to respect FK constraints
  await prisma.followUpLog.deleteMany({});
  console.log('  ✓ Cleared follow-up logs');

  await prisma.studentResponse.deleteMany({});
  console.log('  ✓ Cleared student responses');

  await prisma.lessonSession.deleteMany({});
  console.log('  ✓ Cleared lesson sessions');

  await prisma.lessonPlanItem.deleteMany({});
  console.log('  ✓ Cleared lesson plan items');

  await prisma.lessonPlan.deleteMany({});
  console.log('  ✓ Cleared lesson plans');

  await prisma.studentLessonDay.deleteMany({});
  console.log('  ✓ Cleared student lesson days');

  await prisma.followUpRule.deleteMany({});
  console.log('  ✓ Cleared follow-up rules');

  if (!opts.keepUsers) {
    await prisma.user.deleteMany({});
    console.log('  ✓ Cleared all users');
  } else {
    console.log('  ↷ Kept existing users (--keep-current-users)');
  }

  // Seed fresh manager
  const passwordHash = await bcrypt.hash(opts.password, 10);
  const manager = await prisma.user.create({
    data: {
      email: opts.email.toLowerCase(),
      passwordHash,
      name: opts.name,
      role: 'manager',
    },
    select: { id: true, email: true, name: true, role: true },
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✓ Database reset complete');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Manager account created:`);
  console.log(`    Email:    ${manager.email}`);
  console.log(`    Name:     ${manager.name}`);
  console.log(`    Password: (the one you set)`);
  console.log('');
  console.log(`  Sheets retained: ${stats[8]}`);
  console.log('');
  console.log('  Sign in to the portal and start adding tutors and students.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await prisma.$disconnect();
}

main().catch(async err => {
  console.error('Fatal error:', err);
  await prisma.$disconnect();
  process.exit(1);
});

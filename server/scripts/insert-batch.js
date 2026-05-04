#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const sheetsToInsert = JSON.parse(process.argv[2] || '[]');
  let created = 0;
  for (const sheet of sheetsToInsert) {
    try {
      const record = await prisma.sheet.create({ data: sheet });
      console.log(`Created Sheet #${record.id}: ${record.title}`);
      created++;
    } catch (err) {
      console.error(`Failed to insert "${sheet.title}": ${err.message}`);
    }
  }
  console.log(`\nDone: ${created}/${sheetsToInsert.length} sheets created.`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

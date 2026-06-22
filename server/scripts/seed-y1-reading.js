#!/usr/bin/env node

/**
 * seed-y1-reading.js
 *
 * Inserts a Year 1 reading comprehension sheet into the DB.
 * Includes a short story (Spot the Puppy) with emoji illustrations
 * and 5 mixed-type comprehension questions.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const passage = `🐶 Spot the Puppy

Spot is a happy little puppy. He has brown spots on his white fur. He lives with a boy named Tom in a small house with a big garden. 🏡

Every morning, Spot wakes up before Tom. He runs to the bedroom door and barks. Woof! Woof! "Wake up, Tom!" Tom opens his eyes and smiles at Spot.

After breakfast, Tom puts on his red coat. Spot jumps up and down because he knows they are going to the park! 🌳

In the park, Tom throws a yellow ball. Spot runs as fast as he can. He brings the ball back to Tom. They play this game many times.

Then it starts to rain. ☔ Tom and Spot run all the way home. They are very wet!

At home, Tom dries Spot with a soft towel. Then they sit together by the warm fire. Spot falls asleep on Tom's lap. He is a very happy puppy. 💤`;

const contentJson = {
  passage,
  questions: [
    {
      id: 'q1',
      type: 'fill_in_blank',
      prompt: '🐶  What is the name of the puppy in the story?',
      correct: ['Spot', 'spot'],
      points: 1
    },
    {
      id: 'q2',
      type: 'multiple_choice',
      prompt: '🎨  What colour is the ball in the park?',
      options: ['Red', 'Blue', 'Green', 'Yellow'],
      correct: ['Yellow'],
      points: 1
    },
    {
      id: 'q3',
      type: 'multiple_choice',
      prompt: '☔  Why do Tom and Spot run home?',
      options: ['They are tired', 'It starts to rain', 'Spot is hungry', 'Tom needs a nap'],
      correct: ['It starts to rain'],
      points: 1
    },
    {
      id: 'q4',
      type: 'fill_in_blank',
      prompt: '🌳  Where do Tom and Spot go to play?',
      correct: ['the park', 'park', 'The park'],
      points: 1
    },
    {
      id: 'q5',
      type: 'free_text',
      prompt: '💭  How do you think Spot feels at the end of the story? Why?',
      correct: [],
      points: 2
    }
  ]
};

async function main() {
  console.log('Inserting Y1 reading comprehension sheet...');

  // Avoid duplicates
  const existing = await prisma.sheet.findFirst({
    where: { title: 'Spot the Puppy — Reading Comprehension' }
  });

  if (existing) {
    console.log(`Sheet already exists (id=${existing.id}). Updating contentJson.`);
    const updated = await prisma.sheet.update({
      where: { id: existing.id },
      data: { contentJson }
    });
    console.log(`✓ Updated sheet #${updated.id}`);
    await prisma.$disconnect();
    return;
  }

  const sheet = await prisma.sheet.create({
    data: {
      title: 'Spot the Puppy — Reading Comprehension',
      subject: 'English',
      topic: 'Reading',
      difficultyLevel: 1,
      sheetType: 'worksheet',
      tags: ['Year 1', 'KS1', 'Reading Comprehension'],
      contentJson
    }
  });

  console.log(`✓ Created sheet #${sheet.id}: "${sheet.title}"`);
  console.log(`  Subject: ${sheet.subject}`);
  console.log(`  Topic: ${sheet.topic}`);
  console.log(`  Difficulty: Level ${sheet.difficultyLevel}`);
  console.log(`  Questions: ${contentJson.questions.length}`);

  await prisma.$disconnect();
}

main().catch(async err => {
  console.error('Failed:', err);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});

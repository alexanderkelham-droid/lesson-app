const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ─── Users ────────────────────────────────────────────────────────────────
  const hash = pwd => bcrypt.hashSync(pwd, 10);

  const [manager1] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'manager@lessonapp.com' },
      update: {},
      create: { email: 'manager@lessonapp.com', passwordHash: hash('password123'), name: 'Sarah Manager', role: 'manager' }
    })
  ]);

  const [tutor1, tutor2] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'tutor1@lessonapp.com' },
      update: {},
      create: { email: 'tutor1@lessonapp.com', passwordHash: hash('password123'), name: 'James Tutor', role: 'tutor' }
    }),
    prisma.user.upsert({
      where: { email: 'tutor2@lessonapp.com' },
      update: {},
      create: { email: 'tutor2@lessonapp.com', passwordHash: hash('password123'), name: 'Maria Tutor', role: 'tutor' }
    })
  ]);

  const [alice, bob, charlie, diana, evan] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'alice@lessonapp.com' },
      update: {},
      create: { email: 'alice@lessonapp.com', passwordHash: hash('password123'), name: 'Alice Student', role: 'student' }
    }),
    prisma.user.upsert({
      where: { email: 'bob@lessonapp.com' },
      update: {},
      create: { email: 'bob@lessonapp.com', passwordHash: hash('password123'), name: 'Bob Student', role: 'student' }
    }),
    prisma.user.upsert({
      where: { email: 'charlie@lessonapp.com' },
      update: {},
      create: { email: 'charlie@lessonapp.com', passwordHash: hash('password123'), name: 'Charlie Student', role: 'student' }
    }),
    prisma.user.upsert({
      where: { email: 'diana@lessonapp.com' },
      update: {},
      create: { email: 'diana@lessonapp.com', passwordHash: hash('password123'), name: 'Diana Student', role: 'student' }
    }),
    prisma.user.upsert({
      where: { email: 'evan@lessonapp.com' },
      update: {},
      create: { email: 'evan@lessonapp.com', passwordHash: hash('password123'), name: 'Evan Student', role: 'student' }
    })
  ]);

  console.log('Users seeded.');

  // ─── Sheets ───────────────────────────────────────────────────────────────
  const sheetsData = [
    // ── Mathematics ──
    {
      title: 'Intro to Algebra: Variables & Expressions',
      subject: 'Mathematics', topic: 'Algebra', difficultyLevel: 1,
      sheetType: 'worksheet', tags: ['algebra', 'variables', 'expressions'],
      contentJson: {
        questions: [
          { id: 'q1', type: 'multiple_choice', prompt: 'What is the value of x if x + 5 = 10?', options: ['3', '4', '5', '6'], correct: ['5'], points: 1 },
          { id: 'q2', type: 'multiple_choice', prompt: 'Which of the following is a variable?', options: ['5', 'x', '10', '+'], correct: ['x'], points: 1 },
          { id: 'q3', type: 'fill_in_blank', prompt: 'In the expression 3y + 2, the coefficient of y is ___', correct: ['3'], points: 1 },
          { id: 'q4', type: 'free_text', prompt: 'Explain in your own words what a variable is.', points: 2 }
        ]
      }
    },
    {
      title: 'Solving Linear Equations',
      subject: 'Mathematics', topic: 'Algebra', difficultyLevel: 2,
      sheetType: 'practice', tags: ['algebra', 'equations', 'linear'],
      contentJson: {
        questions: [
          { id: 'q1', type: 'fill_in_blank', prompt: 'Solve: 2x + 4 = 12. x = ___', correct: ['4'], points: 2 },
          { id: 'q2', type: 'fill_in_blank', prompt: 'Solve: 3x - 9 = 6. x = ___', correct: ['5'], points: 2 },
          { id: 'q3', type: 'multiple_choice', prompt: 'What is the first step to solve 5x = 25?', options: ['Add 5 to both sides', 'Divide both sides by 5', 'Multiply both sides by 5', 'Subtract 5 from both sides'], correct: ['Divide both sides by 5'], points: 1 },
          { id: 'q4', type: 'ordering', prompt: 'Put these steps in order to solve 2x + 6 = 14:', options: ['Subtract 6 from both sides', 'Write the equation', 'Divide both sides by 2', 'State the answer'], correct_order: ['Write the equation', 'Subtract 6 from both sides', 'Divide both sides by 2', 'State the answer'], points: 2 }
        ]
      }
    },
    {
      title: 'Algebra Reinforcement: One-Step Equations',
      subject: 'Mathematics', topic: 'Algebra', difficultyLevel: 1,
      sheetType: 'practice', tags: ['algebra', 'equations', 'remedial'],
      contentJson: {
        questions: [
          { id: 'q1', type: 'fill_in_blank', prompt: 'x + 3 = 7. x = ___', correct: ['4'], points: 1 },
          { id: 'q2', type: 'fill_in_blank', prompt: 'x - 5 = 2. x = ___', correct: ['7'], points: 1 },
          { id: 'q3', type: 'fill_in_blank', prompt: '4x = 20. x = ___', correct: ['5'], points: 1 },
          { id: 'q4', type: 'fill_in_blank', prompt: 'x / 3 = 4. x = ___', correct: ['12'], points: 1 },
          { id: 'q5', type: 'multiple_choice', prompt: 'Which operation undoes multiplication?', options: ['Addition', 'Subtraction', 'Division', 'Multiplication'], correct: ['Division'], points: 1 }
        ]
      }
    },
    {
      title: 'Introduction to Geometry: Angles',
      subject: 'Mathematics', topic: 'Geometry', difficultyLevel: 1,
      sheetType: 'worksheet', tags: ['geometry', 'angles'],
      contentJson: {
        questions: [
          { id: 'q1', type: 'multiple_choice', prompt: 'A right angle measures:', options: ['45°', '90°', '180°', '360°'], correct: ['90°'], points: 1 },
          { id: 'q2', type: 'matching', prompt: 'Match each angle type to its definition:', pairs: [{ left: 'Acute', right: 'Less than 90°' }, { left: 'Obtuse', right: 'Between 90° and 180°' }, { left: 'Straight', right: 'Exactly 180°' }], points: 3 },
          { id: 'q3', type: 'fill_in_blank', prompt: 'Two angles that add up to 90° are called ___ angles.', correct: ['complementary'], points: 1 }
        ]
      }
    },
    {
      title: 'Quadratic Equations',
      subject: 'Mathematics', topic: 'Algebra', difficultyLevel: 4,
      sheetType: 'quiz', tags: ['algebra', 'quadratic', 'advanced'],
      contentJson: {
        questions: [
          { id: 'q1', type: 'multiple_choice', prompt: 'What are the solutions of x² - 5x + 6 = 0?', options: ['x = 2 and x = 3', 'x = -2 and x = -3', 'x = 1 and x = 6', 'x = -1 and x = -6'], correct: ['x = 2 and x = 3'], points: 2 },
          { id: 'q2', type: 'fill_in_blank', prompt: 'The quadratic formula is x = (-b ± √(b²-4ac)) / ___', correct: ['2a'], points: 1 },
          { id: 'q3', type: 'free_text', prompt: 'Solve x² + 4x - 12 = 0 using factoring. Show all steps.', points: 3 },
          { id: 'q4', type: 'multiple_choice', prompt: 'The discriminant b²-4ac tells us:', options: ['The vertex of the parabola', 'The number and type of roots', 'The axis of symmetry', 'The y-intercept'], correct: ['The number and type of roots'], points: 1 }
        ]
      }
    },
    {
      title: 'Fractions & Mixed Numbers',
      subject: 'Mathematics', topic: 'Arithmetic', difficultyLevel: 2,
      sheetType: 'worksheet', tags: ['fractions', 'arithmetic'],
      contentJson: {
        questions: [
          { id: 'q1', type: 'fill_in_blank', prompt: '1/2 + 1/4 = ___', correct: ['3/4'], points: 1 },
          { id: 'q2', type: 'multiple_choice', prompt: 'Which fraction is equivalent to 2/4?', options: ['1/3', '1/2', '2/3', '3/4'], correct: ['1/2'], points: 1 },
          { id: 'q3', type: 'ordering', prompt: 'Order these fractions from smallest to largest: 3/4, 1/3, 2/5, 1/2', options: ['3/4', '1/3', '2/5', '1/2'], correct_order: ['1/3', '2/5', '1/2', '3/4'], points: 2 }
        ]
      }
    },
    {
      title: 'Fractions Remediation: Basics',
      subject: 'Mathematics', topic: 'Arithmetic', difficultyLevel: 1,
      sheetType: 'practice', tags: ['fractions', 'arithmetic', 'remedial'],
      contentJson: {
        questions: [
          { id: 'q1', type: 'multiple_choice', prompt: 'In the fraction 3/5, the denominator is:', options: ['3', '5', '8', '2'], correct: ['5'], points: 1 },
          { id: 'q2', type: 'fill_in_blank', prompt: '2/4 simplified is ___', correct: ['1/2'], points: 1 },
          { id: 'q3', type: 'multiple_choice', prompt: 'Which is larger: 1/2 or 1/3?', options: ['1/2', '1/3', 'They are equal', 'Cannot be determined'], correct: ['1/2'], points: 1 }
        ]
      }
    },

    // ── English ──
    {
      title: 'Parts of Speech: Nouns & Verbs',
      subject: 'English', topic: 'Grammar', difficultyLevel: 1,
      sheetType: 'worksheet', tags: ['grammar', 'nouns', 'verbs'],
      contentJson: {
        questions: [
          { id: 'q1', type: 'multiple_choice', prompt: 'Which word is a noun?', options: ['Run', 'Happy', 'Dog', 'Quickly'], correct: ['Dog'], points: 1 },
          { id: 'q2', type: 'multiple_choice', prompt: 'Identify the verb: "She sings beautifully."', options: ['She', 'sings', 'beautifully', 'She sings'], correct: ['sings'], points: 1 },
          { id: 'q3', type: 'matching', prompt: 'Match words to their part of speech:', pairs: [{ left: 'teacher', right: 'noun' }, { left: 'jump', right: 'verb' }, { left: 'fast', right: 'adjective' }], points: 3 },
          { id: 'q4', type: 'free_text', prompt: 'Write a sentence using at least one noun and one verb.', points: 2 }
        ]
      }
    },
    {
      title: 'Sentence Structure & Punctuation',
      subject: 'English', topic: 'Grammar', difficultyLevel: 2,
      sheetType: 'practice', tags: ['grammar', 'punctuation', 'sentences'],
      contentJson: {
        questions: [
          { id: 'q1', type: 'multiple_choice', prompt: 'Which sentence is punctuated correctly?', options: ['"its a lovely day"', '"Its a lovely day."', '"It\'s a lovely day."', '"Its, a lovely day."'], correct: ['"It\'s a lovely day."'], points: 1 },
          { id: 'q2', type: 'fill_in_blank', prompt: 'A sentence must have a ___ and a verb.', correct: ['subject', 'noun'], points: 1 },
          { id: 'q3', type: 'multiple_choice', prompt: 'What type of sentence is this? "Close the door."', options: ['Declarative', 'Interrogative', 'Imperative', 'Exclamatory'], correct: ['Imperative'], points: 1 },
          { id: 'q4', type: 'free_text', prompt: 'Correct this sentence: "yesterday i went too the store and buyed some milk"', points: 2 }
        ]
      }
    },
    {
      title: 'Grammar Basics Reinforcement',
      subject: 'English', topic: 'Grammar', difficultyLevel: 1,
      sheetType: 'practice', tags: ['grammar', 'remedial', 'basics'],
      contentJson: {
        questions: [
          { id: 'q1', type: 'multiple_choice', prompt: 'A sentence always ends with:', options: ['A comma', 'A space', 'A punctuation mark', 'A capital letter'], correct: ['A punctuation mark'], points: 1 },
          { id: 'q2', type: 'multiple_choice', prompt: 'Which is spelled correctly?', options: ['recieve', 'receive', 'receve', 'receeve'], correct: ['receive'], points: 1 },
          { id: 'q3', type: 'fill_in_blank', prompt: 'I ___ to school every day. (go/goes)', correct: ['go'], points: 1 }
        ]
      }
    },
    {
      title: 'Reading Comprehension: Short Stories',
      subject: 'English', topic: 'Reading', difficultyLevel: 2,
      sheetType: 'quiz', tags: ['reading', 'comprehension', 'fiction'],
      contentJson: {
        questions: [
          { id: 'q1', type: 'free_text', prompt: 'Read this passage: "Maria walked into the forest alone, her lantern flickering in the wind. She heard a sound behind her and froze." — What mood does this passage create? Use evidence from the text.', points: 3 },
          { id: 'q2', type: 'multiple_choice', prompt: 'The word "flickering" in the passage most likely means:', options: ['burning brightly', 'going out completely', 'shining unsteadily', 'pointing downward'], correct: ['shining unsteadily'], points: 1 },
          { id: 'q3', type: 'multiple_choice', prompt: 'Based on the passage, Maria is most likely:', options: ['relaxed and comfortable', 'nervous or afraid', 'excited and happy', 'bored and tired'], correct: ['nervous or afraid'], points: 1 }
        ]
      }
    },
    {
      title: 'Essay Writing: Introduction Paragraphs',
      subject: 'English', topic: 'Writing', difficultyLevel: 3,
      sheetType: 'worksheet', tags: ['writing', 'essays', 'paragraphs'],
      contentJson: {
        questions: [
          { id: 'q1', type: 'ordering', prompt: 'Arrange these components of an introduction in the correct order:', options: ['Thesis statement', 'Hook', 'Background information'], correct_order: ['Hook', 'Background information', 'Thesis statement'], points: 2 },
          { id: 'q2', type: 'multiple_choice', prompt: 'Which is the best "hook" for an essay about recycling?', options: ['Recycling is important.', 'In this essay I will discuss recycling.', 'Every year, humans produce over 2 billion tonnes of waste.', 'There are many types of recycling.'], correct: ['Every year, humans produce over 2 billion tonnes of waste.'], points: 1 },
          { id: 'q3', type: 'free_text', prompt: 'Write an introduction paragraph (3-5 sentences) for an essay titled "Why Sleep Matters for Students". Include a hook, background, and thesis.', points: 5 }
        ]
      }
    },

    // ── Science ──
    {
      title: 'Cell Biology: Basic Cell Structure',
      subject: 'Science', topic: 'Biology', difficultyLevel: 1,
      sheetType: 'worksheet', tags: ['biology', 'cells', 'organelles'],
      contentJson: {
        questions: [
          { id: 'q1', type: 'multiple_choice', prompt: 'Which organelle is known as the "powerhouse of the cell"?', options: ['Nucleus', 'Ribosome', 'Mitochondria', 'Vacuole'], correct: ['Mitochondria'], points: 1 },
          { id: 'q2', type: 'matching', prompt: 'Match the organelle to its function:', pairs: [{ left: 'Nucleus', right: 'Controls cell activities' }, { left: 'Cell membrane', right: 'Controls what enters/exits' }, { left: 'Chloroplast', right: 'Photosynthesis' }], points: 3 },
          { id: 'q3', type: 'fill_in_blank', prompt: 'Plant cells have a ___ but animal cells do not.', correct: ['cell wall', 'chloroplast', 'cell wall and chloroplast'], points: 1 },
          { id: 'q4', type: 'multiple_choice', prompt: 'Which of these is found in BOTH plant and animal cells?', options: ['Cell wall', 'Chloroplast', 'Mitochondria', 'Large central vacuole'], correct: ['Mitochondria'], points: 1 }
        ]
      }
    },
    {
      title: 'Cell Biology Reinforcement',
      subject: 'Science', topic: 'Biology', difficultyLevel: 1,
      sheetType: 'practice', tags: ['biology', 'cells', 'remedial'],
      contentJson: {
        questions: [
          { id: 'q1', type: 'multiple_choice', prompt: 'All living things are made of:', options: ['Atoms', 'Cells', 'Molecules', 'Proteins'], correct: ['Cells'], points: 1 },
          { id: 'q2', type: 'fill_in_blank', prompt: 'The ___ contains the cell\'s DNA.', correct: ['nucleus'], points: 1 },
          { id: 'q3', type: 'multiple_choice', prompt: 'A cell membrane is made of:', options: ['Starch', 'Protein only', 'A phospholipid bilayer', 'Cellulose'], correct: ['A phospholipid bilayer'], points: 1 }
        ]
      }
    },
    {
      title: 'Photosynthesis & Respiration',
      subject: 'Science', topic: 'Biology', difficultyLevel: 3,
      sheetType: 'quiz', tags: ['biology', 'photosynthesis', 'respiration'],
      contentJson: {
        questions: [
          { id: 'q1', type: 'fill_in_blank', prompt: 'Photosynthesis converts light energy into ___ energy.', correct: ['chemical', 'stored chemical'], points: 1 },
          { id: 'q2', type: 'multiple_choice', prompt: 'The equation for photosynthesis is:', options: ['CO₂ + H₂O → C₆H₁₂O₆ + O₂', 'C₆H₁₂O₆ + O₂ → CO₂ + H₂O', 'H₂O → H₂ + O', 'CO₂ + O₂ → C₆H₁₂O₆'], correct: ['CO₂ + H₂O → C₆H₁₂O₆ + O₂'], points: 2 },
          { id: 'q3', type: 'multiple_choice', prompt: 'Where does photosynthesis take place in a plant cell?', options: ['Mitochondria', 'Nucleus', 'Chloroplast', 'Vacuole'], correct: ['Chloroplast'], points: 1 },
          { id: 'q4', type: 'free_text', prompt: 'Explain the relationship between photosynthesis and cellular respiration.', points: 3 }
        ]
      }
    },
    {
      title: 'Introduction to Chemistry: Atoms & Elements',
      subject: 'Science', topic: 'Chemistry', difficultyLevel: 2,
      sheetType: 'worksheet', tags: ['chemistry', 'atoms', 'elements', 'periodic-table'],
      contentJson: {
        questions: [
          { id: 'q1', type: 'multiple_choice', prompt: 'What is the atomic number of Oxygen?', options: ['6', '7', '8', '9'], correct: ['8'], points: 1 },
          { id: 'q2', type: 'fill_in_blank', prompt: 'The symbol for Sodium on the periodic table is ___', correct: ['Na'], points: 1 },
          { id: 'q3', type: 'matching', prompt: 'Match the element to its symbol:', pairs: [{ left: 'Gold', right: 'Au' }, { left: 'Iron', right: 'Fe' }, { left: 'Carbon', right: 'C' }], points: 3 },
          { id: 'q4', type: 'multiple_choice', prompt: 'Protons are located in the:', options: ['Electron cloud', 'Nucleus', 'Orbit', 'Shell'], correct: ['Nucleus'], points: 1 }
        ]
      }
    },
    {
      title: 'Forces & Motion: Newton\'s Laws',
      subject: 'Science', topic: 'Physics', difficultyLevel: 3,
      sheetType: 'quiz', tags: ['physics', 'forces', 'newton', 'motion'],
      contentJson: {
        questions: [
          { id: 'q1', type: 'matching', prompt: 'Match Newton\'s Law to its description:', pairs: [{ left: 'First Law', right: 'An object at rest stays at rest unless acted upon by force' }, { left: 'Second Law', right: 'F = ma' }, { left: 'Third Law', right: 'Every action has an equal and opposite reaction' }], points: 3 },
          { id: 'q2', type: 'fill_in_blank', prompt: 'Force = mass × ___', correct: ['acceleration', 'a'], points: 1 },
          { id: 'q3', type: 'multiple_choice', prompt: 'A 10kg object accelerates at 2 m/s². What force acts on it?', options: ['5 N', '12 N', '20 N', '8 N'], correct: ['20 N'], points: 2 },
          { id: 'q4', type: 'free_text', prompt: 'Give a real-life example of Newton\'s Third Law.', points: 2 }
        ]
      }
    },
    {
      title: 'Physics Remediation: Forces Basics',
      subject: 'Science', topic: 'Physics', difficultyLevel: 2,
      sheetType: 'practice', tags: ['physics', 'forces', 'remedial'],
      contentJson: {
        questions: [
          { id: 'q1', type: 'multiple_choice', prompt: 'Force is measured in:', options: ['Kilograms', 'Metres', 'Newtons', 'Watts'], correct: ['Newtons'], points: 1 },
          { id: 'q2', type: 'multiple_choice', prompt: 'Which of these is NOT a contact force?', options: ['Friction', 'Gravity', 'Normal force', 'Applied force'], correct: ['Gravity'], points: 1 },
          { id: 'q3', type: 'fill_in_blank', prompt: 'Friction opposes ___ motion.', correct: ['relative', 'sliding'], points: 1 }
        ]
      }
    },
    {
      title: 'The Scientific Method',
      subject: 'Science', topic: 'General Science', difficultyLevel: 1,
      sheetType: 'worksheet', tags: ['scientific-method', 'inquiry'],
      contentJson: {
        questions: [
          { id: 'q1', type: 'ordering', prompt: 'Place the steps of the scientific method in order:', options: ['Analysis', 'Observation', 'Hypothesis', 'Experiment', 'Conclusion'], correct_order: ['Observation', 'Hypothesis', 'Experiment', 'Analysis', 'Conclusion'], points: 3 },
          { id: 'q2', type: 'multiple_choice', prompt: 'A hypothesis is best described as:', options: ['A proven fact', 'A testable explanation', 'A data set', 'A conclusion'], correct: ['A testable explanation'], points: 1 },
          { id: 'q3', type: 'fill_in_blank', prompt: 'In an experiment, the ___ variable is what you change.', correct: ['independent', 'manipulated'], points: 1 }
        ]
      }
    }
  ];

  const sheets = [];
  for (const data of sheetsData) {
    const sheet = await prisma.sheet.create({ data });
    sheets.push(sheet);
  }
  console.log(`Created ${sheets.length} sheets.`);

  // Helper: find sheet by title
  const getSheet = title => sheets.find(s => s.title === title);

  // ─── Follow-Up Rules ──────────────────────────────────────────────────────
  const rules = await Promise.all([
    prisma.followUpRule.create({
      data: {
        triggerCondition: 'score < 70',
        sourceSheetId: getSheet('Solving Linear Equations').id,
        followUpSheetId: getSheet('Algebra Reinforcement: One-Step Equations').id,
        priority: 1
      }
    }),
    prisma.followUpRule.create({
      data: {
        triggerCondition: 'score < 70',
        sourceSheetId: getSheet('Cell Biology: Basic Cell Structure').id,
        followUpSheetId: getSheet('Cell Biology Reinforcement').id,
        priority: 1
      }
    }),
    prisma.followUpRule.create({
      data: {
        triggerCondition: 'score < 65',
        sourceSheetId: getSheet('Forces & Motion: Newton\'s Laws').id,
        followUpSheetId: getSheet('Physics Remediation: Forces Basics').id,
        priority: 1
      }
    })
  ]);
  console.log(`Created ${rules.length} follow-up rules.`);

  // ─── Lesson Plans ─────────────────────────────────────────────────────────
  const plan1 = await prisma.lessonPlan.create({
    data: {
      studentId: alice.id,
      tutorId: tutor1.id,
      title: 'Alice\'s Maths & Science Programme',
      startDate: new Date('2025-01-15'),
      status: 'active',
      items: {
        create: [
          { sheetId: getSheet('Intro to Algebra: Variables & Expressions').id, sequenceOrder: 1, status: 'completed', scheduledDate: new Date('2025-01-15') },
          { sheetId: getSheet('Solving Linear Equations').id,                  sequenceOrder: 2, status: 'completed', scheduledDate: new Date('2025-01-22') },
          { sheetId: getSheet('Cell Biology: Basic Cell Structure').id,         sequenceOrder: 3, status: 'available', scheduledDate: new Date('2025-01-29') },
          { sheetId: getSheet('Photosynthesis & Respiration').id,               sequenceOrder: 4, status: 'locked',    scheduledDate: new Date('2025-02-05') },
          { sheetId: getSheet('Introduction to Chemistry: Atoms & Elements').id, sequenceOrder: 5, status: 'locked',  scheduledDate: new Date('2025-02-12') }
        ]
      }
    },
    include: { items: true }
  });

  // Add completed responses for Alice on first two sheets
  const aliceItems = plan1.items.sort((a, b) => a.sequenceOrder - b.sequenceOrder);

  await prisma.studentResponse.create({
    data: {
      studentId: alice.id,
      sheetId: getSheet('Intro to Algebra: Variables & Expressions').id,
      lessonPlanItemId: aliceItems[0].id,
      responsesJson: { q1: ['5'], q2: ['x'], q3: '3', q4: 'A variable is a letter that represents an unknown number.' },
      score: 88,
      completedAt: new Date('2025-01-16'),
      timeSpentSeconds: 480
    }
  });

  await prisma.studentResponse.create({
    data: {
      studentId: alice.id,
      sheetId: getSheet('Solving Linear Equations').id,
      lessonPlanItemId: aliceItems[1].id,
      responsesJson: { q1: '4', q2: '5', q3: ['Divide both sides by 5'], q4: ['Write the equation', 'Subtract 6 from both sides', 'Divide both sides by 2', 'State the answer'] },
      score: 86,
      completedAt: new Date('2025-01-23'),
      timeSpentSeconds: 620
    }
  });

  const plan2 = await prisma.lessonPlan.create({
    data: {
      studentId: bob.id,
      tutorId: tutor1.id,
      title: 'Bob\'s English Fundamentals',
      startDate: new Date('2025-01-20'),
      status: 'active',
      items: {
        create: [
          { sheetId: getSheet('Parts of Speech: Nouns & Verbs').id,       sequenceOrder: 1, status: 'completed', scheduledDate: new Date('2025-01-20') },
          { sheetId: getSheet('Sentence Structure & Punctuation').id,     sequenceOrder: 2, status: 'available', scheduledDate: new Date('2025-01-27') },
          { sheetId: getSheet('Reading Comprehension: Short Stories').id, sequenceOrder: 3, status: 'locked',    scheduledDate: new Date('2025-02-03') },
          { sheetId: getSheet('Essay Writing: Introduction Paragraphs').id, sequenceOrder: 4, status: 'locked', scheduledDate: new Date('2025-02-10') }
        ]
      }
    },
    include: { items: true }
  });

  const bobItems = plan2.items.sort((a, b) => a.sequenceOrder - b.sequenceOrder);

  await prisma.studentResponse.create({
    data: {
      studentId: bob.id,
      sheetId: getSheet('Parts of Speech: Nouns & Verbs').id,
      lessonPlanItemId: bobItems[0].id,
      responsesJson: { q1: ['Dog'], q2: ['sings'], q3: { teacher: 'noun', jump: 'verb', fast: 'adjective' }, q4: 'The dog runs fast.' },
      score: 91,
      completedAt: new Date('2025-01-21'),
      timeSpentSeconds: 550
    }
  });

  console.log('Lesson plans and responses seeded.');
  console.log('\n✅ Seed complete!\n');
  console.log('Login credentials (all use password: password123):');
  console.log('  manager@lessonapp.com  — manager');
  console.log('  tutor1@lessonapp.com   — tutor');
  console.log('  tutor2@lessonapp.com   — tutor');
  console.log('  alice@lessonapp.com    — student (has active plan)');
  console.log('  bob@lessonapp.com      — student (has active plan)');
  console.log('  charlie@lessonapp.com  — student');
  console.log('  diana@lessonapp.com    — student');
  console.log('  evan@lessonapp.com     — student');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

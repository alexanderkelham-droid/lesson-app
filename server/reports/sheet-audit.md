# Worksheet library audit

Generated 2026-09-25 by `server/scripts/audit-sheets.js`. Machine-readable detail: `server/reports/sheet-audit.json`.

## Headline

- **1218 digital sheets** in the library. **422 good** (35%), **498 need review** (41%), **298 poor** (24%).
- The archive has **1878 PDFs**. 1125 of them are behind a digital sheet; **753 PDFs have no digital sheet at all** (552 of the archive's PDFs are scanned images with no text, which the original importer could not read).
- Sheets re-done with Claude vision are in good shape (306 of 337 good). Sheets made by the old text parser are mostly not usable as digital worksheets (only 83 of 842 good): missing answer keys, headers and sentence fragments posing as questions, several answers crammed into one box, reading passages left out.
- **14 sheets have wrong answer keys** that would mark correct student answers as wrong: #61, #62, #63, #64, #65, #66, #67, #68, #69, #70, #71, #831, #832, #833 (e.g. "Times and Divide" sheets give the divisor as the answer to every division; Decimals sheets have decimal products truncated to 0). Fix these first.
- **77 duplicate groups** (77 sheets could be removed) and **1 topic names** that differ only in case/punctuation.
- Originals behind digital sheets total **779.5 MB** (1125 PDFs); the whole archive is 1657 MB.

## Quality by how the sheet was made

| Made by | Sheets | Good | Needs review | Poor |
|---|---:|---:|---:|---:|
| manual | 39 | 33 | 4 | 2 |
| text | 842 | 83 | 463 | 296 |
| vision | 337 | 306 | 31 | 0 |

## Quality by subject

| Subject | Sheets | Good | Needs review | Poor |
|---|---:|---:|---:|---:|
| Mathematics | 607 | 360 | 93 | 154 |
| English | 597 | 48 | 405 | 144 |
| Science | 14 | 14 | 0 | 0 |

## By folder

Sheets = digital sheets whose source PDF is in that folder. "No sheet" = PDFs in the folder that were never digitised (excluding identical copies).

| Folder | Sheets | Good | Review | Poor | No sheet |
|---|---:|---:|---:|---:|---:|
| (no source PDF) | 39 | 33 | 4 | 2 | 0 |
| 1_English_PDF/AQA Reading Skills_Fiction | 0 | 0 | 0 | 0 | 5 |
| 1_English_PDF/Book Study | 55 | 0 | 54 | 1 | 0 |
| 1_English_PDF/CGP SPAG Book | 0 | 0 | 0 | 0 | 40 |
| 1_English_PDF/Comprehension 1 (S&S) | 0 | 0 | 0 | 0 | 36 |
| 1_English_PDF/Comprehension 2 (S&S) | 0 | 0 | 0 | 0 | 37 |
| 1_English_PDF/Comprehension 3 (S&S) | 0 | 0 | 0 | 0 | 36 |
| 1_English_PDF/Comprehension 4 (S&S) | 0 | 0 | 0 | 0 | 38 |
| 1_English_PDF/Creative Writing | 68 | 0 | 0 | 68 | 1 |
| 1_English_PDF/E_Comprenhension 1 (S&S) | 0 | 0 | 0 | 0 | 28 |
| 1_English_PDF/E_Comprenhension 2 (S&S) | 0 | 0 | 0 | 0 | 29 |
| 1_English_PDF/E_Comprenhension 3 (S&S) | 0 | 0 | 0 | 0 | 29 |
| 1_English_PDF/English 1 | 25 | 0 | 25 | 0 | 0 |
| 1_English_PDF/English 2 | 41 | 0 | 40 | 1 | 0 |
| 1_English_PDF/English 3 | 41 | 3 | 38 | 0 | 0 |
| 1_English_PDF/English 4 | 40 | 0 | 39 | 1 | 0 |
| 1_English_PDF/English 5 | 40 | 0 | 38 | 2 | 0 |
| 1_English_PDF/English Homework 1 | 40 | 0 | 38 | 2 | 0 |
| 1_English_PDF/First Comprenhension_1 | 0 | 0 | 0 | 0 | 36 |
| 1_English_PDF/First_Comprenhension_2 | 0 | 0 | 0 | 0 | 36 |
| 1_English_PDF/Hand Writing 1 | 0 | 0 | 0 | 0 | 30 |
| 1_English_PDF/Hand Writing 2 | 0 | 0 | 0 | 0 | 45 |
| 1_English_PDF/Reading Practice (S&S) | 6 | 0 | 0 | 6 | 0 |
| 1_English_PDF/Spellings 1 | 30 | 16 | 14 | 0 | 0 |
| 1_English_PDF/Spellings 2 | 40 | 20 | 20 | 0 | 0 |
| 1_English_PDF/Spellings 3 | 40 | 0 | 20 | 20 | 0 |
| 1_English_PDF/Spellings 4 | 40 | 0 | 20 | 20 | 0 |
| 1_English_PDF/Spellings 5 | 40 | 0 | 24 | 16 | 0 |
| 1_English_PDF/Spellings 6 | 40 | 0 | 35 | 5 | 0 |
| 2_Maths_PDF | 0 | 0 | 0 | 0 | 2 |
| 2_Maths_PDF/Algebra Introduction | 35 | 33 | 2 | 0 | 0 |
| 2_Maths_PDF/Algebra | 53 | 4 | 12 | 37 | 31 |
| 2_Maths_PDF/Assessment Sheets | 10 | 10 | 0 | 0 | 0 |
| 2_Maths_PDF/Corbett_Five a day | 31 | 0 | 27 | 4 | 0 |
| 2_Maths_PDF/Decimals 1 | 26 | 0 | 0 | 26 | 5 |
| 2_Maths_PDF/Early Fractions_1 (S&S) | 0 | 0 | 0 | 0 | 26 |
| 2_Maths_PDF/Early Fractions_2 (S&S) | 0 | 0 | 0 | 0 | 30 |
| 2_Maths_PDF/Fract_Dec_Percent | 32 | 3 | 23 | 6 | 1 |
| 2_Maths_PDF/Fractions 1 | 34 | 4 | 7 | 23 | 15 |
| 2_Maths_PDF/Maths 1 Sheets | 30 | 30 | 0 | 0 | 0 |
| 2_Maths_PDF/Maths 2 Sheets | 20 | 18 | 2 | 0 | 0 |
| 2_Maths_PDF/Maths 3 Sheets | 20 | 16 | 4 | 0 | 0 |
| 2_Maths_PDF/Maths 4 Sheets | 20 | 18 | 2 | 0 | 0 |
| 2_Maths_PDF/Maths 5 Sheets | 20 | 20 | 0 | 0 | 0 |
| 2_Maths_PDF/Maths 6 sheets | 20 | 20 | 0 | 0 | 0 |
| 2_Maths_PDF/Maths 7 sheets | 20 | 19 | 1 | 0 | 0 |
| 2_Maths_PDF/Number Sums_long | 48 | 0 | 1 | 47 | 136 |
| 2_Maths_PDF/Telling the time 1 (S&S) | 0 | 0 | 0 | 0 | 18 |
| 2_Maths_PDF/Telling the time 2 (S&S) | 0 | 0 | 0 | 0 | 28 |
| 2_Maths_PDF/Telling the time 3 (S&S) | 0 | 0 | 0 | 0 | 23 |
| 2_Maths_PDF/Times Tables | 23 | 23 | 0 | 0 | 0 |
| 2_Maths_PDF/Times and Divide_2 to 12 | 11 | 0 | 0 | 11 | 0 |
| 2_Maths_PDF/Word problems 2 | 40 | 40 | 0 | 0 | 0 |
| 2_Maths_PDF/Word problems 3 | 20 | 18 | 2 | 0 | 0 |
| 2_Maths_PDF/Word problems 4 | 20 | 20 | 0 | 0 | 0 |
| 2_Maths_PDF/Word problems 5 | 20 | 20 | 0 | 0 | 0 |
| 2_Maths_PDF/Word problems 6 | 20 | 20 | 0 | 0 | 0 |
| 2_Maths_PDF/Word problems 7 | 20 | 14 | 6 | 0 | 0 |

## Most common problems

| Problem | Sheets |
|---|---:|
| N prompts are not usable questions | 274 |
| N auto-markable questions have no answer key | 271 |
| N prompts cram several answer lines into one question | 241 |
| N spelling questions show the word to be spelt; the sheet's real tasks were dropped | 113 |
| N questions reference a picture/diagram/drawing | 85 |
| questions on a class novel | 55 |
| N questions for a N-page PDF | 39 |
| N multiple-choice questions with fewer than N options | 26 |
| N questions depend on a picture/diagram/drawing the sheet can't show | 23 |
| only N questions | 20 |
| N answer keys are wrong | 14 |
| N prompts look broken | 11 |
| N duplicated questions | 9 |
| N prompts look odd | 9 |
| text-parsed: broken prompts and no answer keys | 8 |

## Sheets already used in lesson plans

21 sheets are referenced by lesson plans/student work; 13 of them are not graded Good and are worth fixing first:

| Sheet | Quality | Why |
|---|---|---|
| #254 English 1 1 | NEEDS_REVIEW | 2/3 prompts cram several answer lines into one question |
| #265 English 1 12 | NEEDS_REVIEW | 3/3 prompts cram several answer lines into one question |
| #271 English 1 18 | NEEDS_REVIEW | 2/3 prompts cram several answer lines into one question |
| #280 English 2 2 | NEEDS_REVIEW | 1/1 auto-markable questions have no answer key; 1 multiple-choice question(s) with fewer than 2 options |
| #281 English 2 3 | NEEDS_REVIEW | 3/3 prompts cram several answer lines into one question |
| #282 English 2 4 | NEEDS_REVIEW | 4/4 prompts cram several answer lines into one question |
| #330 ENGLISH 3 11 | NEEDS_REVIEW | 3/4 prompts cram several answer lines into one question |
| #332 ENGLISH 3 13 | NEEDS_REVIEW | 3/4 prompts cram several answer lines into one question; 1/1 auto-markable questions have no answer key; 1 multiple-choice question(s) with fewer than 2 options; 1/4 questions depend on a picture/diagram/drawing the sheet can't show |
| #334 ENGLISH 3 15 | NEEDS_REVIEW | 3/4 prompts cram several answer lines into one question |
| #401 ENGLISH 5 1 | NEEDS_REVIEW | 3/4 prompts cram several answer lines into one question |
| #402 ENGLISH 5 2 | NEEDS_REVIEW | 2/3 prompts cram several answer lines into one question; 1/1 auto-markable questions have no answer key; 1 multiple-choice question(s) with fewer than 2 options |
| #403 ENGLISH 5 3 | NEEDS_REVIEW | 3/4 prompts cram several answer lines into one question |
| #481 Focused Texts 1 (S&S) | POOR | 15 questions for a 17-page PDF; 13/15 prompts are not usable questions (1 header/boilerplate, 12 fragment/no instruction); comprehension worksheet with no reading passage attached |

## Biggest problem areas

Folders with the most work outstanding (poor + needs-review sheets + PDFs with no sheet):

- **2_Maths_PDF/Number Sums_long**: 184 items (47 poor, 1 review, 136 never digitised)
- **2_Maths_PDF/Algebra**: 80 items (37 poor, 12 review, 31 never digitised)
- **1_English_PDF/Creative Writing**: 69 items (68 poor, 0 review, 1 never digitised)
- **1_English_PDF/Book Study**: 55 items (1 poor, 54 review, 0 never digitised)
- **2_Maths_PDF/Fractions 1**: 45 items (23 poor, 7 review, 15 never digitised)
- **1_English_PDF/Hand Writing 2**: 45 items (0 poor, 0 review, 45 never digitised)
- **1_English_PDF/English 2**: 41 items (1 poor, 40 review, 0 never digitised)
- **1_English_PDF/English 4**: 40 items (1 poor, 39 review, 0 never digitised)
- **1_English_PDF/English 5**: 40 items (2 poor, 38 review, 0 never digitised)
- **1_English_PDF/English Homework 1**: 40 items (2 poor, 38 review, 0 never digitised)

## PDFs with no digital sheet

| Reason | Files |
|---|---:|
| Scanned/image-only (no text) | 550 |
| Text parser found <2 questions | 149 |
| Skipped: same title as an existing sheet, but different content | 24 |
| Imported once, sheet since deleted | 16 |
| Identical copy of a PDF that is already a sheet | 12 |
| Non-PDF file (docx/xlsx/lnk) | 11 |
| Unreadable PDF | 2 |

By folder (excluding identical copies and non-PDF files):

| Folder | Missing | Breakdown |
|---|---:|---|
| 1_English_PDF/AQA Reading Skills_Fiction | 5 | Scanned/image-only (no text): 5 |
| 1_English_PDF/CGP SPAG Book | 40 | Scanned/image-only (no text): 40 |
| 1_English_PDF/Comprehension 1 (S&S) | 36 | Scanned/image-only (no text): 36 |
| 1_English_PDF/Comprehension 2 (S&S) | 37 | Scanned/image-only (no text): 35; Unreadable PDF: 2 |
| 1_English_PDF/Comprehension 3 (S&S) | 36 | Scanned/image-only (no text): 36 |
| 1_English_PDF/Comprehension 4 (S&S) | 38 | Scanned/image-only (no text): 38 |
| 1_English_PDF/Creative Writing/Creative Writing 3 | 1 | Skipped: same title as an existing sheet, but different content: 1 |
| 1_English_PDF/E_Comprenhension 1 (S&S) | 28 | Scanned/image-only (no text): 28 |
| 1_English_PDF/E_Comprenhension 2 (S&S) | 29 | Scanned/image-only (no text): 29 |
| 1_English_PDF/E_Comprenhension 3 (S&S) | 29 | Scanned/image-only (no text): 29 |
| 1_English_PDF/First Comprenhension_1 | 36 | Scanned/image-only (no text): 36 |
| 1_English_PDF/First_Comprenhension_2 | 36 | Scanned/image-only (no text): 36 |
| 1_English_PDF/Hand Writing 1 | 30 | Scanned/image-only (no text): 30 |
| 1_English_PDF/Hand Writing 2 | 45 | Scanned/image-only (no text): 45 |
| 2_Maths_PDF | 2 | Scanned/image-only (no text): 2 |
| 2_Maths_PDF/Algebra/Algebra 1 | 20 | Imported once, sheet since deleted: 1; Skipped: same title as an existing sheet, but different content: 19 |
| 2_Maths_PDF/Algebra/Algebra 2 | 11 | Imported once, sheet since deleted: 11 |
| 2_Maths_PDF/Decimals 1 | 5 | Imported once, sheet since deleted: 4; Text parser found <2 questions: 1 |
| 2_Maths_PDF/Early Fractions_1 (S&S) | 26 | Scanned/image-only (no text): 26 |
| 2_Maths_PDF/Early Fractions_2 (S&S) | 30 | Scanned/image-only (no text): 30 |
| 2_Maths_PDF/Fract_Dec_Percent | 1 | Text parser found <2 questions: 1 |
| 2_Maths_PDF/Fractions 1 | 15 | Text parser found <2 questions: 15 |
| 2_Maths_PDF/Number Sums_long/Drills Divide by 2 digit no | 12 | Text parser found <2 questions: 12 |
| 2_Maths_PDF/Number Sums_long/Drills Division by 2 to 9 | 29 | Text parser found <2 questions: 29 |
| 2_Maths_PDF/Number Sums_long/Drills Subtract | 13 | Text parser found <2 questions: 13 |
| 2_Maths_PDF/Number Sums_long/Drills additions | 22 | Text parser found <2 questions: 18; Skipped: same title as an existing sheet, but different content: 4 |
| 2_Maths_PDF/Number Sums_long/Multiplications 1 | 12 | Text parser found <2 questions: 12 |
| 2_Maths_PDF/Number Sums_long/Multiplications 2 | 48 | Text parser found <2 questions: 48 |
| 2_Maths_PDF/Telling the time 1 (S&S) | 18 | Scanned/image-only (no text): 18 |
| 2_Maths_PDF/Telling the time 2 (S&S) | 28 | Scanned/image-only (no text): 28 |
| 2_Maths_PDF/Telling the time 3 (S&S) | 23 | Scanned/image-only (no text): 23 |

## What it would take to finish digitising

1. **Re-run 729 text-parsed sheets through Claude vision** (291 poor + 438 needs-review; excludes the 77 duplicates proposed for removal). The vision script already exists (`scripts/vision-reprocess.js`); it would need to target by `sourceFile` rather than by title to avoid the title collisions described below.
2. **Import 741 PDFs that have no sheet** through the same vision pipeline (vision reads scanned pages, so the 550 image-only PDFs are no longer a blocker). Some of these are not worksheets (answer sheets, blank grids, handwriting practice) and can be skipped after a quick look.
3. **Human spot-check 31 vision sheets** flagged Needs review (mostly questions that depend on pictures/diagrams, or missing answer keys).
4. Estimated API cost at ~$0.03/sheet with Claude Sonnet: **(729 + 741) × $0.03 ≈ $44.1**. Long multi-page PDFs (Book Study, comprehension packs) cost more per file, so budget roughly double to be safe.
5. Worksheets that rely on pictures (clocks, shapes, shading, number lines, handwriting) need images attached (`imageUrl` is supported per question) or should stay printable-only — printing the original PDF (`sourceFile`) covers this once originals are hosted (779.5 MB for mapped PDFs, 1657 MB for the whole archive).

## Duplicate clean-up proposal

77 groups. Keep rule: referenced by lessons/responses first, then vision-processed, then better quality, more questions, lower id. Nothing is deleted by this audit.

| Kind | Sheets (id: title · topic · questions · made by · quality · refs) | Keep | Remove | Note |
|---|---|---:|---|---|
| identical content+same title same questions | #1: Intro to Algebra: Variables & Expressions · Algebra · 4q · manual · GOOD<br>#20: Intro to Algebra: Variables & Expressions · Algebra · 4q · manual · GOOD | #1 | #20 |  |
| identical content+same title same questions | #2: Solving Linear Equations · Algebra · 2q · manual · NEEDS_REVIEW<br>#21: Solving Linear Equations · Algebra · 2q · manual · NEEDS_REVIEW | #2 | #21 |  |
| identical content+same title same questions | #3: Algebra Reinforcement: One-Step Equations · Algebra · 5q · manual · NEEDS_REVIEW<br>#22: Algebra Reinforcement: One-Step Equations · Algebra · 5q · manual · NEEDS_REVIEW | #3 | #22 |  |
| identical content+same title same questions | #4: Introduction to Geometry: Angles · Geometry · 3q · manual · GOOD<br>#23: Introduction to Geometry: Angles · Geometry · 3q · manual · GOOD | #4 | #23 |  |
| identical content+same title same questions | #5: Quadratic Equations · Algebra · 4q · manual · GOOD<br>#24: Quadratic Equations · Algebra · 4q · manual · GOOD | #5 | #24 |  |
| identical content+same title same questions | #6: Fractions & Mixed Numbers · Arithmetic · 3q · manual · GOOD<br>#25: Fractions & Mixed Numbers · Arithmetic · 3q · manual · GOOD | #6 | #25 |  |
| identical content+same title same questions | #7: Fractions Remediation: Basics · Arithmetic · 3q · manual · GOOD<br>#26: Fractions Remediation: Basics · Arithmetic · 3q · manual · GOOD | #7 | #26 |  |
| identical content+same title same questions | #8: Parts of Speech: Nouns & Verbs · Grammar · 4q · manual · GOOD<br>#27: Parts of Speech: Nouns & Verbs · Grammar · 4q · manual · GOOD | #8 | #27 |  |
| identical content+same title same questions | #9: Sentence Structure & Punctuation · Grammar · 4q · manual · GOOD<br>#28: Sentence Structure & Punctuation · Grammar · 4q · manual · GOOD | #9 | #28 |  |
| identical content+same title same questions | #10: Grammar Basics Reinforcement · Grammar · 3q · manual · GOOD<br>#29: Grammar Basics Reinforcement · Grammar · 3q · manual · GOOD | #10 | #29 |  |
| identical content+same title same questions | #11: Reading Comprehension: Short Stories · Reading · 3q · manual · POOR<br>#30: Reading Comprehension: Short Stories · Reading · 3q · manual · POOR | #11 | #30 |  |
| identical content+same title same questions | #12: Essay Writing: Introduction Paragraphs · Writing · 3q · manual · GOOD<br>#31: Essay Writing: Introduction Paragraphs · Writing · 3q · manual · GOOD | #12 | #31 |  |
| identical content+same title same questions | #13: Cell Biology: Basic Cell Structure · Biology · 4q · manual · GOOD<br>#32: Cell Biology: Basic Cell Structure · Biology · 4q · manual · GOOD | #13 | #32 |  |
| identical content+same title same questions | #14: Cell Biology Reinforcement · Biology · 3q · manual · GOOD<br>#33: Cell Biology Reinforcement · Biology · 3q · manual · GOOD | #14 | #33 |  |
| identical content+same title same questions | #15: Photosynthesis & Respiration · Biology · 4q · manual · GOOD<br>#34: Photosynthesis & Respiration · Biology · 4q · manual · GOOD | #15 | #34 |  |
| identical content+same title same questions | #16: Introduction to Chemistry: Atoms & Elements · Chemistry · 4q · manual · GOOD<br>#35: Introduction to Chemistry: Atoms & Elements · Chemistry · 4q · manual · GOOD | #16 | #35 |  |
| identical content+same title same questions | #17: Forces & Motion: Newton's Laws · Physics · 4q · manual · GOOD<br>#36: Forces & Motion: Newton's Laws · Physics · 4q · manual · GOOD | #17 | #36 |  |
| identical content+same title same questions | #18: Physics Remediation: Forces Basics · Physics · 3q · manual · GOOD<br>#37: Physics Remediation: Forces Basics · Physics · 3q · manual · GOOD | #18 | #37 |  |
| identical content+same title same questions | #19: The Scientific Method · General Science · 3q · manual · GOOD<br>#38: The Scientific Method · General Science · 3q · manual · GOOD | #19 | #38 |  |
| same source pdf | #39: Algebra Introduction 1-1: Sequences (Even & Odd Numbers) · Algebra Introduction · 10q · text · GOOD<br>#702: Algebra Introduction 1 1 Sequence · Algebra Introduction · 10q · vision · GOOD | #702 | #39 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #40: Algebra Introduction 1-2: Sequences (Number Patterns) · Algebra Introduction · 14q · text · GOOD<br>#703: Algebra Introduction 1 2 Sequence · Algebra Introduction · 17q · vision · GOOD | #703 | #40 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #51: Word Problems 7-1 · Word Problems · 2q · text · NEEDS_REVIEW<br>#1224: WORD PROBLEMS 7 1 · Word problems 7 · 11q · vision · GOOD | #1224 | #51 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #52: Word Problems 7-2 · Word Problems · 2q · text · NEEDS_REVIEW<br>#1225: WORD PROBLEMS 7 2 · Word problems 7 · 11q · vision · GOOD | #1225 | #52 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #53: Word Problems 7-3 · Word Problems · 2q · text · NEEDS_REVIEW<br>#1226: WORD PROBLEMS 7 3 · Word problems 7 · 13q · vision · GOOD | #1226 | #53 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #54: Word Problems 7-4 · Word Problems · 3q · text · GOOD<br>#1227: WORD PROBLEMS 7 4 · Word problems 7 · 9q · vision · GOOD | #1227 | #54 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #55: Word Problems 7-5 · Word Problems · 2q · text · NEEDS_REVIEW<br>#1228: WORD PROBLEMS 7 5 · Word problems 7 · 9q · vision · GOOD | #1228 | #55 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #56: Word Problems 7-6 · Word Problems · 3q · text · GOOD<br>#1229: WORD PROBLEMS 7 6 · Word problems 7 · 8q · vision · GOOD | #1229 | #56 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #57: Word Problems 7-7 · Word Problems · 2q · text · NEEDS_REVIEW<br>#1230: WORD PROBLEMS 7 7 · Word problems 7 · 8q · vision · GOOD | #1230 | #57 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #58: Word Problems 7-8 · Word Problems · 4q · text · GOOD<br>#1231: WORD PROBLEMS 7 8 · Word problems 7 · 9q · vision · GOOD | #1231 | #58 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #59: Word Problems 7-9 · Word Problems · 2q · text · NEEDS_REVIEW<br>#1232: WORD PROBLEMS 7 9 · Word problems 7 · 8q · vision · GOOD | #1232 | #59 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #60: Word Problems 7-10 · Word Problems · 3q · text · GOOD<br>#1233: WORD PROBLEMS 7 10 · Word problems 7 · 8q · vision · GOOD | #1233 | #60 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #72: Spelling Sheet 1-1 · Spellings · 16q · text · NEEDS_REVIEW<br>#487: SPELLING SHEET 1 1 · Spellings 1 · 17q · vision · GOOD | #487 | #72 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #73: Spelling Sheet 1-2 · Spellings · 16q · text · GOOD<br>#488: SPELLING SHEET 1 2 · Spellings 1 · 14q · vision · GOOD | #488 | #73 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #74: Spelling Sheet 1-3 · Spellings · 16q · text · NEEDS_REVIEW<br>#489: SPELLING SHEET 1 3 · Spellings 1 · 14q · vision · GOOD | #489 | #74 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #75: Spelling Sheet 1-4 · Spellings · 16q · text · NEEDS_REVIEW<br>#490: SPELLING SHEET 1 4 · Spellings 1 · 15q · vision · GOOD | #490 | #75 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #76: Spelling Sheet 1-5 · Spellings · 16q · text · NEEDS_REVIEW<br>#491: SPELLING SHEET 1 5 · Spellings 1 · 10q · vision · GOOD | #491 | #76 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #77: Spelling Sheet 1-6 · Spellings · 16q · text · NEEDS_REVIEW<br>#492: SPELLING SHEET 1 6 · Spellings 1 · 15q · vision · GOOD | #492 | #77 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #78: Spelling Sheet 1-7 · Spellings · 16q · text · NEEDS_REVIEW<br>#493: SPELLING SHEET 1 7 · Spellings 1 · 19q · vision · GOOD | #493 | #78 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #79: Spelling Sheet 1-8 · Spellings · 14q · text · NEEDS_REVIEW<br>#494: SPELLING SHEET 1 8 · Spellings 1 · 15q · vision · GOOD | #494 | #79 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #80: Spelling Sheet 1-9 · Spellings · 16q · text · NEEDS_REVIEW<br>#495: SPELLINGS SHEET 1 9 · Spellings 1 · 13q · vision · GOOD | #495 | #80 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #81: Spelling Sheet 1-10 · Spellings · 12q · text · NEEDS_REVIEW<br>#496: SPELLING SHEET 1 10 · Spellings 1 · 17q · vision · GOOD | #496 | #81 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #82: Spelling Sheet 1-11 · Spellings · 16q · text · NEEDS_REVIEW<br>#497: SPELLING SHEET 1 11 · Spellings 1 · 13q · vision · GOOD | #497 | #82 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #83: Spelling Sheet 1-12 · Spellings · 16q · text · NEEDS_REVIEW<br>#498: SPELLING SHEET 1 12 · Spellings 1 · 10q · vision · GOOD | #498 | #83 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #84: Spelling Sheet 1-13 · Spellings · 16q · text · NEEDS_REVIEW<br>#499: SPELLING SHEET 1 13 · Spellings 1 · 16q · vision · GOOD | #499 | #84 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #85: Spelling Sheet 1-14 · Spellings · 14q · text · NEEDS_REVIEW<br>#500: SPELLING SHEET 1 14 · Spellings 1 · 12q · vision · GOOD | #500 | #85 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #86: Spelling Sheet 1-15 · Spellings · 14q · text · NEEDS_REVIEW<br>#501: SPELLING SHEET 1 15 · Spellings 1 · 15q · vision · GOOD | #501 | #86 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #90: April Foundation 5-a-Day · Corbett Five a Day · 9q · text · NEEDS_REVIEW<br>#800: April Foundation 5 a day · Corbett Five a day · 14q · text · POOR | #90 | #800 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #91: May Foundation 5-a-Day · Corbett Five a Day · 8q · text · NEEDS_REVIEW<br>#802: May Foundation 5 a day · Corbett Five a day · 15q · text · POOR | #91 | #802 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #92: June Foundation 5-a-Day · Corbett Five a Day · 6q · text · NEEDS_REVIEW<br>#801: June Foundation 5 a day · Corbett Five a day · 3q · text · NEEDS_REVIEW | #92 | #801 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #95: September Foundation 5-a-Day · Corbett Five a Day · 5q · text · NEEDS_REVIEW<br>#804: Sept Foundation 5 a day · Corbett Five a day · 15q · text · POOR | #95 | #804 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #97: November Foundation 5-a-Day · Corbett Five a Day · 6q · text · NEEDS_REVIEW<br>#803: Nov Foundation 5 a day · Corbett Five a day · 15q · text · POOR | #97 | #803 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #100: February Numeracy 5-a-Day · Corbett Five a Day · 5q · text · NEEDS_REVIEW<br>#805: Feb Numeracy 5 a day · Corbett Five a day · 3q · text · NEEDS_REVIEW | #100 | #805 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf+same title different content | #106: August Numeracy 5-a-Day · Corbett Five a Day · 5q · text · NEEDS_REVIEW<br>#806: August Numeracy 5 a day · Corbett Five a day · 6q · text · NEEDS_REVIEW | #806 | #106 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #111: Word Problems 2-1 · Word Problems · 10q · text · GOOD · **1 refs**<br>#1124: PROBLEM SHEET 2 1 · Word problems 2 · 10q · vision · GOOD | #111 | #1124 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #112: Word Problems 2H-1 · Word Problems · 10q · text · GOOD<br>#1125: PROBLEM SHEET 2H 1 · Word problems 2 · 10q · vision · GOOD | #1125 | #112 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #113: Word Problems 2-2 · Word Problems · 10q · text · GOOD · **1 refs**<br>#1126: PROBLEM SHEET 2 2 · Word problems 2 · 12q · vision · GOOD | #113 | #1126 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #114: Word Problems 2H-2 · Word Problems · 10q · text · GOOD<br>#1127: PROBLEM SHEET 2H 2 · Word problems 2 · 10q · vision · GOOD | #1127 | #114 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #115: Word Problems 2-3 · Word Problems · 10q · text · GOOD · **1 refs**<br>#1128: PROBLEM SHEET 2 3 · Word problems 2 · 11q · vision · GOOD | #115 | #1128 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #116: Word Problems 2H-3 · Word Problems · 10q · text · GOOD<br>#1129: PROBLEM SHEET 2H 3 · Word problems 2 · 10q · vision · GOOD | #1129 | #116 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #117: Word Problems 2-4 · Word Problems · 10q · text · GOOD · **1 refs**<br>#1130: PROBLEM SHEET 2 4 · Word problems 2 · 10q · vision · GOOD | #117 | #1130 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #118: Word Problems 2H-4 · Word Problems · 10q · text · GOOD<br>#1131: PROBLEM SHEET 2H 4 · Word problems 2 · 10q · vision · GOOD | #1131 | #118 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #119: Word Problems 2-5 · Word Problems · 10q · text · GOOD<br>#1132: PROBLEM SHEET 2 5 · Word problems 2 · 10q · vision · GOOD | #1132 | #119 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #120: Word Problems 2H-5 · Word Problems · 10q · text · GOOD<br>#1133: PROBLEM SHEET 2H 5 · Word problems 2 · 10q · vision · GOOD | #1133 | #120 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #121: Word Problems 2-6 · Word Problems · 10q · text · GOOD<br>#1134: PROBLEM SHEET 2 6 · Word problems 2 · 10q · vision · GOOD | #1134 | #121 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #122: Word Problems 2H-6 · Word Problems · 10q · text · GOOD<br>#1135: PROBLEM SHEET 2H 6 · Word problems 2 · 10q · vision · GOOD | #1135 | #122 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #123: Word Problems 2-7 · Word Problems · 10q · text · GOOD<br>#1136: PROBLEM SHEET 2 7 · Word problems 2 · 10q · vision · GOOD | #1136 | #123 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #124: Word Problems 2H-7 · Word Problems · 10q · text · GOOD<br>#1137: PROBLEM SHEET 2H 7 · Word problems 2 · 10q · vision · GOOD | #1137 | #124 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #125: Word Problems 2-8 · Word Problems · 10q · text · GOOD<br>#1138: PROBLEM SHEET 2 8 · Word problems 2 · 10q · vision · GOOD | #1138 | #125 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #126: Word Problems 2H-8 · Word Problems · 10q · text · GOOD<br>#1139: PROBLEM SHEET 2H 8 · Word problems 2 · 10q · vision · GOOD | #1139 | #126 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| identical content+same source pdf | #127: Word Problems 2-9 · Word Problems · 10q · text · GOOD<br>#1140: PROBLEM SHEET 2 9 · Word problems 2 · 10q · vision · GOOD | #1140 | #127 |  |
| same source pdf | #128: Word Problems 2H-9 · Word Problems · 10q · text · GOOD<br>#1141: PROBLEM SHEET 2H 9 · Word problems 2 · 10q · vision · GOOD | #1141 | #128 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #129: Word Problems 2-10 · Word Problems · 10q · text · GOOD<br>#1142: PROBLEM SHEET 2 10 · Word problems 2 · 10q · vision · GOOD | #1142 | #129 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| same source pdf | #130: Word Problems 2H-10 · Word Problems · 10q · text · GOOD<br>#1143: PROBLEM SHEET 2H 10 · Word problems 2 · 10q · vision · GOOD | #1143 | #130 | two digital versions of the same PDF (early hand-built batch sheet + later import) |
| identical content | #254: English 1 1 · English 1 · 3q · text · NEEDS_REVIEW · **2 refs**<br>#278: Copy of 01 English 1 1 · English 1 · 3q · text · NEEDS_REVIEW | #254 | #278 | made from byte-identical copies of the same PDF |
| identical content | #345: ENGLISH 3 26 · English 3 · 4q · text · NEEDS_REVIEW<br>#346: ENGLISH 3 27 · English 3 · 4q · text · NEEDS_REVIEW | #345 | #346 | made from different PDFs whose text is identical — the archive probably contains the same worksheet twice under different names; check the originals |
| identical content | #735: Addition with positive answers · Algebra · 2q · text · POOR<br>#736: Additions with positive answers · Algebra · 2q · text · POOR | #735 | #736 | made from different PDFs whose text is identical — the archive probably contains the same worksheet twice under different names; check the originals |
| identical content | #884: FRACTIONS 1 25 FRACTIONS WITH DIFFERENT DENOMINATOR · Fractions 1 · 6q · text · GOOD<br>#885: FRACTIONS 1 25 FRACTIONS WITH DIFFERENT DENOMINATORS · Fractions 1 · 6q · text · GOOD | #884 | #885 | made from different PDFs whose text is identical — the archive probably contains the same worksheet twice under different names; check the originals |

## Topic name variants

Topics that differ only by case, spacing or punctuation (rename to the recommended form):

| Variants (sheet count) | Recommended |
|---|---|
| "Corbett Five a Day" (24), "Corbett Five a day" (7) | "Corbett Five a Day" |

## Mapping notes

- 1179 of 1218 sheets are linked to their original PDF (`sheets.source_file`).
- 39 sheets have no source PDF and are marked `manual`: #1234 (hand-made "Spot the Puppy") and #1–38 — generic demo/seed content (algebra, grammar, science) inserted twice (ids 1–19 and 20–38 are identical), none referenced by any lesson. They are not part of the worksheet archive and could simply be deleted.
- Sheets #39–#130 were hand-built in an early batch (Claude writing questions from the PDFs' extracted text) and later duplicated by the automatic import; they are marked `text` and linked to their PDFs. Most are decent but are duplicates of better vision versions (see above).
- Every mapping was verified by comparing the sheet's words with the PDF text; where several same-titled PDFs existed the one whose text matched was chosen. A random sample of 22 mappings was checked by hand — all correct.

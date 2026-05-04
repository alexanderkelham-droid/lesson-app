#!/usr/bin/env node

/**
 * migrate-all.js
 *
 * Runs convert-pdfs.js across ALL worksheet directories automatically.
 * Skips duplicates, logs progress, and writes a summary report when done.
 *
 * Usage:
 *   node scripts/migrate-all.js
 *   node scripts/migrate-all.js --dry-run
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const WORKSHEETS_ROOT = path.resolve(__dirname, '../../Worksheets');
const CONVERT_SCRIPT = path.resolve(__dirname, 'convert-pdfs.js');
const LOG_FILE = path.resolve(__dirname, '../migration-log.txt');

const dryRun = process.argv.includes('--dry-run');

// All worksheet directories to process (English first, then Maths)
const DIRS = [];

function findSubDirs(parentDir) {
  if (!fs.existsSync(parentDir)) return [];
  return fs.readdirSync(parentDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(parentDir, d.name))
    .sort();
}

// Discover all top-level subject folders
const topFolders = fs.readdirSync(WORKSHEETS_ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name.includes('PDF'))
  .map(d => d.name)
  .sort();

console.log('============================================================');
console.log('  FULL WORKSHEET MIGRATION');
console.log('============================================================');
console.log(`Worksheets root: ${WORKSHEETS_ROOT}`);
console.log(`Dry run: ${dryRun}`);
console.log(`Log file: ${LOG_FILE}`);
console.log('');

// We process at the top-level folder level (e.g., 1_English_PDF, 2_Maths_PDF)
// The convert-pdfs.js script recurses into subdirectories automatically
for (const folder of topFolders) {
  DIRS.push(path.join(WORKSHEETS_ROOT, folder));
}

console.log(`Found ${DIRS.length} top-level directories to process:`);
DIRS.forEach(d => console.log(`  - ${path.basename(d)}`));
console.log('');

// Append to log file
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(msg);
}

async function main() {
  // Clear/create log file
  fs.writeFileSync(LOG_FILE, `Migration started at ${new Date().toISOString()}\n${'='.repeat(60)}\n\n`);

  const overallStats = { dirs: 0, totalCreated: 0, totalSkipped: 0, totalDuplicates: 0, totalErrors: 0 };

  for (const dir of DIRS) {
    const dirName = path.basename(dir);

    // Count PDFs in this directory
    let pdfCount = 0;
    function countPdfs(d) {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) countPdfs(path.join(d, e.name));
        else if (e.name.toLowerCase().endsWith('.pdf')) pdfCount++;
      }
    }
    countPdfs(dir);

    if (pdfCount === 0) {
      log(`SKIP: ${dirName} (no PDFs found)`);
      continue;
    }

    log(`\n${'─'.repeat(60)}`);
    log(`PROCESSING: ${dirName} (${pdfCount} PDFs)`);
    log(`${'─'.repeat(60)}`);

    overallStats.dirs++;

    // Run the convert script as a child process
    const args = [CONVERT_SCRIPT, '--dir', dir];
    if (dryRun) args.push('--dry-run');

    try {
      const result = execSync(`node ${args.map(a => `"${a}"`).join(' ')}`, {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf-8',
        timeout: 3600000, // 1 hour timeout per directory
        maxBuffer: 50 * 1024 * 1024, // 50MB output buffer
        env: { ...process.env, PATH: process.env.PATH }
      });

      // Log output
      fs.appendFileSync(LOG_FILE, result + '\n');

      // Parse summary from output
      const createdMatch = result.match(/Sheets created:\s+(\d+)/);
      const skippedMatch = result.match(/Files skipped:\s+(\d+)/);
      const duplicatesMatch = result.match(/Duplicates:\s+(\d+)/);
      const errorsMatch = result.match(/Errors:\s+(\d+)/);

      const created = createdMatch ? parseInt(createdMatch[1]) : 0;
      const skipped = skippedMatch ? parseInt(skippedMatch[1]) : 0;
      const duplicates = duplicatesMatch ? parseInt(duplicatesMatch[1]) : 0;
      const errors = errorsMatch ? parseInt(errorsMatch[1]) : 0;

      overallStats.totalCreated += created;
      overallStats.totalSkipped += skipped;
      overallStats.totalDuplicates += duplicates;
      overallStats.totalErrors += errors;

      log(`  -> Created: ${created}, Duplicates: ${duplicates}, Skipped: ${skipped}, Errors: ${errors}`);
    } catch (err) {
      const errMsg = err.stderr || err.message || 'Unknown error';
      log(`  ERROR processing ${dirName}: ${errMsg.slice(0, 500)}`);
      // Log stdout too if available (partial results)
      if (err.stdout) {
        fs.appendFileSync(LOG_FILE, err.stdout + '\n');
      }
      overallStats.totalErrors++;
    }
  }

  // Final summary
  const summary = `
${'='.repeat(60)}
MIGRATION COMPLETE
${'='.repeat(60)}
Directories processed: ${overallStats.dirs}
Total sheets created:  ${overallStats.totalCreated}
Total duplicates:      ${overallStats.totalDuplicates}
Total skipped:         ${overallStats.totalSkipped}
Total errors:          ${overallStats.totalErrors}
Finished at:           ${new Date().toISOString()}
${'='.repeat(60)}
`;
  log(summary);
}

main().catch(err => {
  log(`FATAL ERROR: ${err.message}`);
  process.exit(1);
});

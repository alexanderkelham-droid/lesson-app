// Original worksheet PDFs in the local Worksheets archive.
// sheet.sourceFile is a path relative to WORKSHEETS_DIR.
const fs = require('fs');
const path = require('path');

// Root of the archive, or null if not configured. Relative values resolve
// from server/, e.g. WORKSHEETS_DIR=../worksheets
function worksheetsRoot() {
  const dir = process.env.WORKSHEETS_DIR;
  return dir ? path.resolve(__dirname, '../..', dir) : null;
}

// Resolve `rel` under `root` and return the real path only if it is an
// existing file that stays inside root (blocks ../ and symlink escapes).
async function resolveInside(root, rel) {
  try {
    const realRoot = await fs.promises.realpath(root);
    const candidate = path.resolve(realRoot, String(rel).replace(/\0/g, ''));
    if (candidate !== realRoot && !candidate.startsWith(realRoot + path.sep)) return null;
    const real = await fs.promises.realpath(candidate);
    if (!real.startsWith(realRoot + path.sep)) return null;
    const stat = await fs.promises.stat(real);
    return stat.isFile() ? real : null;
  } catch {
    return null; // missing root or file
  }
}

module.exports = { worksheetsRoot, resolveInside };

// Build one printable PDF from the ORIGINAL scanned worksheets for one or
// more lessons (a "print run"), with a cover page per lesson listing what's
// included and what isn't (IXL tasks, sheets without an original).
//
// Delivery: the merged PDF can be far larger than Vercel's ~4.5 MB response
// limit, so when Supabase Storage is configured it's uploaded to
// packs/<id>.pdf in the private bucket and a 15-minute download link is
// returned as JSON. Packs older than a day are cleaned up automatically.
// Without storage (local dev) the PDF is sent directly.

const crypto = require('crypto');
const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const prisma = require('../prisma');
const storage = require('./storage');
const { worksheetsRoot, resolveInside } = require('./originals');

const CUSTOM_LABELS = { ixl_maths: 'IXL Maths', ixl_english: 'IXL English', paper: 'Paper activity', other: 'Task' };
const TZ = process.env.APP_TIMEZONE || 'Europe/London';

const SUBJECTS = { maths: 'Maths', english: 'English', both: 'English & Maths' };

// One student's cover-page data. `items` are plan items with optional
// sheet {id, title, topic}, customTitle/customType, status and
// studentResponses[0].score.
function packGroup({ student, tutorName, date, items, className }) {
  return {
    studentName: student.name,
    subject: SUBJECTS[student.subjectFocus] || '',
    tutorName,
    date: date ? new Date(date) : new Date(),
    className: className || null,
    items: items.map(i => {
      const resp = i.studentResponses?.[0];
      const done = i.status === 'completed';
      const score = !done ? '' : resp ? (resp.score != null ? String(Math.round(resp.score)) : 'TBC') : 'done';
      const label = i.sheet
        ? (i.sheet.topic && !i.sheet.title.toLowerCase().includes(i.sheet.topic.toLowerCase()) ? `${i.sheet.topic}, ${i.sheet.title}` : i.sheet.title)
        : (i.customTitle || CUSTOM_LABELS[i.customType] || 'Task');
      return { sheetId: i.sheet?.id || null, title: label, online: !i.sheet, score, done };
    }),
  };
}

// The /print payload (one plan) as a pack group
function packGroupFromPrintData(data) {
  return packGroup({ student: data.student, tutorName: data.tutor.name, date: data.session?.scheduledAt, items: data.items });
}

async function originalBytes(sheet) {
  if (sheet.pdfUrl) {
    const buf = await storage.download(sheet.pdfUrl);
    if (buf) return buf;
  }
  const root = worksheetsRoot();
  if (root && sheet.sourceFile) {
    const file = await resolveInside(root, sheet.sourceFile);
    if (file) return fs.promises.readFile(file);
  }
  return null;
}

// Plain-ASCII-safe text for the standard PDF fonts
const safe = s => String(s || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7E£]/g, '');

function wrap(text, font, size, maxWidth) {
  const words = safe(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// Brand colours matching the centre's paper lesson sheet (green headings,
// red name/date/score heading, green for online/IXL tasks)
const GREEN = rgb(0.2, 0.47, 0.27);      // forest
const RED = rgb(0.66, 0.2, 0.1);         // redwood
const INK = rgb(0.11, 0.1, 0.09);
const MUTED = rgb(0.47, 0.44, 0.42);
const LINE = rgb(0.25, 0.25, 0.25);

const ordinal = n => n + (['th', 'st', 'nd', 'rd'][((n % 100) - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
function longDate(d) {
  const day = Number(d.toLocaleString('en-GB', { day: 'numeric', timeZone: TZ }));
  return `${ordinal(day)} ${d.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: TZ })}`;
}

// The Redwood lesson sheet: a bordered table like the centre's own template
function drawLessonSheet(out, g, { font, bold }) {
  const page = out.addPage([595.28, 841.89]);
  const X0 = 70, X3 = 525;              // table edges
  const XS = 450;                        // score column starts
  const XN = 92;                         // number column ends
  const XM = 260;                        // middle split in the header rows
  let y = 841.89 - 80;                   // current top edge

  const hline = (yy, x1 = X0, x2 = X3) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.8, color: LINE });
  const vline = (x, y1, y2) => page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: 0.8, color: LINE });
  const center = (text, f, size, x1, x2, yy, color) => {
    const t = safe(text); const w = f.widthOfTextAtSize(t, size);
    page.drawText(t, { x: x1 + Math.max(4, (x2 - x1 - w) / 2), y: yy, size, font: f, color });
  };
  const top = y;

  // Row 1: welcome
  const r1 = 62;
  center('Welcome to Redwood Scholars Tuition!', bold, 14, X0, XS, y - 30, GREEN);
  hline(y); y -= r1; hline(y);

  // Row 2: student name | date
  const r2 = 56;
  const nameLines = wrap(g.studentName, bold, 15, XM - X0 - 12);
  nameLines.slice(0, 2).forEach((l, i) => page.drawText(l, { x: X0 + 8, y: y - 24 - i * 17, size: 15, font: bold, color: RED }));
  center(longDate(g.date), bold, 13, XM, XS, y - (g.className ? 24 : 32), RED);
  if (g.className) center(g.className, font, 9, XM, XS, y - 40, MUTED);
  vline(XM, y, y - r2);
  y -= r2; hline(y);

  // Row 3: subject | tutor | Score%
  const r3 = 44;
  center(g.subject || ' ', bold, 13, X0, XM, y - 27, GREEN);
  center(`Tutor: ${g.tutorName}`, bold, 13, XM, XS, y - 27, GREEN);
  center('Score%', bold, 11, XS, X3, y - 27, RED);
  vline(XM, y, y - r3);
  y -= r3; hline(y);

  // Task rows (at least 9, like the paper sheet)
  const rows = [...g.items];
  while (rows.length < 9) rows.push(null);
  const bottomLimit = 150;
  rows.forEach((it, idx) => {
    if (y < bottomLimit) return;
    const lines = it ? wrap(it.title, font, 11, XS - XN - 12) : [];
    const note = it && it.sheetId && !it.doc ? 'No scan attached: print from the digital pack' : '';
    const h = Math.max(it ? 34 : 24, 14 + lines.length * 14 + (note ? 11 : 0));
    const rowTop = y;
    page.drawText(String(idx + 1), { x: X0 + 6, y: rowTop - 15, size: 10, font, color: INK });
    lines.forEach((l, li) => page.drawText(l, { x: XN + 6, y: rowTop - 16 - li * 14, size: 11, font, color: it.online ? GREEN : INK }));
    if (note) page.drawText(note, { x: XN + 6, y: rowTop - 16 - lines.length * 14 + 2, size: 7.5, font, color: MUTED });
    if (it?.score) page.drawText(safe(it.score), { x: XS + 8, y: rowTop - 16, size: 11, font, color: INK });
    vline(XN, rowTop, rowTop - h);
    y -= h; hline(y);
  });

  // Homework row
  const hw = 58;
  page.drawText('Homework:', { x: XN + 6, y: y - 18, size: 11, font: bold, color: INK });
  vline(XN, y, y - hw);
  y -= hw; hline(y);

  // Outer frame + score column divider
  vline(X0, top, y); vline(X3, top, y); vline(XS, top, y);
  return page;
}

async function buildPack(groups) {
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const sheetIds = [...new Set(groups.flatMap(g => g.items.map(i => i.sheetId)).filter(Boolean))];
  const sheets = await prisma.sheet.findMany({ where: { id: { in: sheetIds } }, select: { id: true, sourceFile: true, pdfUrl: true } });
  const byId = Object.fromEntries(sheets.map(s => [s.id, s]));
  const cache = new Map(); // sheetId → loaded PDFDocument | null
  const summary = { pages: 0, included: 0, missing: [] };

  for (const g of groups) {
    // Resolve originals first so the cover can note what has no scan
    for (const it of g.items) {
      if (!it.sheetId) continue;
      if (!cache.has(it.sheetId)) {
        let doc = null;
        try {
          const bytes = byId[it.sheetId] && await originalBytes(byId[it.sheetId]);
          if (bytes) doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        } catch { doc = null; }
        cache.set(it.sheetId, doc);
      }
      it.doc = cache.get(it.sheetId);
    }
    drawLessonSheet(out, g, { font, bold });
    summary.pages += 1;

    // The originals, in lesson order
    for (const it of g.items) {
      if (!it.doc) { if (it.sheetId) summary.missing.push(`${g.studentName}: ${it.title}`); continue; }
      const pages = await out.copyPages(it.doc, it.doc.getPageIndices());
      pages.forEach(p => out.addPage(p));
      summary.pages += pages.length;
      summary.included += 1;
    }
  }
  return { bytes: await out.save(), summary };
}

async function sendOriginalsPack(res, groups, filenameBase) {
  const { bytes, summary } = await buildPack(groups);
  const filename = `${safe(filenameBase).replace(/[^\w-]+/g, '-').replace(/-+/g, '-')}.pdf`;
  res.setHeader('X-Pack-Summary', JSON.stringify({ pages: summary.pages, included: summary.included, missing: summary.missing.length }));

  if (storage.configured()) {
    storage.removeOlderThan('packs', 24 * 60 * 60 * 1000); // tidy old packs (no await)
    const key = `packs/${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(6).toString('hex')}-${filename}`;
    const ref = await storage.upload(key, Buffer.from(bytes));
    const url = await storage.signedUrl(ref, 15 * 60);
    return res.json({ url, filename, ...summary });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(Buffer.from(bytes));
}

module.exports = { buildPack, sendOriginalsPack, packGroup, packGroupFromPrintData };

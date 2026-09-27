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

// Turn the /print payload into a pack group
function packGroupFromPrintData(data) {
  const when = data.session
    ? new Date(data.session.scheduledAt).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: TZ })
    : data.scope === 'unscheduled' ? 'Unscheduled items' : 'All items in plan';
  return {
    heading: data.student.name,
    subheading: `${when} · ${data.plan.title} · Tutor: ${data.tutor.name}`,
    items: data.items.map(i => ({
      sheetId: i.sheet?.id || null,
      title: i.sheet ? i.sheet.title : i.customTitle,
      kind: i.sheet ? null : (CUSTOM_LABELS[i.customType] || 'Task'),
      done: i.status === 'completed',
    })),
  };
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
    // Resolve originals first so the cover can say what's included
    for (const it of g.items) {
      if (!it.sheetId) { it.status = it.kind; continue; }
      if (!cache.has(it.sheetId)) {
        let doc = null;
        try {
          const bytes = byId[it.sheetId] && await originalBytes(byId[it.sheetId]);
          if (bytes) doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        } catch { doc = null; }
        cache.set(it.sheetId, doc);
      }
      it.doc = cache.get(it.sheetId);
      it.status = it.doc ? `original, ${it.doc.getPageCount()} page${it.doc.getPageCount() === 1 ? '' : 's'}` : 'NO ORIGINAL - print from the digital pack';
    }

    // Cover page (A4)
    const page = out.addPage([595.28, 841.89]);
    const left = 56, width = 595.28 - 112;
    let y = 841.89 - 70;
    page.drawText('REDWOOD SCHOLARS', { x: left, y, size: 9, font: bold, color: rgb(0.55, 0.16, 0.12) });
    y -= 36;
    page.drawText(safe(g.heading), { x: left, y, size: 26, font: bold });
    y -= 22;
    for (const line of wrap(g.subheading, font, 11, width)) { page.drawText(line, { x: left, y, size: 11, font, color: rgb(0.3, 0.3, 0.3) }); y -= 15; }
    y -= 20;
    page.drawText('In this lesson', { x: left, y, size: 13, font: bold });
    y -= 22;
    g.items.forEach((it, idx) => {
      if (y < 80) return;
      page.drawRectangle({ x: left, y: y - 2, width: 10, height: 10, borderWidth: 1, borderColor: rgb(0.2, 0.2, 0.2) });
      const title = `${idx + 1}. ${it.title}${it.done ? ' (already completed)' : ''}`;
      const lines = wrap(title, font, 11, width - 20);
      lines.forEach((l, li) => { page.drawText(l, { x: left + 18, y: y - li * 14, size: 11, font }); });
      y -= lines.length * 14;
      page.drawText(safe(it.status), { x: left + 18, y, size: 8.5, font, color: it.doc || !it.sheetId ? rgb(0.45, 0.45, 0.45) : rgb(0.7, 0.2, 0.1) });
      y -= 18;
    });
    summary.pages += 1;

    // The originals, in lesson order
    for (const it of g.items) {
      if (!it.doc) { if (it.sheetId) summary.missing.push(`${g.heading}: ${it.title}`); continue; }
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

module.exports = { buildPack, sendOriginalsPack, packGroupFromPrintData };

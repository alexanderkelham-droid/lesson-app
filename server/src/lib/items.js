// Shared lesson-plan item behaviour.

// When an item is completed after it was carried over (e.g. the student
// finishes last week's sheet late, or the tutor marks it done), the untouched
// copies waiting in later sessions are no longer needed — remove them so the
// student isn't given the same work twice. Copies that already have work on
// them, or are completed themselves, are kept.
// `db` may be the prisma client or a transaction client.
async function removeStaleCarryCopies(db, itemId) {
  const seen = new Set();
  let frontier = [itemId];
  const toDelete = [];
  // Follow the chain: original → copy → copy-of-copy …
  while (frontier.length) {
    const copies = await db.lessonPlanItem.findMany({
      where: { carriedFromId: { in: frontier } },
      select: { id: true, status: true, _count: { select: { studentResponses: true } } }
    });
    frontier = [];
    for (const c of copies) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      if (c.status !== 'completed' && c._count.studentResponses === 0) toDelete.push(c.id);
      frontier.push(c.id);
    }
  }
  if (toDelete.length === 0) return 0;
  // Re-point any deeper copies at the original so nothing dangles
  await db.lessonPlanItem.updateMany({ where: { carriedFromId: { in: toDelete } }, data: { carriedFromId: itemId } });
  const { count } = await db.lessonPlanItem.deleteMany({ where: { id: { in: toDelete } } });
  return count;
}

module.exports = { removeStaleCarryCopies };

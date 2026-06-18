import { prisma } from '../lib/db.js';

export async function recalculateBridgingScores(): Promise<number> {
  const dirty = await (prisma as any).articleContribution.findMany({
    where: { needsRecalc: true, status: 'ACTIVE' },
    select: {
      id: true,
      articleId: true,
      validations: {
        where: {
          type: { in: ['WELL_SOURCED', 'ADDS_NUANCE'] },
        },
        select: { userId: true },
      },
    },
  });

  if (dirty.length === 0) return 0;

  let processed = 0;

  for (const contribution of dirty) {
    const validatorIds = contribution.validations.map((v: { userId: string }) => v.userId);

    if (validatorIds.length <= 1) {
      await (prisma as any).articleContribution.update({
        where: { id: contribution.id },
        data: { bridgingScore: 0, needsRecalc: false },
      });
      processed++;
      continue;
    }

    const positions = await prisma.articleOpinionPosition.findMany({
      where: {
        articleId: contribution.articleId,
        userId: { in: validatorIds },
        selectedPosition: { not: null },
      },
      select: { selectedPosition: true },
    });

    const values = positions
      .map((p) => p.selectedPosition)
      .filter((v): v is number => v !== null);

    const n = values.length;

    if (n <= 1) {
      await (prisma as any).articleContribution.update({
        where: { id: contribution.id },
        data: { bridgingScore: 0, needsRecalc: false },
      });
      processed++;
      continue;
    }

    const mean = values.reduce((sum, v) => sum + v, 0) / n;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
    const score = variance * Math.log(1 + n);

    await (prisma as any).articleContribution.update({
      where: { id: contribution.id },
      data: { bridgingScore: score, needsRecalc: false },
    });
    processed++;
  }

  return processed;
}

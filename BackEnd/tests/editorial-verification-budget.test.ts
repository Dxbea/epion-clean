import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { EditorialVerificationBudgetService } from '../src/lib/editorial-verification/budget-service.js';
import { resolveEditorialVerificationRuntimeFlags } from '../src/lib/editorial-verification/runtime-flags.js';

describe('editorial verification daily budgets', () => {
  it('reserves requests and estimated cost atomically', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const client = { editorialVerificationDailyUsage: { upsert, updateMany } } as unknown as PrismaClient;
    const flags = resolveEditorialVerificationRuntimeFlags({
      EDITORIAL_VERIFICATION_MAX_DAILY_SERPER: '2',
      EDITORIAL_VERIFICATION_MAX_DAILY_COST_MICROS: '5000',
      EDITORIAL_VERIFICATION_SERPER_COST_MICROS: '1000',
    });
    await new EditorialVerificationBudgetService(client, flags, () => new Date('2026-07-18T15:30:00Z')).consume('SERPER');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { day: new Date('2026-07-18T00:00:00Z') } }));
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ serperRequestCount: { lte: 1 }, estimatedCostMicros: { lte: 4000 } }),
      data: expect.objectContaining({ serperRequestCount: { increment: 1 }, estimatedCostMicros: { increment: 1000 } }),
    }));
  });

  it('fails closed when a concurrent reservation consumed the remaining quota', async () => {
    const client = {
      editorialVerificationDailyUsage: {
        upsert: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaClient;
    const service = new EditorialVerificationBudgetService(
      client,
      resolveEditorialVerificationRuntimeFlags({ EDITORIAL_VERIFICATION_MAX_DAILY_MISTRAL: '1' }),
      () => new Date('2026-07-18T23:00:00Z'),
    );
    await expect(service.consume('MISTRAL')).rejects.toMatchObject({
      name: 'EditorialVerificationBudgetExceededError',
      kind: 'MISTRAL',
      resetAt: new Date('2026-07-19T00:00:00Z'),
    });
  });
});

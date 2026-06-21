import { beforeEach, describe, expect, it, vi } from 'vitest';

type UsageRecord = {
  userId: string;
  dailyCredits: number;
  lastResetAt: Date;
  articlesCreated: number;
  articleQuotaResetAt: Date;
  plan: 'FREE' | 'READER' | 'PREMIUM';
};

const {
  prismaMock,
  usageStore,
  roleStore,
  cloneUsage,
} = vi.hoisted(() => {
  type UsageRecord = {
    userId: string;
    dailyCredits: number;
    lastResetAt: Date;
    articlesCreated: number;
    articleQuotaResetAt: Date;
    plan: 'FREE' | 'READER' | 'PREMIUM';
  };

  const usageStore = new Map<string, UsageRecord>();
  const roleStore = new Map<string, 'USER' | 'ADMIN'>();

  const cloneUsage = (usage: UsageRecord | undefined) => {
    if (!usage) return null;
    return {
      ...usage,
      lastResetAt: new Date(usage.lastResetAt),
      articleQuotaResetAt: new Date(usage.articleQuotaResetAt),
      user: { role: roleStore.get(usage.userId) ?? 'USER' },
    };
  };

  const matchesWhere = (usage: UsageRecord, where: any) => {
    if (where.articleQuotaResetAt) {
      const expected = new Date(where.articleQuotaResetAt).getTime();
      if (usage.articleQuotaResetAt.getTime() !== expected) return false;
    }

    if (where.articlesCreated?.lt !== undefined && !(usage.articlesCreated < where.articlesCreated.lt)) {
      return false;
    }

    if (where.articlesCreated?.gt !== undefined && !(usage.articlesCreated > where.articlesCreated.gt)) {
      return false;
    }

    if (where.dailyCredits?.gte !== undefined && !(usage.dailyCredits >= where.dailyCredits.gte)) {
      return false;
    }

    return true;
  };

  const applyData = (usage: UsageRecord, data: any) => {
    if (data.articlesCreated?.increment) usage.articlesCreated += data.articlesCreated.increment;
    if (data.articlesCreated?.decrement) usage.articlesCreated -= data.articlesCreated.decrement;
    if (typeof data.articlesCreated === 'number') usage.articlesCreated = data.articlesCreated;
    if (data.articleQuotaResetAt) usage.articleQuotaResetAt = new Date(data.articleQuotaResetAt);
    if (data.dailyCredits?.decrement) usage.dailyCredits -= data.dailyCredits.decrement;
    if (typeof data.dailyCredits === 'number') usage.dailyCredits = data.dailyCredits;
    if (data.lastResetAt) usage.lastResetAt = new Date(data.lastResetAt);
  };

  const prismaMock = {
    userUsage: {
      findUnique: vi.fn(async ({ where }: any) => cloneUsage(usageStore.get(where.userId))),
      create: vi.fn(async ({ data }: any) => {
        if (usageStore.has(data.userId)) {
          const error: any = new Error('Unique constraint failed');
          error.code = 'P2002';
          throw error;
        }

        const now = new Date();
        const usage: UsageRecord = {
          userId: data.userId,
          dailyCredits: data.dailyCredits ?? 700,
          lastResetAt: data.lastResetAt ? new Date(data.lastResetAt) : now,
          articlesCreated: data.articlesCreated ?? 0,
          articleQuotaResetAt: data.articleQuotaResetAt ? new Date(data.articleQuotaResetAt) : now,
          plan: data.plan ?? 'FREE',
        };
        usageStore.set(data.userId, usage);
        return cloneUsage(usage);
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const usage = usageStore.get(where.userId);
        if (!usage || !matchesWhere(usage, where)) return { count: 0 };
        applyData(usage, data);
        return { count: 1 };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const usage = usageStore.get(where.userId);
        if (!usage) throw new Error('Usage not found');
        applyData(usage, data);
        return cloneUsage(usage);
      }),
    },
  };

  return { prismaMock, usageStore, roleStore, cloneUsage };
});

vi.mock('../src/lib/db.js', () => ({ prisma: prismaMock }));
vi.mock('../src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const seedUsage = (overrides: Partial<UsageRecord> & { userId: string; role?: 'USER' | 'ADMIN' }) => {
  const resetAt = overrides.articleQuotaResetAt ?? new Date('2026-06-17T12:00:00.000Z');
  usageStore.set(overrides.userId, {
    dailyCredits: 700,
    lastResetAt: resetAt,
    articlesCreated: 0,
    articleQuotaResetAt: resetAt,
    plan: 'READER',
    ...overrides,
  });
  roleStore.set(overrides.userId, overrides.role ?? 'USER');
};

const expectQuotaExceeded = async (promise: Promise<unknown>) => {
  await expect(promise).rejects.toThrow('WEEKLY_QUOTA_EXCEEDED');
};

describe('article quota reservations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-21T12:00:00.000Z'));
    usageStore.clear();
    roleStore.clear();
    vi.clearAllMocks();
  });

  it('respects the weekly quota in normal usage', async () => {
    const { reserveArticleQuota } = await import('../src/lib/billing-service.js');
    seedUsage({ userId: 'reader-1', plan: 'READER', articlesCreated: 0 });

    const reservation = await reserveArticleQuota('reader-1');

    expect(reservation.consumed).toBe(true);
    expect(usageStore.get('reader-1')?.articlesCreated).toBe(1);
    await expectQuotaExceeded(reserveArticleQuota('reader-1'));
    expect(usageStore.get('reader-1')?.articlesCreated).toBe(1);
  });

  it('does not exceed the limit for concurrent requests', async () => {
    const { reserveArticleQuota } = await import('../src/lib/billing-service.js');
    seedUsage({ userId: 'reader-concurrent', plan: 'READER', articlesCreated: 0 });

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => reserveArticleQuota('reader-concurrent'))
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(4);
    expect(usageStore.get('reader-concurrent')?.articlesCreated).toBe(1);
  });

  it('releases a reservation when creation fails before the final article write', async () => {
    const { reserveArticleQuota, releaseArticleQuota } = await import('../src/lib/billing-service.js');
    seedUsage({ userId: 'premium-failure', plan: 'PREMIUM', articlesCreated: 0 });

    const reservation = await reserveArticleQuota('premium-failure');
    expect(usageStore.get('premium-failure')?.articlesCreated).toBe(1);

    await releaseArticleQuota(reservation);

    expect(usageStore.get('premium-failure')?.articlesCreated).toBe(0);
  });

  it('starts a new quota period after the weekly reset date', async () => {
    const { reserveArticleQuota } = await import('../src/lib/billing-service.js');
    seedUsage({
      userId: 'reader-next-week',
      plan: 'READER',
      articlesCreated: 1,
      articleQuotaResetAt: new Date('2026-06-10T12:00:00.000Z'),
    });

    await reserveArticleQuota('reader-next-week');

    const usage = usageStore.get('reader-next-week');
    expect(usage?.articlesCreated).toBe(1);
    expect(usage?.articleQuotaResetAt.toISOString()).toBe('2026-06-21T12:00:00.000Z');
  });

  it('creates missing usage as free and applies the free article limit', async () => {
    const { reserveArticleQuota } = await import('../src/lib/billing-service.js');
    roleStore.set('new-free-user', 'USER');

    await expectQuotaExceeded(reserveArticleQuota('new-free-user'));

    const usage = usageStore.get('new-free-user');
    expect(usage?.plan).toBe('FREE');
    expect(usage?.articlesCreated).toBe(0);
  });

  it('allows only one concurrent request for the last available premium slot', async () => {
    const { reserveArticleQuota } = await import('../src/lib/billing-service.js');
    seedUsage({ userId: 'premium-last-slot', plan: 'PREMIUM', articlesCreated: 9 });

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => reserveArticleQuota('premium-last-slot'))
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(4);
    expect(usageStore.get('premium-last-slot')?.articlesCreated).toBe(10);
  });

  it('does not release quota when no reservation was acquired', async () => {
    const { releaseArticleQuota } = await import('../src/lib/billing-service.js');
    seedUsage({ userId: 'not-acquired', plan: 'READER', articlesCreated: 1 });

    await releaseArticleQuota({
      userId: 'not-acquired',
      consumed: false,
      articleQuotaResetAt: new Date('2026-06-17T12:00:00.000Z'),
    });

    expect(usageStore.get('not-acquired')?.articlesCreated).toBe(1);
  });

  it('does not decrement articlesCreated below zero', async () => {
    const { releaseArticleQuota } = await import('../src/lib/billing-service.js');
    seedUsage({ userId: 'zero-release', plan: 'READER', articlesCreated: 0 });

    await releaseArticleQuota({
      userId: 'zero-release',
      consumed: true,
      articleQuotaResetAt: new Date('2026-06-17T12:00:00.000Z'),
    });

    expect(usageStore.get('zero-release')?.articlesCreated).toBe(0);
  });

  it('does not release an old reservation after a new weekly window has started', async () => {
    const { releaseArticleQuota } = await import('../src/lib/billing-service.js');
    seedUsage({
      userId: 'new-week-release',
      plan: 'READER',
      articlesCreated: 1,
      articleQuotaResetAt: new Date('2026-06-21T12:00:00.000Z'),
    });

    await releaseArticleQuota({
      userId: 'new-week-release',
      consumed: true,
      articleQuotaResetAt: new Date('2026-06-10T12:00:00.000Z'),
    });

    expect(usageStore.get('new-week-release')?.articlesCreated).toBe(1);
  });

  it('applies premium limits and bypasses quota for admins', async () => {
    const { reserveArticleQuota } = await import('../src/lib/billing-service.js');
    seedUsage({ userId: 'premium-user', plan: 'PREMIUM', articlesCreated: 0 });
    seedUsage({ userId: 'admin-user', plan: 'FREE', articlesCreated: 0, role: 'ADMIN' });

    for (let index = 0; index < 10; index += 1) {
      await reserveArticleQuota('premium-user');
    }

    await expectQuotaExceeded(reserveArticleQuota('premium-user'));
    expect(usageStore.get('premium-user')?.articlesCreated).toBe(10);

    const adminReservation = await reserveArticleQuota('admin-user');
    expect(adminReservation.consumed).toBe(false);
    expect(usageStore.get('admin-user')?.articlesCreated).toBe(0);
  });
});
import type { Request } from 'express';
import { redis } from './redis.js';
import { logger } from './logger.js';

type ContributionRateAction = 'create' | 'validate' | 'moderate' | 'report';

const LIMITS: Record<ContributionRateAction, Array<{ windowMs: number; max: number }>> = {
  create: [
    { windowMs: 60 * 60 * 1000, max: 10 },
    { windowMs: 24 * 60 * 60 * 1000, max: 40 },
  ],
  validate: [{ windowMs: 60 * 60 * 1000, max: 120 }],
  moderate: [{ windowMs: 60 * 60 * 1000, max: 30 }],
  report: [{ windowMs: 24 * 60 * 60 * 1000, max: 20 }],
};

const memoryCounters = new Map<string, { count: number; expiresAt: number }>();

function clientKey(req: Request, userId: string | null, action: ContributionRateAction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `${action}:${userId || `ip:${ip}`}`;
}

async function incrementRedis(key: string, windowMs: number) {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, windowMs);
  }
  return count;
}

function incrementMemory(key: string, windowMs: number) {
  const now = Date.now();
  const existing = memoryCounters.get(key);
  if (!existing || existing.expiresAt <= now) {
    memoryCounters.set(key, { count: 1, expiresAt: now + windowMs });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

export async function enforceContributionRateLimit(
  req: Request,
  userId: string | null,
  action: ContributionRateAction,
) {
  const windows = LIMITS[action];
  const baseKey = clientKey(req, userId, action);

  for (const window of windows) {
    const key = `contribution-rate:${baseKey}:${window.windowMs}`;
    let count: number;

    try {
      count = await incrementRedis(key, window.windowMs);
    } catch (error) {
      logger.warn('Contribution rate limit Redis fallback', {
        module: 'ContributionRateLimit',
        action,
        error: error instanceof Error ? error.message : String(error),
      });
      count = incrementMemory(key, window.windowMs);
    }

    if (count > window.max) {
      const err: any = new Error('Contribution rate limit exceeded.');
      err.status = 429;
      err.code = 'CONTRIBUTION_RATE_LIMITED';
      err.retryAfter = Math.ceil(window.windowMs / 1000);
      throw err;
    }
  }
}

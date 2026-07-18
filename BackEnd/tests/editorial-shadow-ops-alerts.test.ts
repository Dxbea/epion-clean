import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { resolveEditorialShadowOpsFlags } from '../src/lib/editorial-verification/ops-flags.js';
import { resolveEditorialVerificationRuntimeFlags } from '../src/lib/editorial-verification/runtime-flags.js';
import { buildEditorialOperationalAlerts, getEditorialCalibrationSummary } from '../src/lib/editorial-verification/ops-service.js';

function job(id: string, timestamp: number) { return { id, name: 'test', data: {}, attemptsMade: 0, timestamp, processedOn: null, failedReason: null }; }

describe('editorial shadow operational alerts and calibration', () => {
  it('reports budgets, provider failures, pending extraction, stalled queues and DLQ', async () => {
    const now = new Date('2026-07-20T12:00:00Z');
    const client = {
      editorialVerificationDailyUsage: { findUnique: vi.fn().mockResolvedValue({ verificationCount: 9, serperRequestCount: 0, mistralRequestCount: 0, openaiRequestCount: 0, estimatedCostMicros: 0 }) },
      editorialVerificationRun: { findMany: vi.fn().mockResolvedValue(Array.from({ length: 5 }, () => ({ status: 'HUMAN_REVIEW_REQUIRED', gateReasons: ['MISTRAL_UNAVAILABLE'], error: 'SERPER unavailable' }))) },
      ingestedDocument: { count: vi.fn().mockResolvedValue(30) },
    } as unknown as PrismaClient;
    const queues = {
      verificationQueue: {
        getJobCounts: vi.fn().mockResolvedValue({ waiting: 25, active: 0, delayed: 0, failed: 0, paused: 0 }),
        getJobs: vi.fn().mockResolvedValue([job('old', now.getTime() - 60 * 60_000)]),
      },
      deadLetterQueue: {
        getJobCounts: vi.fn().mockResolvedValue({ waiting: 1, active: 0, delayed: 0, failed: 0, completed: 0 }),
        getJobs: vi.fn().mockResolvedValue([job('dlq', now.getTime())]),
      },
    };
    const result = await buildEditorialOperationalAlerts({
      client, queues: queues as never, now,
      opsFlags: resolveEditorialShadowOpsFlags({}),
      runtimeFlags: resolveEditorialVerificationRuntimeFlags({ EDITORIAL_VERIFICATION_MAX_DAILY_RUNS: '10' }),
    });
    expect(result.alerts.map((item) => item.code)).toEqual(expect.arrayContaining([
      'BUDGET_NEAR_LIMIT', 'FAIL_CLOSED_RATE_HIGH', 'SERPER_UNAVAILABLE', 'MISTRAL_UNAVAILABLE',
      'SERPER_DOCUMENTS_PENDING', 'QUEUE_BACKLOG', 'QUEUE_STALLED', 'DLQ_NOT_EMPTY',
    ]));
  });

  it('summarizes shadow decisions and reasons without changing any Article', async () => {
    const client = {
      editorialVerificationRun: { findMany: vi.fn().mockResolvedValue([
        { shadowDecision: 'WOULD_AUTO_PUBLISH', shadowReasons: ['ALL_SHADOW_AUTO_GATES_PASSED'], gateReasons: [], status: 'PASSED' },
        { shadowDecision: 'WOULD_REQUIRE_HUMAN', shadowReasons: ['SENSITIVE_TOPIC'], gateReasons: ['MISTRAL_PRIMARY_SOURCE_NOT_CITED'], status: 'HUMAN_REVIEW_REQUIRED' },
      ]) },
      article: { update: vi.fn(), updateMany: vi.fn() },
    } as unknown as PrismaClient;
    const summary = await getEditorialCalibrationSummary(client, new Date('2026-07-01T00:00:00Z'));
    expect(summary).toMatchObject({ totalRuns: 2, decisions: { WOULD_AUTO_PUBLISH: 1, WOULD_REQUIRE_HUMAN: 1 } });
    expect((client.article.update as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

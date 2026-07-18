import type { PrismaClient } from '@prisma/client';
import { DelayedError, type Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { DocumentPipelineMetrics } from '../src/lib/document-corpus/document-metrics.js';
import {
  buildDocumentJobId,
  enqueueDocumentJob,
  type DocumentJobData,
} from '../src/lib/document-corpus/document-queue.js';
import { resolveDocumentPipelineRuntimeFlags } from '../src/lib/document-corpus/runtime-flags.js';
import type { DiscoveryRedis } from '../src/lib/discovery/redis-lock.js';
import {
  buildDocumentDeadLetterData,
  createDocumentJobProcessor,
  isTerminalDocumentJobFailure,
} from '../src/workers/document-corpus.worker.js';

class WorkerRedis implements DiscoveryRedis {
  lockAvailable = true;
  killValue: string | null = null;
  releases = 0;

  async set(): Promise<string | null> {
    return this.lockAvailable ? 'OK' : null;
  }

  async get(): Promise<string | null> {
    return this.killValue;
  }

  async eval(): Promise<number> {
    this.releases++;
    return 1;
  }
}

function flags(overrides: NodeJS.ProcessEnv = {}) {
  return resolveDocumentPipelineRuntimeFlags({
    DOCUMENT_PIPELINE_ENABLED: 'true',
    DOCUMENT_PIPELINE_KILL_SWITCH: 'false',
    ...overrides,
  });
}

function job(overrides: Partial<Job<DocumentJobData>> = {}): Job<DocumentJobData> {
  return {
    id: 'job-1',
    data: {
      documentId: 'document-1',
      revision: 'initial',
      requestedAt: '2026-07-18T12:00:00.000Z',
      trigger: 'MANUAL',
    },
    attemptsMade: 0,
    opts: { attempts: 3 },
    token: 'token',
    moveToDelayed: vi.fn(async () => undefined),
    ...overrides,
  } as Job<DocumentJobData>;
}

describe('disabled-by-default document corpus worker', () => {
  it('defaults to disabled with an active kill switch and validates flags', () => {
    expect(resolveDocumentPipelineRuntimeFlags({})).toMatchObject({
      enabled: false,
      killSwitch: true,
      workerConcurrency: 1,
    });
    expect(() => resolveDocumentPipelineRuntimeFlags({
      DOCUMENT_PIPELINE_ENABLED: 'yes',
    })).toThrow('DOCUMENT_PIPELINE_ENABLED');
  });

  it('builds stable job IDs from the document and revision', () => {
    expect(buildDocumentJobId('document-1', 'v1'))
      .toBe(buildDocumentJobId('document-1', 'v1'));
    expect(buildDocumentJobId('document-1', 'v1'))
      .not.toBe(buildDocumentJobId('document-1', 'v2'));
  });

  it('enqueues repeated revisions with the same BullMQ identity', async () => {
    const queue = { add: vi.fn(async () => ({})) };
    const data: DocumentJobData = {
      documentId: 'document-1',
      revision: 'v1',
      requestedAt: '2026-07-18T12:00:00.000Z',
      trigger: 'MANUAL',
    };
    await enqueueDocumentJob(queue, data);
    await enqueueDocumentJob(queue, data);
    const firstOptions = queue.add.mock.calls[0][2];
    const secondOptions = queue.add.mock.calls[1][2];
    expect(firstOptions.jobId).toBe(secondOptions.jobId);
  });

  it('delays jobs while the environment kill switch is active', async () => {
    const redis = new WorkerRedis();
    const processDocument = vi.fn();
    const processor = createDocumentJobProcessor({
      client: {} as PrismaClient,
      redis,
      flags: flags({ DOCUMENT_PIPELINE_KILL_SWITCH: 'true' }),
      metrics: new DocumentPipelineMetrics(),
      processDocument,
    });
    const queuedJob = job();

    await expect(processor(queuedJob, 'token')).rejects.toBeInstanceOf(DelayedError);
    expect(processDocument).not.toHaveBeenCalled();
    expect(queuedJob.moveToDelayed).toHaveBeenCalledOnce();
  });

  it('prevents concurrent processing with a per-document lock', async () => {
    const redis = new WorkerRedis();
    redis.lockAvailable = false;
    const metrics = new DocumentPipelineMetrics();
    const processDocument = vi.fn();
    const processor = createDocumentJobProcessor({
      client: {} as PrismaClient,
      redis,
      flags: flags(),
      metrics,
      processDocument,
    });

    await expect(processor(job(), 'token')).rejects.toBeInstanceOf(DelayedError);
    expect(processDocument).not.toHaveBeenCalled();
    expect(metrics.snapshot().documentLockMisses).toBe(1);
  });

  it('records result metrics and always releases the lock', async () => {
    const redis = new WorkerRedis();
    const metrics = new DocumentPipelineMetrics();
    const processDocument = vi.fn(async () => ({
      documentId: 'document-1',
      outcome: 'INDEXED',
      reason: null,
      contentHash: 'hash',
      duplicateOfId: null,
      extractedCharacters: 100,
      chunks: 2,
      inputTokens: 50,
      estimatedCostMicros: 3,
    }));
    const processor = createDocumentJobProcessor({
      client: {} as PrismaClient,
      redis,
      flags: flags(),
      metrics,
      processDocument,
    });

    await expect(processor(job(), 'token')).resolves.toMatchObject({ outcome: 'INDEXED' });
    expect(redis.releases).toBe(1);
    expect(metrics.snapshot()).toMatchObject({
      jobsStarted: 1,
      jobsSucceeded: 1,
      chunksIndexed: 2,
      embeddingInputTokens: 50,
      estimatedCostMicros: 3,
    });
  });

  it('creates bounded DLQ records only after terminal failure', () => {
    const failedJob = job({ attemptsMade: 3 });
    const error = new Error('x'.repeat(2_000));
    expect(isTerminalDocumentJobFailure(failedJob, error)).toBe(true);
    expect(isTerminalDocumentJobFailure(job({ attemptsMade: 1 }), error)).toBe(false);
    expect(buildDocumentDeadLetterData(
      failedJob,
      error,
      new Date('2026-07-18T12:30:00Z'),
    )).toMatchObject({
      originalJobId: 'job-1',
      failedAt: '2026-07-18T12:30:00.000Z',
      attemptsMade: 3,
      error: 'x'.repeat(1_000),
    });
  });
});

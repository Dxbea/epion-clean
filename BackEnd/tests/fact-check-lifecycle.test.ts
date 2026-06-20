import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFactCheckFailedPollResponse, markFactCheckFailed } from '../src/lib/fact-check-lifecycle.js';
import { prisma } from '../src/lib/db.js';

vi.mock('../src/lib/db.js', () => ({
    prisma: {
        article: {
            updateMany: vi.fn(),
        },
    },
}));

const updateMany = vi.mocked(prisma.article.updateMany);

describe('fact-check lifecycle failures', () => {
    beforeEach(() => {
        updateMany.mockReset();
        updateMany.mockResolvedValue({ count: 1 });
    });

    it('marks a live-analysis worker failure as terminal FAILED', async () => {
        await markFactCheckFailed('article-1', 'live-analysis-worker');

        expect(updateMany).toHaveBeenCalledWith({
            where: {
                id: 'article-1',
                factCheckStatus: 'RUNNING',
            },
            data: {
                factCheckStatus: 'FAILED',
                factCheckError: 'LIVE_ANALYSIS_FAILED',
                factCheckCompletedAt: expect.any(Date),
            },
        });
    });

    it('marks an enrichment dispatch failure as terminal FAILED', async () => {
        await markFactCheckFailed('article-2', 'source-enrichment-dispatch');

        expect(updateMany).toHaveBeenCalledWith({
            where: {
                id: 'article-2',
                factCheckStatus: 'RUNNING',
            },
            data: {
                factCheckStatus: 'FAILED',
                factCheckError: 'SOURCE_ENRICHMENT_DISPATCH_FAILED',
                factCheckCompletedAt: expect.any(Date),
            },
        });
    });

    it('does not leave a RUNNING status persisted after terminal failures', async () => {
        await markFactCheckFailed('article-3', 'live-analysis-worker');

        const persistedData = updateMany.mock.calls[0]?.[0]?.data;
        expect(persistedData?.factCheckStatus).toBe('FAILED');
        expect(persistedData?.factCheckStatus).not.toBe('RUNNING');
        expect(persistedData?.factCheckCompletedAt).toBeInstanceOf(Date);
    });
});

describe('fact-check polling failure response', () => {
    it('returns FAILED status, factCheckError, and factCheckCompletedAt', () => {
        const completedAt = new Date('2026-06-20T12:00:00.000Z');

        expect(buildFactCheckFailedPollResponse({
            factCheckError: 'LIVE_ANALYSIS_FAILED',
            factCheckCompletedAt: completedAt,
        })).toEqual({
            status: 'failed',
            factCheckStatus: 'FAILED',
            factCheckError: 'LIVE_ANALYSIS_FAILED',
            factCheckCompletedAt: '2026-06-20T12:00:00.000Z',
            error: 'LIVE_ANALYSIS_FAILED',
        });
    });
});

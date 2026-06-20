import { prisma } from './db.js';

export type FactCheckFailureStage =
    | 'live-analysis-worker'
    | 'source-enrichment-dispatch'
    | 'source-enrichment-worker';

const FAILURE_MESSAGES: Record<FactCheckFailureStage, string> = {
    'live-analysis-worker': 'LIVE_ANALYSIS_FAILED',
    'source-enrichment-dispatch': 'SOURCE_ENRICHMENT_DISPATCH_FAILED',
    'source-enrichment-worker': 'SOURCE_ENRICHMENT_FAILED',
};

export async function markFactCheckFailed(articleId: string, stage: FactCheckFailureStage): Promise<void> {
    await prisma.article.updateMany({
        where: {
            id: articleId,
            factCheckStatus: 'RUNNING',
        },
        data: {
            factCheckStatus: 'FAILED',
            factCheckError: FAILURE_MESSAGES[stage],
            factCheckCompletedAt: new Date(),
        },
    });
}

export function buildFactCheckFailedPollResponse(article: {
    factCheckError: string | null;
    factCheckCompletedAt: Date | string | null;
}) {
    const factCheckError = article.factCheckError || 'Unknown error';
    const factCheckCompletedAt = article.factCheckCompletedAt instanceof Date
        ? article.factCheckCompletedAt.toISOString()
        : article.factCheckCompletedAt;

    return {
        status: 'failed',
        factCheckStatus: 'FAILED',
        factCheckError,
        factCheckCompletedAt,
        error: factCheckError,
    } as const;
}

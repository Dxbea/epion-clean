import { logger } from '../logger';
import { extractArticle } from '../extractor';
import { searchInternalSources } from '../rag-service';
import { searchSerper, type SerperSearchResult } from '../serper';
import { classifyAndRoute } from './smart-router';
import { FactCheckContext, FactCheckSource } from './types';

const MAX_SOURCES = 10;
const MAX_CONTENT_CHARS = 3000;
const MIN_CONTENT_CHARS = 50;
const MAX_SOURCES_PER_DOMAIN = 2;

function getDomainKeyFromUrl(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return 'unknown';
    }
}

function selectSourcesWithDomainCap<T extends { url: string; score: number }>(
    sources: T[],
    limit: number,
    perDomainCap: number,
): T[] {
    const selected: T[] = [];
    const domainCounts = new Map<string, number>();

    for (const source of [...sources].sort((a, b) => b.score - a.score)) {
        const domainKey = getDomainKeyFromUrl(source.url);
        const currentCount = domainCounts.get(domainKey) || 0;
        if (currentCount >= perDomainCap) {
            continue;
        }

        domainCounts.set(domainKey, currentCount + 1);
        selected.push(source);

        if (selected.length >= limit) {
            break;
        }
    }

    return selected;
}

function truncateContent(content: string): string {
    if (content.length <= MAX_CONTENT_CHARS) {
        return content;
    }

    return `${content.slice(0, MAX_CONTENT_CHARS)}\n[... contenu tronque ...]`;
}

function mapSearchResult(result: SerperSearchResult): FactCheckSource | null {
    const url = result.url?.trim();
    if (!url) {
        return null;
    }

    return {
        url,
        title: result.title?.trim() || url,
        content: truncateContent((result.content || '').trim()),
        publishedDate: result.publishedDate || undefined,
        domain: getDomainKeyFromUrl(url),
        score: result.score || 0,
        provider: 'web',
    };
}

async function extractSearchResult(result: SerperSearchResult): Promise<FactCheckSource | null> {
    const url = result.url?.trim();
    if (!url) {
        return null;
    }

    try {
        const extracted = await extractArticle(url);
        const content = truncateContent((extracted.content || '').trim());

        if (content.length < MIN_CONTENT_CHARS) {
            return null;
        }

        return {
            url,
            title: extracted.title?.trim() || result.title?.trim() || url,
            content,
            publishedDate: result.publishedDate || undefined,
            domain: getDomainKeyFromUrl(url),
            score: result.score || 0,
            provider: 'web',
        };
    } catch (error: unknown) {
        logger.warn('External extraction failed, source skipped', {
            module: 'FactInvestigator',
            url,
            error: error instanceof Error ? error.message : 'Unknown extractor error',
        });
        return null;
    }
}

async function loadInternalFallbackSources(query: string, limit: number): Promise<FactCheckSource[]> {
    const internalSources = await searchInternalSources(query, limit);

    if (internalSources.length === 0) {
        return [];
    }

    logger.info(`Internal RAG fallback returned ${internalSources.length} sources`, {
        module: 'FactInvestigator',
        query,
    });

    return internalSources.map((source) => ({
        url: source.url,
        title: source.title,
        content: truncateContent(source.content),
        domain: source.domain,
        score: source.score,
        provider: source.provider,
        articleSlug: source.articleSlug,
    }));
}

async function runSearchLane(
    label: 'FACTUAL' | 'CRITICAL' | 'CONTEXTUAL',
    query: string,
    maxResults: number,
): Promise<FactCheckSource[]> {
    const rawResults = await searchSerper(query, {
        maxResults: Math.max(maxResults * 3, maxResults),
        gl: 'fr',
        hl: 'fr',
    });

    if (rawResults.length === 0) {
        logger.warn(`Serper ${label} search returned no results`, {
            module: 'FactInvestigator',
            query,
        });
        return [];
    }

    const candidatePool = rawResults
        .map(mapSearchResult)
        .filter((result): result is FactCheckSource => result !== null)
        .slice(0, Math.max(maxResults * 2, maxResults + 3));

    const extractedResults = await Promise.all(
        candidatePool.map(async (candidate) => extractSearchResult({
            title: candidate.title,
            url: candidate.url,
            content: candidate.content,
            publishedDate: candidate.publishedDate,
            score: candidate.score,
        })),
    );

    const laneResults = extractedResults
        .filter((result): result is FactCheckSource => result !== null)
        .slice(0, maxResults);

    logger.info(`Serper ${label} lane complete`, {
        module: 'FactInvestigator',
        query,
        rawCount: rawResults.length,
        keptCount: laneResults.length,
    });

    return laneResults;
}

export async function investigateArticle(
    title: string,
    content: string,
): Promise<FactCheckContext> {
    logger.info(`Starting Serper investigation for: "${title.slice(0, 60)}..."`, {
        module: 'FactInvestigator',
    });

    const routingDecision = await classifyAndRoute(title, content);

    logger.info('Starting Serper source collection', {
        module: 'FactInvestigator',
        maxSources: MAX_SOURCES,
    });

    try {
        const searchResults = await Promise.all([
            runSearchLane('FACTUAL', routingDecision.query_factual, 5),
            runSearchLane('CRITICAL', routingDecision.query_critical, 5),
            runSearchLane('CONTEXTUAL', routingDecision.query_contextual, 5),
        ]);

        const seenUrls = new Set<string>();
        const allSources: FactCheckSource[] = [];

        for (const laneResults of searchResults) {
            for (const result of laneResults) {
                if (seenUrls.has(result.url)) {
                    continue;
                }

                seenUrls.add(result.url);
                allSources.push(result);
            }
        }

        let finalSources = selectSourcesWithDomainCap(allSources, MAX_SOURCES, MAX_SOURCES_PER_DOMAIN);

        if (finalSources.length < MAX_SOURCES) {
            const internalFallback = await loadInternalFallbackSources(
                routingDecision.query_factual || title,
                MAX_SOURCES - finalSources.length,
            );

            for (const source of internalFallback) {
                if (seenUrls.has(source.url)) {
                    continue;
                }

                seenUrls.add(source.url);
                finalSources.push(source);
            }

            finalSources = selectSourcesWithDomainCap(finalSources, MAX_SOURCES, MAX_SOURCES_PER_DOMAIN);
        }

        logger.info(`Serper investigation complete: ${finalSources.length} sources`, {
            module: 'FactInvestigator',
            route: routingDecision.route,
            query_factual: routingDecision.query_factual,
            query_critical: routingDecision.query_critical,
            query_contextual: routingDecision.query_contextual,
            domains: finalSources.map((source) => source.domain),
        });

        return {
            sources: finalSources,
            routingDecision,
        };
    } catch (error: unknown) {
        logger.error('Serper investigation failed', {
            module: 'FactInvestigator',
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        return {
            sources: [],
            routingDecision,
        };
    }
}

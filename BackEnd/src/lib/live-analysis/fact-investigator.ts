import { logger } from '../logger';
import { extractArticle } from '../extractor';
import { searchInternalSources } from '../rag-service';
import { searchSerper, type SerperSearchResult } from '../serper';
import { classifyAndRoute } from './smart-router';
import { FactCheckContext, FactCheckSource, RoutingDecision } from './types';
import { extractRelevantPassages } from '../chunking';

const MAX_SOURCES_PER_DOMAIN = 3;

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
    return content; // WE NOW KEEP EVERYTHING UNTRUNCATED SO CHUNKER SEES ALL
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
    routingDecision: RoutingDecision,
    maxResults: number,
    onProgress?: (msg: string) => void
): Promise<FactCheckSource[]> {
    const query = label === 'FACTUAL' ? routingDecision.query_factual
                : label === 'CRITICAL' ? routingDecision.query_critical
                : routingDecision.query_contextual;
    const queries = [routingDecision.query_factual, routingDecision.query_critical, routingDecision.query_contextual].filter(Boolean);

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
        candidatePool.map(async (candidate) => {
            if (onProgress) {
                const domain = getDomainKeyFromUrl(candidate.url);
                onProgress(`Lecture de la source ${domain}...`);
            }
            const extracted = await extractSearchResult({
                title: candidate.title,
                url: candidate.url,
                content: candidate.content,
                publishedDate: candidate.publishedDate,
                score: candidate.score,
            });

            if (!extracted) return null;

            const chunkedContent = extractRelevantPassages(extracted.title, extracted.content, queries);
            
            if (!chunkedContent) return null; // No relevant paragraphs, discard

            extracted.content = chunkedContent; // Replaces entire content with chunked version
            return extracted;
        }),
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
    onProgress?: (msg: string) => void
): Promise<FactCheckContext> {
    logger.info(`Starting Serper investigation for: "${title.slice(0, 60)}..."`, {
        module: 'FactInvestigator',
    });

    const routingDecision = await classifyAndRoute(title, content);

    logger.info('Starting Serper source collection', {
        module: 'FactInvestigator'
    });

    try {
        const searchResults = await Promise.all([
            runSearchLane('FACTUAL', routingDecision, 10, onProgress),
            runSearchLane('CRITICAL', routingDecision, 10, onProgress),
            runSearchLane('CONTEXTUAL', routingDecision, 10, onProgress),
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

        let finalSources = selectSourcesWithDomainCap(allSources, 50, MAX_SOURCES_PER_DOMAIN); // No harsh limit, just cap at 50

        if (finalSources.length < 15) { // Fallback condition relaxed
            const internalFallback = await loadInternalFallbackSources(
                routingDecision.query_factual || title,
                10,
            );

            for (const source of internalFallback) {
                if (seenUrls.has(source.url)) {
                    continue;
                }

                const chunked = extractRelevantPassages(source.title, source.content, [routingDecision.query_factual, routingDecision.query_critical, routingDecision.query_contextual].filter(Boolean));
                if (chunked) {
                    source.content = chunked;
                    seenUrls.add(source.url);
                    finalSources.push(source);
                }
            }

            finalSources = selectSourcesWithDomainCap(finalSources, 50, MAX_SOURCES_PER_DOMAIN);
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

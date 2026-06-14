import { logger } from '../logger.js';
import { extractArticle } from '../extractor.js';
import { searchInternalSources } from '../rag-service.js';
import { searchSerper, type SerperSearchResult } from '../serper.js';
import { classifyAndRoute } from './smart-router.js';
import { FactCheckContext, FactCheckSource, RoutingDecision } from './types.js';
import { extractRelevantPassages } from '../chunking.js';
import { getRootDomain } from '../utils/domain.js';

const MAX_SOURCES = 50;
const EXTRACTION_CONCURRENCY = 6;

function getDomainKeyFromUrl(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return 'unknown';
    }
}

function getRootDomainKeyFromUrl(url: string): string {
    try {
        return getRootDomain(url);
    } catch {
        return 'unknown';
    }
}

function selectSourcesByRootDomain<T extends { url: string; score: number }>(
    sources: T[],
    limit: number,
): T[] {
    const selected: T[] = [];
    const seenRootDomains = new Set<string>();

    for (const source of [...sources].sort((a, b) => b.score - a.score)) {
        const rootDomainKey = getRootDomainKeyFromUrl(source.url);
        if (seenRootDomains.has(rootDomainKey)) {
            continue;
        }

        seenRootDomains.add(rootDomainKey);
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

async function mapWithConcurrencyLimit<T, U>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
    if (items.length === 0) {
        return [];
    }

    const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
    const results = new Array<U>(items.length);
    let nextIndex = 0;

    await Promise.all(
        Array.from({ length: safeConcurrency }, async () => {
            while (true) {
                const currentIndex = nextIndex++;
                if (currentIndex >= items.length) {
                    return;
                }

                results[currentIndex] = await mapper(items[currentIndex], currentIndex);
            }
        }),
    );

    return results;
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
            metaDescription: extracted.metaDescription,
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
    const laneResults = selectSourcesByRootDomain(candidatePool, maxResults);

    logger.info('Dedup effect', {
        module: 'FactInvestigator',
        lane: label,
        query,
        rawCount: candidatePool.length,
        uniqueRootDomainCount: laneResults.length,
        message: `Dedup effect: ${candidatePool.length} raw -> ${laneResults.length} unique domains`,
    });

    logger.info(`Serper ${label} lane complete`, {
        module: 'FactInvestigator',
        query,
        rawCount: rawResults.length,
        candidateCount: candidatePool.length,
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

        const allQueries = [
            routingDecision.query_factual,
            routingDecision.query_critical,
            routingDecision.query_contextual,
        ].filter(Boolean);
        const extractionCandidates = selectSourcesByRootDomain(
            searchResults.flat(),
            MAX_SOURCES,
        );

        logger.info('Global dedup effect before extraction', {
            module: 'FactInvestigator',
            rawCount: searchResults.flat().length,
            uniqueRootDomainCount: extractionCandidates.length,
            message: `Dedup effect: ${searchResults.flat().length} raw -> ${extractionCandidates.length} unique domains`,
        });

        const extractedResults = await mapWithConcurrencyLimit(
            extractionCandidates,
            EXTRACTION_CONCURRENCY,
            async (candidate) => {
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

                if (!extracted) {
                    return null;
                }

                const chunkedContent = extractRelevantPassages(extracted.title, extracted.content, allQueries);
                if (!chunkedContent) {
                    return null;
                }

                extracted.content = chunkedContent;
                return extracted;
            },
        );

        let finalSources = extractedResults.filter((result): result is FactCheckSource => result !== null);
        const seenRootDomains = new Set(finalSources.map((source) => getRootDomainKeyFromUrl(source.url)));
        const seenUrls = new Set(finalSources.map((source) => source.url));

        if (finalSources.length < 15) {
            const internalFallback = await loadInternalFallbackSources(
                routingDecision.query_factual || title,
                10,
            );

            for (const source of internalFallback) {
                const rootDomainKey = getRootDomainKeyFromUrl(source.url);
                if (seenUrls.has(source.url) || seenRootDomains.has(rootDomainKey)) {
                    continue;
                }

                const chunked = extractRelevantPassages(source.title, source.content, allQueries);
                if (chunked) {
                    source.content = chunked;
                    seenUrls.add(source.url);
                    seenRootDomains.add(rootDomainKey);
                    finalSources.push(source);
                }
            }
        }

        finalSources = selectSourcesByRootDomain(finalSources, MAX_SOURCES);

        logger.info(`Serper investigation complete: ${finalSources.length} sources`, {
            module: 'FactInvestigator',
            route: routingDecision.route,
            query_factual: routingDecision.query_factual,
            query_critical: routingDecision.query_critical,
            query_contextual: routingDecision.query_contextual,
            extractionCandidateCount: extractionCandidates.length,
            extractionConcurrency: EXTRACTION_CONCURRENCY,
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

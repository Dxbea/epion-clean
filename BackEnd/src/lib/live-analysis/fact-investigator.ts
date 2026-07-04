import { logger } from '../logger.js';
import { extractArticle } from '../extractor.js';
import { searchInternalSources } from '../rag-service.js';
import { searchSerper, type SerperSearchResult } from '../serper.js';
import { classifyAndRoute } from './smart-router.js';
import { FactCheckContext, FactCheckSource, RoutingDecision } from './types.js';
import { extractRelevantPassages } from '../chunking.js';
import { getRootDomain } from '../utils/domain.js';

const MAX_SOURCES = 50;
const DEFAULT_EXTRACTION_CONCURRENCY = 6;
export const MAX_GENERATION_EXTRACTION_URLS = 12;
export const GENERATION_EXTRACTION_CONCURRENCY = 3;
export const GENERATION_INVESTIGATION_DEADLINE_MS = 25_000;

type InvestigationMode = 'analysis' | 'generation';

export interface InvestigationOptions {
    mode?: InvestigationMode;
    maxExtractionUrls?: number;
    extractionConcurrency?: number;
    deadlineMs?: number;
}

interface ExtractionCollectionResult<U> {
    results: U[];
    startedCount: number;
    completedCount: number;
    rejectedCount: number;
    skippedCount: number;
    deadlineReached: boolean;
}

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
    return content;
}

function resolveInvestigationOptions(options: InvestigationOptions = {}) {
    const isGeneration = options.mode === 'generation';
    const maxExtractionUrls = Math.max(
        1,
        options.maxExtractionUrls ?? (isGeneration ? MAX_GENERATION_EXTRACTION_URLS : MAX_SOURCES),
    );
    const extractionConcurrency = Math.max(
        1,
        options.extractionConcurrency ?? (isGeneration ? GENERATION_EXTRACTION_CONCURRENCY : DEFAULT_EXTRACTION_CONCURRENCY),
    );
    const deadlineMs = options.deadlineMs ?? (isGeneration ? GENERATION_INVESTIGATION_DEADLINE_MS : undefined);

    return {
        mode: options.mode ?? 'analysis',
        maxExtractionUrls,
        extractionConcurrency,
        deadlineMs: deadlineMs && deadlineMs > 0 ? deadlineMs : undefined,
    };
}

async function mapWithConcurrencyLimitAndDeadline<T, U>(
    items: T[],
    concurrency: number,
    deadlineMs: number | undefined,
    mapper: (item: T, index: number) => Promise<U>,
): Promise<ExtractionCollectionResult<U>> {
    if (items.length === 0) {
        return {
            results: [],
            startedCount: 0,
            completedCount: 0,
            rejectedCount: 0,
            skippedCount: 0,
            deadlineReached: false,
        };
    }

    const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
    const results = new Array<U>(items.length);
    const deadlineAt = deadlineMs ? Date.now() + deadlineMs : Number.POSITIVE_INFINITY;
    let nextIndex = 0;
    let activeCount = 0;
    let startedCount = 0;
    let completedCount = 0;
    let rejectedCount = 0;
    let resolved = false;
    let deadlineReached = false;
    let timeoutHandle: NodeJS.Timeout | undefined;

    return new Promise((resolve) => {
        const finish = () => {
            if (resolved) {
                return;
            }

            resolved = true;
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }

            resolve({
                results: [...results],
                startedCount,
                completedCount,
                rejectedCount,
                skippedCount: Math.max(0, items.length - startedCount),
                deadlineReached,
            });
        };

        const launchMore = () => {
            if (resolved) {
                return;
            }

            if (Date.now() >= deadlineAt) {
                deadlineReached = true;
                finish();
                return;
            }

            while (activeCount < safeConcurrency && nextIndex < items.length) {
                if (Date.now() >= deadlineAt) {
                    deadlineReached = true;
                    finish();
                    return;
                }

                const currentIndex = nextIndex++;
                startedCount += 1;
                activeCount += 1;

                Promise.resolve(mapper(items[currentIndex], currentIndex))
                    .then((value) => {
                        results[currentIndex] = value;
                    })
                    .catch((error: unknown) => {
                        rejectedCount += 1;
                        logger.warn('Extraction task rejected unexpectedly', {
                            module: 'FactInvestigator',
                            index: currentIndex,
                            error: error instanceof Error ? error.message : 'Unknown extraction task error',
                        });
                    })
                    .finally(() => {
                        activeCount -= 1;
                        completedCount += 1;

                        if (resolved) {
                            return;
                        }

                        if (nextIndex >= items.length && activeCount === 0) {
                            finish();
                            return;
                        }

                        launchMore();
                    });
            }
        };

        if (deadlineMs) {
            timeoutHandle = setTimeout(() => {
                deadlineReached = true;
                finish();
            }, deadlineMs);
        }

        launchMore();
    });
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
    onProgress?: (msg: string) => void,
): Promise<FactCheckSource[]> {
    const query = label === 'FACTUAL' ? routingDecision.query_factual
                : label === 'CRITICAL' ? routingDecision.query_critical
                : routingDecision.query_contextual;

    const rawResults = await searchSerper(query, {
        maxResults: Math.max(maxResults * 3, maxResults),
        gl: 'fr',
        hl: 'fr',
    });

    logger.info('Serper lane results received', {
        module: 'FactInvestigator',
        lane: label,
        query,
        rawCount: rawResults.length,
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
    onProgress?: (msg: string) => void,
    options: InvestigationOptions = {},
): Promise<FactCheckContext> {
    const investigationStartedAt = Date.now();
    const resolvedOptions = resolveInvestigationOptions(options);

    logger.info(`Starting Serper investigation for: "${title.slice(0, 60)}..."`, {
        module: 'FactInvestigator',
        mode: resolvedOptions.mode,
        maxExtractionUrls: resolvedOptions.maxExtractionUrls,
        extractionConcurrency: resolvedOptions.extractionConcurrency,
        deadlineMs: resolvedOptions.deadlineMs,
    });

    const routingDecision = await classifyAndRoute(title, content);

    logger.info('Starting Serper source collection', {
        module: 'FactInvestigator',
        mode: resolvedOptions.mode,
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
        const searchResultCount = searchResults.flat().length;
        const extractionCandidates = selectSourcesByRootDomain(
            searchResults.flat(),
            resolvedOptions.maxExtractionUrls,
        );

        logger.info('Global dedup effect before extraction', {
            module: 'FactInvestigator',
            mode: resolvedOptions.mode,
            rawCount: searchResultCount,
            uniqueRootDomainCount: extractionCandidates.length,
            maxExtractionUrls: resolvedOptions.maxExtractionUrls,
            extractionConcurrency: resolvedOptions.extractionConcurrency,
            deadlineMs: resolvedOptions.deadlineMs,
            message: `Dedup effect: ${searchResultCount} raw -> ${extractionCandidates.length} unique domains`,
        });

        const elapsedBeforeExtractionMs = Date.now() - investigationStartedAt;
        const remainingDeadlineMs = resolvedOptions.deadlineMs === undefined
            ? undefined
            : Math.max(0, resolvedOptions.deadlineMs - elapsedBeforeExtractionMs);
        const extractionStartedAt = Date.now();
        const extractionResult = remainingDeadlineMs === 0
            ? {
                results: [],
                startedCount: 0,
                completedCount: 0,
                rejectedCount: 0,
                skippedCount: extractionCandidates.length,
                deadlineReached: true,
            } satisfies ExtractionCollectionResult<FactCheckSource | null>
            : await mapWithConcurrencyLimitAndDeadline(
            extractionCandidates,
            resolvedOptions.extractionConcurrency,
            remainingDeadlineMs,
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

        let finalSources = extractionResult.results.filter((result): result is FactCheckSource => result !== null);
        const extractionSuccessCount = finalSources.length;
        const extractionFailedCount = Math.max(0, extractionResult.completedCount - extractionSuccessCount);
        const extractionTimedOutOrSkippedCount = extractionResult.deadlineReached
            ? Math.max(0, extractionCandidates.length - extractionResult.completedCount)
            : extractionResult.skippedCount;

        logger.info('Serper extraction complete', {
            module: 'FactInvestigator',
            mode: resolvedOptions.mode,
            candidateCount: extractionCandidates.length,
            startedCount: extractionResult.startedCount,
            completedCount: extractionResult.completedCount,
            successCount: extractionSuccessCount,
            failedCount: extractionFailedCount + extractionResult.rejectedCount,
            timedOutOrSkippedCount: extractionTimedOutOrSkippedCount,
            deadlineReached: extractionResult.deadlineReached,
            elapsedMs: Date.now() - extractionStartedAt,
            totalElapsedMs: Date.now() - investigationStartedAt,
            extractionConcurrency: resolvedOptions.extractionConcurrency,
            deadlineMs: resolvedOptions.deadlineMs,
            extractionDeadlineMs: remainingDeadlineMs,
        });

        if (extractionResult.deadlineReached) {
            logger.warn('Serper investigation deadline reached, continuing with partial sources', {
                module: 'FactInvestigator',
                mode: resolvedOptions.mode,
                successCount: extractionSuccessCount,
                candidateCount: extractionCandidates.length,
                deadlineMs: resolvedOptions.deadlineMs,
                extractionDeadlineMs: remainingDeadlineMs,
            });
        }

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

        if (finalSources.length === 0) {
            logger.warn('Serper investigation finished with no usable sources', {
                module: 'FactInvestigator',
                mode: resolvedOptions.mode,
                candidateCount: extractionCandidates.length,
                extractionStartedCount: extractionResult.startedCount,
                extractionFailedCount,
                deadlineReached: extractionResult.deadlineReached,
                elapsedMs: Date.now() - investigationStartedAt,
            });
        }

        logger.info(`Serper investigation complete: ${finalSources.length} sources`, {
            module: 'FactInvestigator',
            mode: resolvedOptions.mode,
            route: routingDecision.route,
            query_factual: routingDecision.query_factual,
            query_critical: routingDecision.query_critical,
            query_contextual: routingDecision.query_contextual,
            searchResultCount,
            extractionCandidateCount: extractionCandidates.length,
            extractionStartedCount: extractionResult.startedCount,
            extractionSuccessCount,
            extractionFailedCount,
            extractionTimedOutOrSkippedCount,
            extractionConcurrency: resolvedOptions.extractionConcurrency,
            deadlineMs: resolvedOptions.deadlineMs,
            extractionDeadlineMs: remainingDeadlineMs,
            deadlineReached: extractionResult.deadlineReached,
            elapsedMs: Date.now() - investigationStartedAt,
            domains: finalSources.map((source) => source.domain),
        });

        return {
            sources: finalSources,
            routingDecision,
        };
    } catch (error: unknown) {
        logger.error('Serper investigation failed', {
            module: 'FactInvestigator',
            mode: resolvedOptions.mode,
            error: error instanceof Error ? error.message : 'Unknown error',
            elapsedMs: Date.now() - investigationStartedAt,
        });

        return {
            sources: [],
            routingDecision,
        };
    }
}

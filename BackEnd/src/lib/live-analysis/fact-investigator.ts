import { logger } from '../logger.js';
import { extractArticle } from '../extractor.js';
import { searchInternalSources } from '../rag-service.js';
import { searchSerper, type SerperSearchResult } from '../serper.js';
import { classifyAndRoute } from './smart-router.js';
import { FactCheckContext, FactCheckSource, RoutingDecision } from './types.js';
import { extractRelevantPassages } from '../chunking.js';
import { getRootDomain } from '../utils/domain.js';
import { deriveArticleSourceRoleFromLane, normalizeArticleSourceUrl } from '../article-source-service.js';
import type { SourceSearchLane } from './types.js';

const MAX_SOURCES = 50;
const EXTRACTION_CONCURRENCY = 6;
const MIN_METADATA_SNIPPET_LENGTH = 40;

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

function getCredibilityBoost(url: string): number {
    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
        const path = parsed.pathname.toLowerCase();

        if (hostname.endsWith('.gov') || hostname.endsWith('.edu') || hostname.endsWith('.int')) return 0.35;
        if (path.includes('/investor') || path.includes('/newsroom') || path.includes('/press') || path.includes('/media')) return 0.25;
        if (hostname.includes('official') || hostname.includes('investor')) return 0.2;
        if (/\b(reuters|apnews|bbc|cnbc|ft|bloomberg|yahoo)\b/.test(hostname)) return 0.15;
        return 0;
    } catch {
        return 0;
    }
}

function selectSourcesByRootDomain<T extends { url: string; score: number }>(
    sources: T[],
    limit: number,
): T[] {
    const selected: T[] = [];
    const seenRootDomains = new Set<string>();

    for (const source of [...sources].sort((a, b) => {
        const bRank = b.score + getCredibilityBoost(b.url);
        const aRank = a.score + getCredibilityBoost(a.url);
        return bRank - aRank;
    })) {
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
    return content; // Keep all content so the chunker sees the full extraction.
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

const SOURCE_LANE_PRIORITY: Record<SourceSearchLane, number> = {
    FACTUAL: 3,
    CRITICAL: 2,
    CONTEXTUAL: 1,
};

function sourceLanePriority(source: FactCheckSource): number {
    if (source.officialStatement === true) return 4;
    return source.searchLane ? SOURCE_LANE_PRIORITY[source.searchLane] : 0;
}

export function mergeSourcesByUrlWithLanePriority(sources: FactCheckSource[]): FactCheckSource[] {
    const byUrl = new Map<string, FactCheckSource>();

    for (const source of sources) {
        const key = normalizeArticleSourceUrl(source.url) ?? source.url.trim();
        const existing = byUrl.get(key);
        if (!existing) {
            byUrl.set(key, source);
            continue;
        }

        if (sourceLanePriority(source) > sourceLanePriority(existing)) {
            byUrl.set(key, {
                ...existing,
                searchLane: source.searchLane,
                role: source.role,
                provenance: source.provenance ?? existing.provenance,
                provider: source.provider ?? existing.provider,
                officialStatement: source.officialStatement,
            });
        }
    }

    return [...byUrl.values()];
}

function buildMetadataFallbackSource(
    result: SerperSearchResult & Partial<Pick<FactCheckSource,
        'provider' | 'searchLane' | 'role' | 'provenance' | 'officialStatement'>>,
    reason: string,
): FactCheckSource | null {
    const url = result.url?.trim();
    const title = result.title?.trim() || url;
    const snippet = (result.content || '').trim();

    if (!url || !title || snippet.length < MIN_METADATA_SNIPPET_LENGTH) {
        return null;
    }

    const domain = getDomainKeyFromUrl(url);
    const content = [
        'METADATA-ONLY SOURCE - full page extraction failed. Use only the title, snippet, URL, and date below. Do not infer facts beyond this metadata.',
        `Title: ${title}`,
        `Snippet: ${snippet}`,
        result.publishedDate ? `Published date: ${result.publishedDate}` : '',
        `URL: ${url}`,
    ].filter(Boolean).join('\n');

    return {
        url,
        title,
        content,
        metaDescription: snippet,
        publishedDate: result.publishedDate || undefined,
        domain,
        score: Math.max(0.01, (result.score || 0) * 0.45 + getCredibilityBoost(url)),
        provider: result.provider ?? 'web',
        searchLane: result.searchLane,
        role: result.role,
        provenance: result.provenance,
        officialStatement: result.officialStatement,
        extractionStatus: 'metadata_only',
        sourceQuality: 'metadata_only',
        extractionFailureReason: reason,
    };
}

async function extractSearchResult(result: FactCheckSource): Promise<FactCheckSource | null> {
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
            author: extracted.author,
            siteName: extracted.siteName,
            publishedDate: result.publishedDate || undefined,
            domain: getDomainKeyFromUrl(url),
            score: result.score || 0,
            provider: result.provider,
            searchLane: result.searchLane,
            role: result.role,
            provenance: result.provenance,
            officialStatement: result.officialStatement,
            extractionStatus: 'full',
            sourceQuality: 'full',
        };
    } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : 'Unknown extractor error';
        const fallback = buildMetadataFallbackSource(result, reason);

        logger.warn(fallback ? 'External extraction failed, using metadata-only source fallback' : 'External extraction failed, source skipped', {
            module: 'FactInvestigator',
            url,
            domain: getDomainKeyFromUrl(url),
            error: reason,
            hasMetadataFallback: Boolean(fallback),
        });

        return fallback;
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
        role: 'UNKNOWN',
        provenance: 'INTERNAL_RAG',
        articleSlug: source.articleSlug,
        extractionStatus: 'full',
        sourceQuality: 'full',
    }));
}

async function runSearchLane(
    label: SourceSearchLane,
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
        .map((source) => ({
            ...source,
            searchLane: label,
            role: deriveArticleSourceRoleFromLane(label, {
                explicitOfficialStatement: source.officialStatement === true,
            }),
            provenance: 'WEB_SEARCH' as const,
        }))
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
            mergeSourcesByUrlWithLanePriority(searchResults.flat()),
            MAX_SOURCES,
        );

        logger.info('Global dedup effect before extraction', {
            module: 'FactInvestigator',
            rawCount: searchResults.flat().length,
            uniqueRootDomainCount: extractionCandidates.length,
            message: `Dedup effect: ${searchResults.flat().length} raw -> ${extractionCandidates.length} unique domains`,
        });

        logger.info('Source extraction candidates selected', {
            module: 'FactInvestigator',
            candidateCount: extractionCandidates.length,
            domains: extractionCandidates.map((source) => source.domain),
        });

        const extractionResults = await mapWithConcurrencyLimit(
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
                    domain: candidate.domain,
                    score: candidate.score,
                    provider: candidate.provider,
                    searchLane: candidate.searchLane,
                    role: candidate.role,
                    provenance: candidate.provenance,
                    officialStatement: candidate.officialStatement,
                });

                if (!extracted) {
                    return null;
                }

                if (extracted.extractionStatus === 'metadata_only') {
                    return extracted;
                }

                const chunkedContent = extractRelevantPassages(extracted.title, extracted.content, allQueries);
                if (!chunkedContent) {
                    return buildMetadataFallbackSource({
                        title: candidate.title,
                        url: candidate.url,
                        content: candidate.content,
                        publishedDate: candidate.publishedDate,
                        score: candidate.score,
                        provider: candidate.provider,
                        searchLane: candidate.searchLane,
                        role: candidate.role,
                        provenance: candidate.provenance,
                        officialStatement: candidate.officialStatement,
                    }, 'Extracted content had no relevant passages');
                }

                extracted.content = chunkedContent;
                return extracted;
            },
        );

        let finalSources = extractionResults.filter((result): result is FactCheckSource => result !== null);
        const fullExtractionSuccessCount = finalSources.filter((source) => source.extractionStatus !== 'metadata_only').length;
        const metadataFallbackCount = finalSources.filter((source) => source.extractionStatus === 'metadata_only').length;
        const skippedSourceCount = extractionCandidates.length - finalSources.length;
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

        logger.info('Serper extraction summary', {
            module: 'FactInvestigator',
            candidateCount: extractionCandidates.length,
            fullExtractionSuccessCount,
            fallbackSourceCount: metadataFallbackCount,
            skippedSourceCount,
            finalSourceCount: finalSources.length,
            metadataOnlyFinalCount: finalSources.filter((source) => source.extractionStatus === 'metadata_only').length,
        });

        logger.info(`Serper investigation complete: ${finalSources.length} sources`, {
            module: 'FactInvestigator',
            route: routingDecision.route,
            query_factual: routingDecision.query_factual,
            query_critical: routingDecision.query_critical,
            query_contextual: routingDecision.query_contextual,
            extractionCandidateCount: extractionCandidates.length,
            extractionConcurrency: EXTRACTION_CONCURRENCY,
            finalSourceCount: finalSources.length,
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

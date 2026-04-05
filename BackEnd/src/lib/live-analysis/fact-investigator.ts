/**
 * Phase 2A.2 — The Investigator (Tavily Search — Global Matrix)
 * 
 * Uses the Smart Router's multilingual queries to run 2-3 parallel Tavily searches
 * across the global source matrix (FR, EN, + optional local language).
 * Results are merged, deduplicated, sorted by relevance, and capped at 10 sources.
 * 
 * v2.1 — Parallel multilingual searches for worldwide coverage.
 */
import { tavily } from '@tavily/core';
import { logger } from '../logger';
import { prisma } from '../db';
import OpenAI from 'openai';
import { classifyAndRoute } from './smart-investigator';
import { FactCheckContext, FactCheckSource } from './types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Tavily Client ───────────────────────────────────────────────────────────
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY || '' });

// ─── Global Source Matrix ────────────────────────────────────────────────────

export const DOMAINS_FR = [
    'lemonde.fr', 'lefigaro.fr', 'liberation.fr', 'lesechos.fr', 'mediapart.fr',
    'francetvinfo.fr', 'afp.com',
];

export const DOMAINS_EN = [
    'reuters.com', 'apnews.com', 'bloomberg.com', 'bbc.com', 'nytimes.com',
    'washingtonpost.com', 'wsj.com', 'ft.com', 'aljazeera.com',
];

export const DOMAINS_LOCAL = [
    'spiegel.de', 'dw.com',           // Allemagne
    'elpais.com', 'elmundo.es',       // Espagne
    'corriere.it',                     // Italie
    'scmp.com', 'thehindu.com', 'kyodonews.net', // Asie
];

const MAX_SOURCES = 10;

/**
 * Investigate an article using parallel multilingual Tavily searches.
 * 
 * Flow:
 * 1. Smart Router classifies and generates FR/EN/local queries
 * 2. Parallel Tavily searches across domain matrices
 * 3. Merge, deduplicate, sort by relevance, cap at 10
 */
export async function investigateArticle(
    title: string,
    content: string
): Promise<FactCheckContext> {
    logger.info(`🔍 Starting Tavily investigation for: "${title.slice(0, 60)}..."`, {
        module: 'FactInvestigator',
    });

    // === Step 1: Smart Router ===
    const routingDecision = await classifyAndRoute(title, content);

    // === Step 1.5: Hybrid Vector Search (NewsCache) ===
    let localSources: FactCheckSource[] = [];
    try {
        // Embed the primary query (FR is default starting point)
        const embedRes = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: routingDecision.query_fr,
        });
        const queryEmbedding = embedRes.data[0].embedding;

        // Perform vector search
        const dbResults = await prisma.$queryRaw<any[]>`
            SELECT url, domain, title, content, "publishedAt", 
                   1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
            FROM "NewsCache"
            WHERE 1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) > 0.8
            ORDER BY similarity DESC
            LIMIT 10
        `;

        if (dbResults && dbResults.length > 0) {
            localSources = dbResults.map(row => ({
                url: row.url,
                title: row.title,
                content: row.content,
                publishedDate: row.publishedAt?.toISOString(),
                domain: row.domain,
                score: row.similarity, // Map similarity to score
            }));
            
            logger.info(`💾 Vector Search found ${localSources.length} relevant internal sources (>0.8)`, {
                module: 'FactInvestigator',
            });
            
            if (localSources.length >= 5) {
                logger.info(`🎯 Hybrid Router: Found enough local sources. Skipping Tavily API (Cost = 0€)`, { module: 'FactInvestigator' });
                return {
                    sources: localSources.slice(0, MAX_SOURCES),
                    routingDecision
                };
            }
        }
    } catch (err: any) {
        logger.error(`❌ Hybrid Router Vector Search failed: ${err.message}`, { module: 'FactInvestigator' });
    }

    // === Step 2: Parallel Tavily Searches (Tavily is called in complement) ===
    const neededFromTavily = MAX_SOURCES - localSources.length;
    logger.info(`🔍 Tavily Complementary Search: Need ${neededFromTavily} more sources...`, { module: 'FactInvestigator' });

    try {
        if (!process.env.TAVILY_API_KEY) {
            throw new Error('TAVILY_API_KEY manquante');
        }

        const searchPromises: Promise<any>[] = [];

        // 🇫🇷 French search (always)
        searchPromises.push(
            tvly.search(routingDecision.query_fr, {
                searchDepth: 'advanced',
                includeRawContent: 'text',
                includeDomains: DOMAINS_FR,
                maxResults: 5,
            }).catch((err: any) => {
                logger.warn(`⚠️ Tavily FR search failed: ${err.message}`, { module: 'FactInvestigator' });
                return { results: [] };
            })
        );

        // 🇬🇧 English search (always)
        searchPromises.push(
            tvly.search(routingDecision.query_en, {
                searchDepth: 'advanced',
                includeRawContent: 'text',
                includeDomains: DOMAINS_EN,
                maxResults: 5,
            }).catch((err: any) => {
                logger.warn(`⚠️ Tavily EN search failed: ${err.message}`, { module: 'FactInvestigator' });
                return { results: [] };
            })
        );

        // 🌍 Local language search (if applicable)
        if (routingDecision.query_local) {
            searchPromises.push(
                tvly.search(routingDecision.query_local, {
                    searchDepth: 'advanced',
                    includeRawContent: 'text',
                    includeDomains: DOMAINS_LOCAL,
                    maxResults: 3,
                }).catch((err: any) => {
                    logger.warn(`⚠️ Tavily LOCAL search failed: ${err.message}`, { module: 'FactInvestigator' });
                    return { results: [] };
                })
            );
        }

        // Execute all searches in parallel
        const searchResults = await Promise.all(searchPromises);

        // === Step 3: Merge & Deduplicate ===
        const seenUrls = new Set<string>();
        const allSources: FactCheckSource[] = [];

        for (const response of searchResults) {
            for (const result of (response.results || [])) {
                // Skip duplicates
                if (seenUrls.has(result.url)) continue;
                seenUrls.add(result.url);

                let domain = '';
                try {
                    domain = new URL(result.url).hostname.replace('www.', '');
                } catch {
                    domain = 'unknown';
                }

                // Prefer rawContent (full article text), fallback to snippet
                const rawContent = result.rawContent || result.content || '';
                const truncatedContent = rawContent.length > 3000
                    ? rawContent.slice(0, 3000) + '\n[... contenu tronqué ...]'
                    : rawContent;

                if (truncatedContent.length < 50) continue; // Skip empty results

                allSources.push({
                    url: result.url || '',
                    title: result.title || '',
                    content: truncatedContent,
                    publishedDate: result.publishedDate || undefined,
                    domain,
                    score: result.score || 0,
                });
            }
        }

        // Add local sources obtained from vector search
        for (const localSource of localSources) {
            if (!seenUrls.has(localSource.url)) {
                allSources.push(localSource);
                seenUrls.add(localSource.url);
            }
        }

        // Sort by Tavily relevance score (descending) and cap at MAX_SOURCES
        allSources.sort((a, b) => b.score - a.score);
        const finalSources = allSources.slice(0, MAX_SOURCES);

        // Log summary
        const frCount = finalSources.filter(s => DOMAINS_FR.includes(s.domain)).length;
        const enCount = finalSources.filter(s => DOMAINS_EN.includes(s.domain)).length;
        const localCount = finalSources.filter(s => DOMAINS_LOCAL.includes(s.domain)).length;

        logger.info(`✅ Tavily investigation complete: ${finalSources.length} sources (FR:${frCount} EN:${enCount} LOCAL:${localCount})`, {
            module: 'FactInvestigator',
            route: routingDecision.route,
            query_fr: routingDecision.query_fr,
            query_en: routingDecision.query_en,
            query_local: routingDecision.query_local || '(none)',
            domains: finalSources.map(s => s.domain),
        });

        return {
            sources: finalSources,
            routingDecision,
        };

    } catch (error: any) {
        logger.error(`❌ Tavily investigation failed`, {
            module: 'FactInvestigator',
            error: error.message,
        });

        return {
            sources: [],
            routingDecision,
        };
    }
}

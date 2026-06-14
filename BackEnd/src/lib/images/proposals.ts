import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import { logger } from '../logger.js';

export interface ImageProposal {
    url: string;
    source: 'OPEN_GRAPH' | 'WIKIPEDIA';
    credit: string;
    description: string;
}

/**
 * Extract Open Graph image from a source URL.
 */
export async function getOpenGraphImage(url: string): Promise<ImageProposal | null> {
    if (!url || !url.startsWith('http')) return null;

    try {
        const response = await axios.get(url, {
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });

        const $ = cheerio.load(response.data);
        const ogImage = $('meta[property="og:image"]').attr('content') || $('meta[name="og:image"]').attr('content');

        if (ogImage && ogImage.startsWith('http')) {
            const parsedUrl = new URL(url);
            return {
                url: ogImage,
                source: 'OPEN_GRAPH',
                credit: parsedUrl.hostname.replace(/^www\./, ''),
                description: 'Image cover from original source'
            };
        }
    } catch (error: any) {
        logger.debug(`Failed to extract OG image from ${url}: ${error.message}`, { module: 'ImageProposals' });
    }
    return null;
}

/**
 * Fetch multiple Wikipedia images for a given query.
 */
export async function getWikipediaImages(query: string, lang: string = 'en', limit: number = 4): Promise<ImageProposal[]> {
    if (!query || query.trim() === '') return [];

    try {
        const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=${limit}`;
        const response = await axios.get(url, {
            timeout: 4000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        });

        const pages = response.data?.query?.pages;
        if (!pages) return [];

        const results: ImageProposal[] = [];
        for (const pageId of Object.keys(pages)) {
            const page = pages[pageId];
            if (page?.original?.source) {
                results.push({
                    url: page.original.source,
                    source: 'WIKIPEDIA',
                    credit: 'Wikimedia Commons',
                    description: page.title || query,
                });
            }
        }
        
        // Wikipedia `generator=search` does not strictly guarantee result order matches IDs,
        // so we just return the batch found limits up to `limit`.
        return results.slice(0, limit);

    } catch (error: any) {
        logger.error(`Failed to fetch Wikipedia images for query "${query}"`, {
            error: error.message,
            module: 'WikipediaFetcher'
        });
        return [];
    }
}

/**
 * Get unified image proposals (OG + Wiki).
 */
export async function getArticleImageProposals(sourceUrls?: string[] | null, topic?: string | null, lang: string = 'en'): Promise<ImageProposal[]> {
    const searchPromises: Promise<any>[] = [];

    // 1. OG Search across all sources
    if (sourceUrls && Array.isArray(sourceUrls)) {
        // Take up to 10 sources to avoid excessive requests, but generally all if unique
        const uniqueUrls = [...new Set(sourceUrls.filter(u => u && u.startsWith('http')))].slice(0, 10);
        for (const url of uniqueUrls) {
            searchPromises.push(getOpenGraphImage(url));
        }
    }

    // 2. Wikipedia Search (Primary Lang)
    if (topic) {
        searchPromises.push(getWikipediaImages(topic, lang, 4));
        
        // 3. Fallback Wikipedia Search (English) if primary is not English
        if (lang !== 'en') {
            searchPromises.push(getWikipediaImages(topic, 'en', 4));
        }
    }

    // Run everything in parallel with a strict global timeout
    const results = await Promise.allSettled(searchPromises);
    
    const proposals: ImageProposal[] = [];
    for (const res of results) {
        if (res.status === 'fulfilled' && res.value) {
            if (Array.isArray(res.value)) {
                proposals.push(...res.value);
            } else {
                proposals.push(res.value as ImageProposal);
            }
        }
    }

    // Deduplicate by URL
    const seenUrls = new Set<string>();
    const uniqueProposals: ImageProposal[] = [];
    for (const p of proposals) {
        if (!seenUrls.has(p.url)) {
            seenUrls.add(p.url);
            uniqueProposals.push(p);
        }
    }

    return uniqueProposals.slice(0, 10);
}

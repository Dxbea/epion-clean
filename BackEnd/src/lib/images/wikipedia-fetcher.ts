import axios from 'axios';
import { logger } from '../logger.js';

/**
 * Fetches the main image for a given Wikipedia topic.
 * @param query The concept to search on English Wikipedia (e.g., 'Emmanuel Macron').
 * @returns The URL of the original image, or null if not found.
 */
export async function getWikipediaImage(query: string): Promise<string | null> {
    if (!query || query.trim() === '') {
        return null;
    }

    try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1`;
        const response = await axios.get(url, { 
            timeout: 5000, 
            headers: { 
                'User-Agent': 'EpionBot/1.0 (contact@epion.app)' 
            } 
        });
        
        const pages = response.data?.query?.pages;
        if (!pages) {
            return null;
        }
        
        const pageId = Object.keys(pages)[0];
        const page = pages[pageId];
        
        if (page?.original?.source) {
            return page.original.source;
        }
        
        return null;
    } catch (error: any) {
        logger.error(`Failed to fetch Wikipedia image for query "${query}"`, {
            error: error.message,
            module: 'WikipediaFetcher'
        });
        return null;
    }
}

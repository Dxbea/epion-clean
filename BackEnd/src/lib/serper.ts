import axios from 'axios';
import { env } from '../env.js';
import { logger } from './logger.js';

const SERPER_ENDPOINT = 'https://google.serper.dev/search';
const SERPER_TIMEOUT_MS = 8000;

interface SerperOrganicResult {
    title?: string;
    link?: string;
    snippet?: string;
    date?: string;
    position?: number;
}

interface SerperResponse {
    organic?: SerperOrganicResult[];
}

export interface SerperSearchResult {
    title: string;
    url: string;
    content: string;
    publishedDate?: string;
    score: number;
}

export interface SearchSerperOptions {
    maxResults?: number;
    gl?: string;
    hl?: string;
}

type SerperErrorContext = {
    message: string;
    status?: number;
    code?: string;
    responseBody?: string;
};

function normalizeScore(position: number | undefined, index: number): number {
    const rank = typeof position === 'number' && Number.isFinite(position) ? position : index + 1;
    return Math.max(0.05, 1 - ((rank - 1) * 0.1));
}

function normalizeResult(result: SerperOrganicResult, index: number): SerperSearchResult | null {
    const url = result.link?.trim();
    if (!url) {
        return null;
    }

    return {
        title: result.title?.trim() || url,
        url,
        content: result.snippet?.trim() || '',
        publishedDate: result.date?.trim() || undefined,
        score: normalizeScore(result.position, index),
    };
}

async function requestSerper(query: string, options: SearchSerperOptions = {}): Promise<SerperSearchResult[]> {
    if (!env.SERPER_API_KEY) {
        throw new Error('SERPER_API_KEY missing');
    }

    logger.debug('Serper request started', {
        module: 'Serper',
        query,
        gl: options.gl || 'fr',
        hl: options.hl || 'fr',
        maxResults: options.maxResults ?? 10,
    });

    const response = await axios.post<SerperResponse>(
        SERPER_ENDPOINT,
        {
            q: query,
            gl: options.gl || 'fr',
            hl: options.hl || 'fr',
            num: options.maxResults ?? 10,
        },
        {
            timeout: SERPER_TIMEOUT_MS,
            headers: {
                'X-API-KEY': env.SERPER_API_KEY,
                'Content-Type': 'application/json',
            },
        },
    );

    const rawResults = Array.isArray(response.data?.organic) ? response.data.organic : [];
    const normalizedResults = rawResults
        .map((result, index) => normalizeResult(result, index))
        .filter((result): result is SerperSearchResult => result !== null);

    return normalizedResults.slice(0, options.maxResults ?? 10);
}

function describeSerperError(error: unknown): SerperErrorContext {
    if (!axios.isAxiosError(error)) {
        return {
            message: error instanceof Error ? error.message : 'Unknown Serper error',
        };
    }

    return {
        message: error.message,
        status: error.response?.status,
        code: error.code,
        responseBody: error.response?.data
            ? typeof error.response.data === 'string'
                ? error.response.data
                : JSON.stringify(error.response.data)
            : undefined,
    };
}

export async function searchSerper(
    query: string,
    options: SearchSerperOptions = {},
): Promise<SerperSearchResult[]> {
    try {
        return await requestSerper(query, options);
    } catch (error: unknown) {
        const details = describeSerperError(error);
        const logLevel = details.status === 403 || details.status === 429 ? 'error' : 'warn';

        logger.log(logLevel, 'Serper search failed, returning empty results', {
            module: 'Serper',
            query,
            gl: options.gl || 'fr',
            hl: options.hl || 'fr',
            status: details.status,
            code: details.code,
            error: details.message,
            responseBody: details.responseBody,
        });

        return [];
    }
}

export async function probeSerper(): Promise<{ status: 'up' | 'down'; latency?: string; error?: string }> {
    const startedAt = Date.now();

    try {
        await requestSerper('ping', { maxResults: 1 });
        return {
            status: 'up',
            latency: `${Date.now() - startedAt}ms`,
        };
    } catch (error: unknown) {
        const details = describeSerperError(error);

        return {
            status: 'down',
            error: details.responseBody || details.message,
        };
    }
}

export function getSerperConfig() {
    return {
        endpoint: SERPER_ENDPOINT,
        timeoutMs: SERPER_TIMEOUT_MS,
    };
}

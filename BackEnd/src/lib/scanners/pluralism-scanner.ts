import { logger } from "../logger.js";

interface PluralismResult {
    score: number;
    details: {
        pivots: number;
        entities: number;
        controversy: number;
    };
    reasoning: string;
}

interface PluralismInput {
    url?: string;
    content?: string;
}

const PIVOT_KEYWORDS = [
    /cependant/gi,
    /toutefois/gi,
    /néanmoins/gi,
    /au contraire/gi,
    /en revanche/gi,
    /selon les critiques/gi,
    /d'après l'opposition/gi,
    /bien que/gi,
    /malgré/gi,
];

const ATTRIBUTION_PATTERNS = [
    /selon\s+/gi,
    /d'après\s+/gi,
    /a déclaré/gi,
    /a affirmé/gi,
    /a estimé/gi,
    /a annoncé/gi,
    /a dénoncé/gi,
    /explique/gi,
];

const CONTROVERSY_PATTERNS = [
    /controverse/gi,
    /désaccord/gi,
    /débat/gi,
    /critique/gi,
    /opposition/gi,
    /contest/gi,
    /polémique/gi,
    /nuance/gi,
    /tension/gi,
];

function countMatches(content: string, patterns: RegExp[]): number {
    return patterns.reduce((count, pattern) => count + (content.match(pattern)?.length || 0), 0);
}

function collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function analyzeContentHeuristics(content: string): PluralismResult {
    const safeContent = collapseWhitespace(content);
    const pivotCount = countMatches(safeContent, PIVOT_KEYWORDS);
    const attributionCount = countMatches(safeContent, ATTRIBUTION_PATTERNS);
    const controversyCount = countMatches(safeContent, CONTROVERSY_PATTERNS);

    const pivotScore = Math.min(20, pivotCount * 4);
    const entityScore = Math.min(40, attributionCount * 5);
    const controversyScore = Math.min(40, controversyCount * 8);

    const rawScore = pivotScore + entityScore + controversyScore;
    const finalScore = Math.max(35, Math.min(100, rawScore || 50));

    return {
        score: finalScore,
        details: {
            pivots: pivotScore,
            entities: entityScore,
            controversy: controversyScore,
        },
        reasoning: `Analyse heuristique locale sur ${safeContent.length} caractères (pivots=${pivotCount}, attributions=${attributionCount}, controverses=${controversyCount}).`,
    };
}

export async function analyzePluralism(
    domain: string,
    input: string | PluralismInput = {},
): Promise<PluralismResult> {
    const options = typeof input === 'string' ? { url: input } : input;
    const providedContent = collapseWhitespace(options.content || '');

    if (providedContent.length >= 600) {
        logger.info(`Pluralism: Using prefetched content for ${domain}.`, { module: 'PluralismScanner' });
        return analyzeContentHeuristics(providedContent);
    }

    const targetUrl = options.url || `https://${domain}`;
    logger.info(`Starting Pluralism Analysis for ${targetUrl}...`, { module: 'PluralismScanner' });

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(targetUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            },
        });
        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        const content = collapseWhitespace(html.replace(/<[^>]+>/g, ' '));
        if (content.length < 600) {
            throw new Error('Content too short for pluralism analysis');
        }

        logger.info(`Pluralism: Content Valid (${content.length} chars). Running heuristic analysis.`, { module: 'PluralismScanner' });
        return analyzeContentHeuristics(content);
    } catch (error: any) {
        logger.warn(`Pluralism fetch failed for ${domain}, returning neutral score: ${error.message}`, { module: 'PluralismScanner' });
        return {
            score: 50,
            details: { pivots: 10, entities: 20, controversy: 20 },
            reasoning: 'Analyse indisponible; score neutre appliqué faute de contenu exploitable.',
        };
    }
}

import OpenAI from 'openai';
import { logger } from '../logger';
import { RoutingDecision } from './types';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `Tu es un moteur de recherche expert. Pour la question posée, génère exactement
3 requêtes de recherche Google avec des angles COMPLÉMENTAIRES (pas des
traductions). Les 3 angles obligatoires sont :

"query_factual" : recherche factuelle neutre sur le sujet principal

"query_critical" : recherche sur les controverses, critiques, biais,
ou financement lié au sujet

"query_contextual" : recherche de contexte analytique (études, classements,
comparaisons institutionnelles)

Réponds en JSON strict :
{ "route": "HOT_NEWS|COLD_INVESTIGATION|MIXED", "query_factual": "...",
"query_critical": "...", "query_contextual": "..." }

Règle absolue : les 3 requêtes doivent utiliser des mots-clés différents et
viser des types de sources différents. Ne jamais générer de simples traductions.`;

function normalizeSearchText(input: string): string {
    return input
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ' ')
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function ensureSearchCoverage(originalQuery: string, generatedQuery: string): string {
    const original = originalQuery.trim();
    const candidate = generatedQuery.trim();

    if (!original) {
        return candidate;
    }

    const originalWords = original.split(/\s+/).filter(Boolean);
    if (originalWords.length <= 5) {
        return original;
    }

    const normalizedCandidate = ` ${normalizeSearchText(candidate)} `;
    const mustKeepTerms = Array.from(new Set(
        originalWords.filter((word) => /\d{4}/.test(word) || word.length >= 5),
    ));

    const missingTerms = mustKeepTerms.filter((term) => {
        const normalizedTerm = normalizeSearchText(term);
        return normalizedTerm && !normalizedCandidate.includes(` ${normalizedTerm} `);
    });

    if (missingTerms.length === 0) {
        return candidate;
    }

    return `${candidate} ${missingTerms.join(' ')}`.trim();
}

function ensureDistinctQuery(
    fallbackBase: string,
    candidate: string,
    requiredSuffix: string,
    usedQueries: string[],
): string {
    const normalizedCandidate = normalizeSearchText(candidate);
    if (normalizedCandidate && !usedQueries.includes(normalizedCandidate)) {
        return candidate;
    }

    return `${fallbackBase} ${requiredSuffix}`.trim();
}

export async function classifyAndRoute(
    title: string,
    content: string,
): Promise<RoutingDecision> {
    logger.info(`Smart Router starting for: "${title.slice(0, 60)}..."`, {
        module: 'SmartRouter',
    });

    const excerpt = content.length > 800
        ? `${content.slice(0, 800)}\n[...]`
        : content;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: `Question : "${title}"\n\nContexte :\n${excerpt}` },
            ],
            temperature: 0.1,
            max_tokens: 250,
            response_format: { type: 'json_object' },
        });

        const rawContent = response.choices[0].message.content || '{}';
        const parsed = JSON.parse(rawContent);

        const validRoutes = ['HOT_NEWS', 'COLD_INVESTIGATION', 'MIXED'];
        const route = validRoutes.includes(parsed.route) ? parsed.route : 'MIXED';

        const baseQuery = title.trim() || 'actualité';
        const queryFactual = typeof parsed.query_factual === 'string' && parsed.query_factual.trim().length > 0
            ? ensureSearchCoverage(baseQuery, parsed.query_factual.trim())
            : `${baseQuery} faits`;
        const usedQueries = [normalizeSearchText(queryFactual)];

        const criticalBase = typeof parsed.query_critical === 'string' && parsed.query_critical.trim().length > 0
            ? ensureSearchCoverage(baseQuery, parsed.query_critical.trim())
            : `${baseQuery} critiques biais financement`;
        const queryCritical = ensureDistinctQuery(baseQuery, criticalBase, 'critiques biais financement', usedQueries);
        usedQueries.push(normalizeSearchText(queryCritical));

        const contextualBase = typeof parsed.query_contextual === 'string' && parsed.query_contextual.trim().length > 0
            ? ensureSearchCoverage(baseQuery, parsed.query_contextual.trim())
            : `${baseQuery} étude classement comparaison`;
        const queryContextual = ensureDistinctQuery(baseQuery, contextualBase, 'étude classement comparaison', usedQueries);

        const decision: RoutingDecision = {
            route,
            query_factual: queryFactual,
            query_critical: queryCritical,
            query_contextual: queryContextual,
        };

        logger.info(`Smart Router decision: ${route}`, {
            module: 'SmartRouter',
            query_factual: decision.query_factual,
            query_critical: decision.query_critical,
            query_contextual: decision.query_contextual,
        });

        return decision;
    } catch (error: any) {
        logger.error('Smart Router failed, using MIXED fallback', {
            module: 'SmartRouter',
            error: error.message,
        });

        return {
            route: 'MIXED',
            query_factual: title,
            query_critical: `${title} critiques biais financement`.trim(),
            query_contextual: `${title} étude classement comparaison`.trim(),
        };
    }
}

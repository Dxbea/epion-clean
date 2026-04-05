/**
 * Phase 2A.1 — The Smart Router (OpenAI gpt-4o-mini)
 * 
 * Ultra-fast OSINT classification call.
 * Generates multilingual search queries (FR, EN, + optional local language)
 * for parallel Tavily searches across the global source matrix.
 * 
 * v2.1 — Multilingual queries for worldwide coverage.
 */
import OpenAI from 'openai';
import { logger } from '../logger';
import { RoutingDecision } from './types';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `Tu es le Smart Router d'Epion, une IA experte en Open Source Intelligence (OSINT).
Ton rôle est d'analyser le sujet fourni et de préparer les requêtes de recherche pour notre API Tavily.

RÈGLE D'OR : Pour obtenir une couverture mondiale, tu dois générer 2 à 3 requêtes de recherche TRADUITES.
1. "query_fr" : Mots-clés en FRANÇAIS optimisés pour la presse francophone (ex: "Rafale F5 financement Émirats retrait").
2. "query_en" : Mots-clés traduits en ANGLAIS pour la presse anglophone (ex: "Rafale F5 UAE defense funding contract withdrawal").
3. "query_local" : Mots-clés dans la LANGUE LOCALE du pays concerné par l'actualité (ex: en Allemand si ça concerne Scholz, en Espagnol pour Madrid, en Italien pour Rome). Si le sujet est purement franco-français ou international sans pays local spécifique, mets null.

Détermine aussi la route :
- HOT_NEWS : actualité récente (<7 jours), événement en cours, breaking news
- COLD_INVESTIGATION : sujet de fond, analyse historique, tendance long terme
- MIXED : sujet d'actualité qui nécessite aussi du contexte de fond

IMPORTANT : Les requêtes doivent être concises (3-6 mots-clés), spécifiques, et optimisées pour un moteur de recherche. Pas de phrases complètes.

Réponds STRICTEMENT au format JSON :
{
  "route": "HOT_NEWS",
  "query_fr": "mots-clés français",
  "query_en": "english keywords",
  "query_local": "lokale Stichwörter" ou null
}`;

/**
 * Classify the subject and generate multilingual search queries.
 * Ultra-fast call (~300-500ms) that routes the investigation.
 */
export async function classifyAndRoute(
    title: string,
    content: string
): Promise<RoutingDecision> {
    logger.info(`🧭 Smart Router starting for: "${title.slice(0, 60)}..."`, { module: 'SmartRouter' });

    // Only send a short extract to minimize tokens (this is a classification task)
    const excerpt = content.length > 800
        ? content.slice(0, 800) + '\n[...]'
        : content;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: `Titre : "${title}"\n\nExtrait :\n${excerpt}` }
            ],
            temperature: 0.1,
            max_tokens: 250,
            response_format: { type: 'json_object' },
        });

        const rawContent = response.choices[0].message.content || '{}';
        const parsed = JSON.parse(rawContent);

        // Validate route
        const validRoutes = ['HOT_NEWS', 'COLD_INVESTIGATION', 'MIXED'];
        const route = validRoutes.includes(parsed.route) ? parsed.route : 'MIXED';

        // Validate queries
        const query_fr = typeof parsed.query_fr === 'string' && parsed.query_fr.trim().length > 0
            ? parsed.query_fr.trim()
            : title; // Fallback to title

        const query_en = typeof parsed.query_en === 'string' && parsed.query_en.trim().length > 0
            ? parsed.query_en.trim()
            : title; // Fallback to title

        const query_local = typeof parsed.query_local === 'string' && parsed.query_local.trim().length > 0
            ? parsed.query_local.trim()
            : null;

        const decision: RoutingDecision = { route, query_fr, query_en, query_local };

        logger.info(`✅ Smart Router decision: ${route}`, {
            module: 'SmartRouter',
            query_fr,
            query_en,
            query_local: query_local || '(none)',
        });

        return decision;

    } catch (error: any) {
        logger.error(`❌ Smart Router failed, using MIXED fallback`, {
            module: 'SmartRouter',
            error: error.message,
        });

        // Fallback: use title as queries
        return {
            route: 'MIXED',
            query_fr: title,
            query_en: title,
            query_local: null,
        };
    }
}

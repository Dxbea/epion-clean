import { PoliticalBias, Reliability } from "@prisma/client";
import { callWebSearchLLM, type WebChatMessage } from "./web-chat.js";
import type { FactCheckResult } from "./google-fact-check.js";
import { logger } from "./logger.js";
import { searchSerper } from "./serper.js";

const VALID_SOURCE_TYPES = ["AGENCY", "MEDIA", "ACADEMIC", "GOVERNMENT", "BLOG", "SOCIAL", "COMMERCIAL", "GENERAL"] as const;
export type SourceType = typeof VALID_SOURCE_TYPES[number];

export interface InvestigationResult {
    reliability: Reliability;
    sourceType: SourceType;
    reasoning: string;
    politicalBias: PoliticalBias;
    biasScore: number;
    shortBio: string | null;
}

const VALID_RELIABILITIES = new Set<Reliability>([
    Reliability.HIGH,
    Reliability.MIXED,
    Reliability.LOW,
    Reliability.PROPAGANDA,
]);

const VALID_POLITICAL_BIAS = new Set<PoliticalBias>([
    PoliticalBias.EXTREME_LEFT,
    PoliticalBias.LEFT,
    PoliticalBias.CENTER_LEFT,
    PoliticalBias.CENTER,
    PoliticalBias.CENTER_RIGHT,
    PoliticalBias.RIGHT,
    PoliticalBias.EXTREME_RIGHT,
    PoliticalBias.SATIRE,
    PoliticalBias.UNKNOWN,
]);

function normalizeShortBio(input: unknown): string | null {
    if (typeof input !== "string") {
        return null;
    }

    const normalized = input.replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "");
    return normalized || null;
}

export async function evaluateUnknownSource(
    domain: string,
    factCheckResult?: FactCheckResult,
): Promise<InvestigationResult> {
    logger.info(`Investigating unknown source: ${domain}`, { module: 'ColdProfiler' });

    const effectiveFactCheckResult = factCheckResult ?? { failureCount: 0, recentFailures: false };
    if (effectiveFactCheckResult.failureCount > 0) {
        logger.warn(`Source ${domain} has ${effectiveFactCheckResult.failureCount} fact-check failures.`, { module: 'ColdProfiler' });
        return {
            reliability: Reliability.LOW,
            sourceType: 'GENERAL',
            reasoning: `Historique problématique : ${effectiveFactCheckResult.failureCount} échecs de vérification factuelle détectés (via Google Fact Check).`,
            politicalBias: PoliticalBias.UNKNOWN,
            biasScore: 0,
            shortBio: null,
        };
    }

    const searchResults = await searchSerper(`${domain} ownership reputation reliability wikipedia`, {
        maxResults: 5,
        gl: 'fr',
        hl: 'fr',
    });

    if (searchResults.length === 0) {
        logger.warn(`No Serper reputation results for ${domain}`, { module: 'ColdProfiler' });
        return {
            reliability: Reliability.MIXED,
            sourceType: 'GENERAL',
            reasoning: 'Aucun contexte Serper trouvé pour évaluer finement la source.',
            politicalBias: PoliticalBias.UNKNOWN,
            biasScore: 0,
            shortBio: null,
        };
    }

    const serperContext = searchResults
        .map((result, index) => [
            `[Result ${index + 1}]`,
            `Title: ${result.title}`,
            `URL: ${result.url}`,
            `Snippet: ${result.content || '(no snippet)'}`,
        ].join('\n'))
        .join('\n\n');

    const prompt = `
Agis comme un expert en désinformation et analyse la fiabilité de la source : "${domain}".
Base-toi UNIQUEMENT sur les résultats Serper suivants (titres, URLs, snippets).

CONTEXTE SERPER:
${serperContext}

Verdict attendu (JSON strict) :
{
  "reliability": "HIGH" | "MIXED" | "LOW" | "PROPAGANDA",
  "sourceType": "AGENCY" | "MEDIA" | "ACADEMIC" | "GOVERNMENT" | "BLOG" | "SOCIAL" | "COMMERCIAL" | "GENERAL",
  "politicalBias": "EXTREME_LEFT" | "LEFT" | "CENTER_LEFT" | "CENTER" | "CENTER_RIGHT" | "RIGHT" | "EXTREME_RIGHT" | "SATIRE" | "UNKNOWN",
  "biasScore": number,
  "short_bio": "Courte biographie factuelle (max 15 mots)",
  "reasoning": "Court résumé des preuves trouvées (max 2 phrases)"
}

Critères de classification (reliability) :
- HIGH : Média reconnu, institution scientifique, agence de presse, ou source très transparente.
- MIXED : Blog d'opinion, site partisan mais factuel, ou site récent sans historique clair.
- LOW : Tabloïd sensationnaliste, clickbait avéré, ou manque de transparence marqué.
- PROPAGANDA : Fake news, complotisme, ou satire non déclarée.

Critères de classification (sourceType) :
- AGENCY : Agence de presse.
- MEDIA : Journal, chaîne TV, radio, magazine d'information.
- ACADEMIC : Université, revue scientifique, centre de recherche.
- GOVERNMENT : Site gouvernemental, institution publique.
- BLOG : Blog personnel, newsletter indépendante.
- SOCIAL : Réseau social, plateforme communautaire.
- COMMERCIAL : Site d'entreprise, e-commerce, relations publiques.
- GENERAL : Autre ou inclassable.

Consignes supplémentaires :
- Génère également une courte biographie factuelle de ce média (max 15 mots) basée sur le texte fourni.
- biasScore doit rester entre -100 et 100.
- Réponds UNIQUEMENT le JSON.
`;

    const messages: WebChatMessage[] = [
        { role: 'user', content: prompt },
    ];

    try {
        const { answer } = await callWebSearchLLM(messages, {
            useSearch: false,
        });

        const cleanJson = answer.replace(/^```json/, '').replace(/```$/, '').trim();
        const parsed = JSON.parse(cleanJson);

        const reliability = VALID_RELIABILITIES.has(parsed.reliability)
            ? parsed.reliability as Reliability
            : Reliability.MIXED;

        const sourceType: SourceType = VALID_SOURCE_TYPES.includes(parsed.sourceType)
            ? parsed.sourceType as SourceType
            : 'GENERAL';

        const politicalBias = VALID_POLITICAL_BIAS.has(parsed.politicalBias)
            ? parsed.politicalBias as PoliticalBias
            : PoliticalBias.UNKNOWN;

        const biasScore = typeof parsed.biasScore === 'number' && Number.isFinite(parsed.biasScore)
            ? Math.max(-100, Math.min(100, Math.round(parsed.biasScore)))
            : 0;

        const shortBio = normalizeShortBio(parsed.short_bio);

        logger.info(`Investigation complete for ${domain}: ${reliability} (${sourceType})`, { module: 'ColdProfiler' });

        return {
            reliability,
            sourceType,
            reasoning: parsed.reasoning || 'Analyse IA basée sur la réputation web.',
            politicalBias,
            biasScore,
            shortBio,
        };
    } catch (error: any) {
        logger.error(`Web investigation failed for ${domain}`, { module: 'ColdProfiler', error: error.message });
        return {
            reliability: Reliability.MIXED,
            sourceType: 'GENERAL',
            reasoning: 'Investigation échouée (service indisponible). Classé MIXED par prudence.',
            politicalBias: PoliticalBias.UNKNOWN,
            biasScore: 0,
            shortBio: null,
        };
    }
}

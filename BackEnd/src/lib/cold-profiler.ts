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
    profileSummary: string | null;
    ownership: string | null;
    businessModel: string | null;
    editorialPositioning: string | null;
    specialty: string | null;
    strengths: string[];
    vigilancePoints: string[];
    externalReferences: Array<{ label: string; url: string }>;
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

function normalizeDocumentedPoints(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return Array.from(new Set(input
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.replace(/\s+/g, ' ').trim())
        .filter(Boolean)));
}

function normalizeProfileFact(input: unknown): string | null {
    return normalizeShortBio(input);
}

function emptyProfileEvidence() {
    return {
        profileSummary: null,
        ownership: null,
        businessModel: null,
        editorialPositioning: null,
        specialty: null,
        strengths: [] as string[],
        vigilancePoints: [] as string[],
        externalReferences: [] as Array<{ label: string; url: string }>,
    };
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
            ...emptyProfileEvidence(),
        };
    }

    const searchResults = await searchSerper(`${domain} propriétaire ownership modèle économique financement ligne éditoriale spécialité réputation`, {
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
            ...emptyProfileEvidence(),
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
Construis le profil global, factuel et neutre de la source ou organisation correspondant au domaine "${domain}".
Base-toi UNIQUEMENT sur les résultats Serper suivants (titres, URLs, snippets).
Le profil doit décrire l'organisation ou la plateforme elle-même, jamais l'article, la vidéo, le post ou la page ayant cité ce domaine.

CONTEXTE SERPER:
${serperContext}

Verdict attendu (JSON strict) :
{
  "reliability": "HIGH" | "MIXED" | "LOW" | "PROPAGANDA",
  "sourceType": "AGENCY" | "MEDIA" | "ACADEMIC" | "GOVERNMENT" | "BLOG" | "SOCIAL" | "COMMERCIAL" | "GENERAL",
  "politicalBias": "EXTREME_LEFT" | "LEFT" | "CENTER_LEFT" | "CENTER" | "CENTER_RIGHT" | "RIGHT" | "EXTREME_RIGHT" | "SATIRE" | "UNKNOWN",
  "biasScore": number,
  "short_bio": "Courte biographie factuelle (max 15 mots)",
  "profileSummary": "Résumé global factuel de la source en 2 à 4 phrases, ou null",
  "ownership": "Propriétaire, groupe ou gouvernance documentée, ou null",
  "businessModel": "Modèle économique documenté, ou null",
  "editorialPositioning": "Positionnement éditorial documenté, formulé sans jugement, ou null",
  "specialty": "Domaine de spécialité documenté, ou null",
  "strengths": ["Éléments favorables explicitement documentés dans les résultats"],
  "vigilancePoints": ["Points de vigilance explicitement documentés dans les résultats"],
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
- Génère une courte biographie globale de la source (max 15 mots), sans reprendre le titre ni la description d'un contenu individuel.
- Chaque fait spécifique doit être directement étayé par au moins un résultat fourni. Utilise null ou [] si l'information n'est pas documentée.
- Pour un média, recherche propriété, modèle économique, spécialité et positionnement éditorial documenté.
- Pour une institution, résume son mandat officiel et son autorité sur le sujet ; signale neutralement que sa communication exprime un point de vue institutionnel et n'est pas une évaluation indépendante.
- Pour YouTube, Facebook, Dailymotion ou une autre plateforme, décris uniquement la plateforme globale. Indique que la fiabilité dépend du compte, de l'auteur et du contenu cité.
- N'ajoute dans strengths et vigilancePoints que des éléments factuels, neutres, globaux et explicitement étayés par les résultats. Utilise [] si rien n'est documenté.
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
        const profileSummary = normalizeProfileFact(parsed.profileSummary);
        const ownership = normalizeProfileFact(parsed.ownership);
        const businessModel = normalizeProfileFact(parsed.businessModel);
        const editorialPositioning = normalizeProfileFact(parsed.editorialPositioning);
        const specialty = normalizeProfileFact(parsed.specialty);
        const strengths = normalizeDocumentedPoints(parsed.strengths);
        const vigilancePoints = normalizeDocumentedPoints(parsed.vigilancePoints);
        const externalReferences = searchResults.map((result) => ({ label: result.title, url: result.url }));

        logger.info(`Investigation complete for ${domain}: ${reliability} (${sourceType})`, { module: 'ColdProfiler' });

        return {
            reliability,
            sourceType,
            reasoning: parsed.reasoning || 'Analyse IA basée sur la réputation web.',
            politicalBias,
            biasScore,
            shortBio,
            profileSummary,
            ownership,
            businessModel,
            editorialPositioning,
            specialty,
            strengths,
            vigilancePoints,
            externalReferences,
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
            ...emptyProfileEvidence(),
        };
    }
}

import { Reliability } from "@prisma/client";
import { callPerplexity, PerplexityMessage } from "./perplexity";
import { checkMediaReputation } from "./google-fact-check";
import { logger } from "./logger";

// Valid source types matching the Prisma SourceType enum
const VALID_SOURCE_TYPES = ["AGENCY", "MEDIA", "ACADEMIC", "GOVERNMENT", "BLOG", "SOCIAL", "COMMERCIAL", "GENERAL"] as const;
export type SourceType = typeof VALID_SOURCE_TYPES[number];

export interface InvestigationResult {
    reliability: Reliability;
    sourceType: SourceType;
    reasoning: string;
}

/**
 * Enquête sur une source inconnue pour déterminer sa fiabilité et son type.
 * Utilise d'abord Google Fact Check, puis Perplexity (Sonar).
 */
export async function evaluateUnknownSource(domain: string): Promise<InvestigationResult> {
    logger.info(`🔍 Investigating unknown source: ${domain}`, { module: 'ColdProfiler' });

    // 1. Google Fact Check Pre-SCREENING ("Kill Switch")
    // Si la source a déjà menti, pas besoin d'IA coûteuse : c'est LOW.
    const factCheckResult = await checkMediaReputation(domain);
    if (factCheckResult.failureCount > 0) {
        logger.warn(`❌ Source ${domain} has ${factCheckResult.failureCount} fact-check failures.`, { module: 'ColdProfiler' });
        return {
            reliability: Reliability.LOW,
            sourceType: 'GENERAL',
            reasoning: `Historique problématique : ${factCheckResult.failureCount} échecs de vérification factuelle détectés (via Google Fact Check).`
        };
    }

    // 2. Perplexity Investigation (Sonar)
    // On demande à l'IA d'agir comme un expert en désinformation.
    const prompt = `
Agis comme un expert en désinformation et analyse la fiabilité de la source : "${domain}".
Recherche sa réputation, ses propriétaires, son historique sur le web et Wikipédia.

Verdict attendu (JSON strict) :
{
  "reliability": "HIGH" | "MIXED" | "LOW" | "PROPAGANDA",
  "sourceType": "AGENCY" | "MEDIA" | "ACADEMIC" | "GOVERNMENT" | "BLOG" | "SOCIAL" | "COMMERCIAL" | "GENERAL",
  "reasoning": "Court résumé des preuves trouvées (max 2 phrases)"
}

Critères de classification (reliability) :
- HIGH : Média reconnu (ex: Le Monde, NY Times), prix journalistiques, institution scientifique, ou agence de presse.
- MIXED : Blog d'opinion, site partisan mais factuel, ou site récent sans historique clair.
- LOW : Tabloïd sensationnaliste, clickbait avéré, ou manque de transparence total.
- PROPAGANDA : Fake news, complotisme, ou satire non déclarée.

Critères de classification (sourceType) :
- AGENCY : Agence de presse (AFP, Reuters, AP).
- MEDIA : Journal, chaîne TV, radio, magazine d'information.
- ACADEMIC : Université, revue scientifique, centre de recherche.
- GOVERNMENT : Site gouvernemental, institution publique.
- BLOG : Blog personnel, newsletter indépendante.
- SOCIAL : Réseau social, plateforme communautaire.
- COMMERCIAL : Site d'entreprise, e-commerce, RP.
- GENERAL : Autre ou inclassable.

Réponds UNIQUEMENT le JSON.
`;

    const messages: PerplexityMessage[] = [
        { role: 'user', content: prompt }
    ];

    try {
        const { answer } = await callPerplexity(messages, 'sonar');

        // Nettoyage du JSON (au cas où il y a du markdown ```json ... ```)
        const cleanJson = answer.replace(/^```json/, '').replace(/```$/, '').trim();
        const parsed = JSON.parse(cleanJson);

        // Validation reliability
        const validReliabilities = ["HIGH", "MIXED", "LOW", "PROPAGANDA"];
        const reliability = validReliabilities.includes(parsed.reliability)
            ? parsed.reliability as Reliability
            : Reliability.MIXED; // Fallback prudent

        // Validation sourceType
        const sourceType: SourceType = VALID_SOURCE_TYPES.includes(parsed.sourceType)
            ? parsed.sourceType as SourceType
            : 'GENERAL'; // Fallback

        logger.info(`✅ Investigation complete for ${domain}: ${reliability} (${sourceType})`, { module: 'ColdProfiler' });

        return {
            reliability,
            sourceType,
            reasoning: parsed.reasoning || "Analyse IA basée sur la réputation web."
        };

    } catch (error: any) {
        logger.error(`❌ Perplexity investigation failed for ${domain}`, { error: error.message });
        // Fallback ultime : On reste sur MIXED + GENERAL
        return {
            reliability: Reliability.MIXED,
            sourceType: 'GENERAL',
            reasoning: "Investigation échouée (Service indisponible). Classé MIXED par prudence."
        };
    }
}

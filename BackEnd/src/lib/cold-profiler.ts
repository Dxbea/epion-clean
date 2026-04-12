import { Reliability } from "@prisma/client";
import { callWebSearchLLM, type WebChatMessage } from "./web-chat";
import { checkMediaReputation } from "./google-fact-check";
import { logger } from "./logger";
import { searchSerper } from "./serper";

// Valid source types matching the Prisma SourceType enum
const VALID_SOURCE_TYPES = ["AGENCY", "MEDIA", "ACADEMIC", "GOVERNMENT", "BLOG", "SOCIAL", "COMMERCIAL", "GENERAL"] as const;
export type SourceType = typeof VALID_SOURCE_TYPES[number];

export interface InvestigationResult {
    reliability: Reliability;
    sourceType: SourceType;
    reasoning: string;
}

/**
 * EnquÃªte sur une source inconnue pour dÃ©terminer sa fiabilitÃ© et son type.
 * Utilise d'abord Google Fact Check, puis Serper + LLM.
 */
export async function evaluateUnknownSource(domain: string): Promise<InvestigationResult> {
    logger.info(`ðŸ” Investigating unknown source: ${domain}`, { module: 'ColdProfiler' });

    // 1. Google Fact Check Pre-SCREENING ("Kill Switch")
    // Si la source a dÃ©jÃ  menti, pas besoin d'IA coÃ»teuse : c'est LOW.
    const factCheckResult = await checkMediaReputation(domain);
    if (factCheckResult.failureCount > 0) {
        logger.warn(`âŒ Source ${domain} has ${factCheckResult.failureCount} fact-check failures.`, { module: 'ColdProfiler' });
        return {
            reliability: Reliability.LOW,
            sourceType: 'GENERAL',
            reasoning: `Historique problÃ©matique : ${factCheckResult.failureCount} Ã©checs de vÃ©rification factuelle dÃ©tectÃ©s (via Google Fact Check).`
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
            reasoning: "Aucun contexte Serper trouvé pour évaluer finement la source."
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

    // 2. Web Investigation (Serper + LLM)
    // On demande Ã  l'IA d'agir comme un expert en dÃ©sinformation.
    const prompt = `
Agis comme un expert en dÃ©sinformation et analyse la fiabilitÃ© de la source : "${domain}".
Base-toi UNIQUEMENT sur les rÃ©sultats Serper suivants (titres, URLs, snippets).

CONTEXTE SERPER:
${serperContext}

Verdict attendu (JSON strict) :
{
  "reliability": "HIGH" | "MIXED" | "LOW" | "PROPAGANDA",
  "sourceType": "AGENCY" | "MEDIA" | "ACADEMIC" | "GOVERNMENT" | "BLOG" | "SOCIAL" | "COMMERCIAL" | "GENERAL",
  "reasoning": "Court rÃ©sumÃ© des preuves trouvÃ©es (max 2 phrases)"
}

CritÃ¨res de classification (reliability) :
- HIGH : MÃ©dia reconnu (ex: Le Monde, NY Times), prix journalistiques, institution scientifique, ou agence de presse.
- MIXED : Blog d'opinion, site partisan mais factuel, ou site rÃ©cent sans historique clair.
- LOW : TabloÃ¯d sensationnaliste, clickbait avÃ©rÃ©, ou manque de transparence total.
- PROPAGANDA : Fake news, complotisme, ou satire non dÃ©clarÃ©e.

CritÃ¨res de classification (sourceType) :
- AGENCY : Agence de presse (AFP, Reuters, AP).
- MEDIA : Journal, chaÃ®ne TV, radio, magazine d'information.
- ACADEMIC : UniversitÃ©, revue scientifique, centre de recherche.
- GOVERNMENT : Site gouvernemental, institution publique.
- BLOG : Blog personnel, newsletter indÃ©pendante.
- SOCIAL : RÃ©seau social, plateforme communautaire.
- COMMERCIAL : Site d'entreprise, e-commerce, RP.
- GENERAL : Autre ou inclassable.

RÃ©ponds UNIQUEMENT le JSON.
`;

    const messages: WebChatMessage[] = [
        { role: 'user', content: prompt }
    ];

    try {
        const { answer } = await callWebSearchLLM(messages, {
            useSearch: false,
        });

        // Nettoyage du JSON (au cas oÃ¹ il y a du markdown ```json ... ```)
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

        logger.info(`âœ… Investigation complete for ${domain}: ${reliability} (${sourceType})`, { module: 'ColdProfiler' });

        return {
            reliability,
            sourceType,
            reasoning: parsed.reasoning || "Analyse IA basÃ©e sur la rÃ©putation web."
        };

    } catch (error: any) {
        logger.error(`âŒ Web investigation failed for ${domain}`, { error: error.message });
        // Fallback ultime : On reste sur MIXED + GENERAL
        return {
            reliability: Reliability.MIXED,
            sourceType: 'GENERAL',
            reasoning: "Investigation Ã©chouÃ©e (Service indisponible). ClassÃ© MIXED par prudence."
        };
    }
}


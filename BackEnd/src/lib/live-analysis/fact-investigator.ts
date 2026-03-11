/**
 * Phase 2A — The Investigator (Perplexity sonar)
 * 
 * Searches the web for context, verifies claims, and finds counter-arguments.
 * Does NOT give any score — purely factual data collection.
 */
import { callPerplexity, PerplexityMessage } from '../perplexity';
import { logger } from '../logger';
import { FactCheckContext } from './types';

/**
 * Investigate an article's claims using Perplexity web search.
 * Returns a FactCheckContext object with verified claims, counter-arguments, and missing context.
 */
export async function investigateArticle(
    title: string,
    content: string
): Promise<FactCheckContext> {
    logger.info(`🔍 Starting fact investigation for: "${title.slice(0, 60)}..."`, { module: 'FactInvestigator' });

    // Truncate content to avoid token limits (keep first ~3000 chars)
    const truncatedContent = content.length > 3000
        ? content.slice(0, 3000) + '\n[... contenu tronqué ...]'
        : content;

    const prompt = `
Tu es un enquêteur factuel. Analyse l'article suivant et effectue des recherches web pour vérifier ses affirmations.

**Titre :** "${title}"

**Contenu (extrait) :**
"""
${truncatedContent}
"""

**Tes missions (dans cet ordre strict) :**

1. **Vérification des affirmations clés** : Identifie les affirmations factuelles principales de l'article et vérifie chacune via tes recherches web. Pour chaque affirmation, indique si elle est vraie, fausse, ou partiellement vraie, avec le contexte trouvé.

2. **Contexte manquant** : Identifie les statistiques ou chiffres cités sans dénominateur ou contexte global. Par exemple, "13 000 personnes touchées" sans préciser la population totale.

3. **Contre-arguments publics** : Cherche les positions contradictoires crédibles sur ce sujet, provenant de sources reconnues.

**Réponds UNIQUEMENT en JSON strict :**
{
  "claimsVerified": [
    { "claim": "L'affirmation exacte citée", "verified": true/false, "context": "Ce que les sources web disent réellement" }
  ],
  "counterArguments": [
    { "point": "L'argument contradictoire", "source": "Nom de la source" }
  ],
  "missingContext": [
    { "stat": "Le chiffre cité brut", "fullContext": "Le contexte complet trouvé" }
  ]
}

Si tu ne trouves rien pour une catégorie, retourne un tableau vide [].
Réponds UNIQUEMENT le JSON, sans texte autour.
`;

    const messages: PerplexityMessage[] = [
        { role: 'user', content: prompt }
    ];

    try {
        const { answer } = await callPerplexity(messages, 'sonar');

        // Clean markdown wrapping
        const cleanJson = answer
            .replace(/^```json\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        const parsed = JSON.parse(cleanJson);

        const result: FactCheckContext = {
            claimsVerified: Array.isArray(parsed.claimsVerified) ? parsed.claimsVerified : [],
            counterArguments: Array.isArray(parsed.counterArguments) ? parsed.counterArguments : [],
            missingContext: Array.isArray(parsed.missingContext) ? parsed.missingContext : [],
        };

        logger.info(`✅ Investigation complete: ${result.claimsVerified.length} claims, ${result.counterArguments.length} counter-args, ${result.missingContext.length} missing context`, {
            module: 'FactInvestigator'
        });

        return result;

    } catch (error: any) {
        logger.error(`❌ Fact investigation failed`, { module: 'FactInvestigator', error: error.message });

        // Return empty context — the judges will still work, just without web verification
        return {
            claimsVerified: [],
            counterArguments: [],
            missingContext: [],
        };
    }
}

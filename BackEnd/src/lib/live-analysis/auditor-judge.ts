/**
 * Phase 2C — The Auditor Judge (Mistral mistral-small-latest)
 * 
 * Anti-hallucination guard-rail.
 * Receives the Primary Judge's verdict + the raw source text from Tavily.
 * 
 * SINGLE MISSION: Verify that every citation (quote) used by the Primary Judge
 * to justify a bias actually exists in the provided source text.
 * If a citation is fabricated, the Auditor penalizes the score.
 * 
 * v2.0 — Sprint 1: Recentered from full re-scoring to citation auditing.
 */
import { Mistral } from '@mistralai/mistralai';
import { logger } from '../logger';
import {
    FactCheckContext,
    JudgeVerdict,
    PillarScore,
    ContentIntent,
    VALID_INTENTS,
    calculateWeightedScore,
    formatSourcesForPrompt,
} from './types';

const mistral = new Mistral({
    apiKey: process.env.MISTRAL_API_KEY || '',
});

/**
 * Run the Auditor Judge to verify the Primary Judge's citations against source text.
 */
export async function runAuditorJudge(
    title: string,
    content: string,
    factCheckContext: FactCheckContext,
    primaryVerdict: JudgeVerdict
): Promise<JudgeVerdict> {
    logger.info(`🔎 Auditor Judge (Anti-Hallucination) starting for: "${title.slice(0, 60)}..."`, {
        module: 'AuditorJudge'
    });

    const truncatedContent = content.length > 4000
        ? content.slice(0, 4000) + '\n[... contenu tronqué ...]'
        : content;

    const sourcesBlock = formatSourcesForPrompt(factCheckContext.sources);

    const systemPrompt = `Tu es l'Auditeur Garde-Fou d'Epion — un vérificateur anti-hallucination rigoureux.

## TA MISSION UNIQUE
Vérifier que chaque citation (champ "quote") utilisée par le Juge Primaire existe réellement dans :
1. Le texte de l'article analysé, OU
2. Le texte brut des sources fournies

## RÈGLES STRICTES
- Une citation est VALIDE si elle apparaît mot-pour-mot (ou quasi mot-pour-mot) dans l'un des textes fournis
- Une citation est INVENTÉE si elle n'apparaît nulle part dans les textes fournis
- Si une citation est inventée → PÉNALISE le score du pilier de -15 points
- Si AUCUNE citation n'est inventée → CONFIRME les scores du Juge Primaire
- Tu peux aussi contester le Content Intent si tu es en désaccord (REPORT, INVESTIGATION, OPINION, PROMO, ACADEMIC)

## IMPORTANT
- Ne juge PAS la qualité de l'article — le Juge Primaire l'a déjà fait
- Tu vérifies UNIQUEMENT l'honnêteté du Juge Primaire
- Corrige les quotes inventées avec de vraies citations du texte si possible

Tu réponds UNIQUEMENT en JSON valide.`;

    const userPrompt = `
## ARTICLE ORIGINAL
**Titre :** "${title}"
**Contenu :**
"""
${truncatedContent}
"""

## SOURCES BRUTES (texte fourni par Tavily)
${sourcesBlock}

## VERDICT DU JUGE PRIMAIRE À AUDITER
${JSON.stringify(primaryVerdict, null, 2)}

## FORMAT DE RÉPONSE (JSON strict)
{
  "contentIntent": "${primaryVerdict.contentIntent}",
  "pillarScores": {
    "transparency": { "score": 75, "quote": "citation corrigée ou confirmée...", "reasoning": "Citation vérifiée/inventée car..." },
    "editorial": { "score": 70, "quote": "...", "reasoning": "..." },
    "semantic": { "score": 80, "quote": "...", "reasoning": "..." },
    "logic": { "score": 65, "quote": "...", "reasoning": "..." }
  },
  "auditLog": [
    { "pillar": "semantic", "originalQuote": "...", "status": "VALID" | "FABRICATED", "correction": "..." }
  ]
}

Réponds UNIQUEMENT le JSON.`;

    try {
        const response = await mistral.chat.complete({
            model: 'mistral-small-latest',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.2,
            responseFormat: { type: 'json_object' },
            safePrompt: true,
        });

        const rawMessage = response.choices?.[0]?.message?.content;
        // Mistral content can be string | ContentChunk[] | null | undefined
        let rawContent: string;
        if (typeof rawMessage === 'string') {
            rawContent = rawMessage;
        } else if (Array.isArray(rawMessage)) {
            rawContent = rawMessage.map((chunk: any) => chunk.text || '').join('');
        } else {
            rawContent = '{}';
        }
        const parsed = JSON.parse(rawContent);

        // Validate Content Intent
        const contentIntent: ContentIntent = VALID_INTENTS.includes(parsed.contentIntent)
            ? parsed.contentIntent
            : primaryVerdict.contentIntent; // Fallback to primary's choice

        // Validate pillar scores
        const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v || 50)));
        const safePillar = (p: any, fallback: PillarScore): PillarScore => ({
            score: clamp(p?.score ?? fallback.score),
            quote: typeof p?.quote === 'string' ? p.quote : fallback.quote,
            reasoning: typeof p?.reasoning === 'string' ? p.reasoning : fallback.reasoning,
            disarmCodes: fallback.disarmCodes || [], // Preserve primary's DISARM codes
        });

        const pillarScores = {
            transparency: safePillar(parsed.pillarScores?.transparency, primaryVerdict.pillarScores.transparency),
            editorial: safePillar(parsed.pillarScores?.editorial, primaryVerdict.pillarScores.editorial),
            semantic: safePillar(parsed.pillarScores?.semantic, primaryVerdict.pillarScores.semantic),
            logic: safePillar(parsed.pillarScores?.logic, primaryVerdict.pillarScores.logic),
        };

        const globalScore = calculateWeightedScore(pillarScores, contentIntent);

        // Log audit results
        const auditLog = parsed.auditLog || [];
        const fabricatedCount = auditLog.filter((a: any) => a.status === 'FABRICATED').length;

        logger.info(`✅ Auditor Judge complete: Intent=${contentIntent}, Score=${globalScore} (Primary was: ${primaryVerdict.globalScore}), Fabricated=${fabricatedCount}`, {
            module: 'AuditorJudge',
            auditLog,
        });

        return {
            contentIntent,
            pillarScores,
            globalScore,
        };

    } catch (error: any) {
        logger.error(`❌ Auditor Judge failed, falling back to Primary verdict`, {
            module: 'AuditorJudge',
            error: error.message,
        });

        // If Mistral fails, return the primary verdict as-is (degraded mode)
        return primaryVerdict;
    }
}

/**
 * Phase 2C — The Auditor Judge (Mistral mistral-small-latest)
 * 
 * Receives the Primary Judge's verdict + FactCheckContext.
 * Verifies reasoning, can contest Content Intent, and corrects unjustified scores.
 */
import { Mistral } from '@mistralai/mistralai';
import { logger } from '../logger';
import {
    FactCheckContext,
    JudgeVerdict,
    ContentIntent,
    VALID_INTENTS,
    calculateWeightedScore,
} from './types';

const mistral = new Mistral({
    apiKey: process.env.MISTRAL_API_KEY || '',
});

/**
 * Run the Auditor Judge to verify and potentially correct the Primary Judge's verdict.
 */
export async function runAuditorJudge(
    title: string,
    content: string,
    factCheckContext: FactCheckContext,
    primaryVerdict: JudgeVerdict
): Promise<JudgeVerdict> {
    logger.info(`🔎 Auditor Judge starting for: "${title.slice(0, 60)}..."`, { module: 'AuditorJudge' });

    const truncatedContent = content.length > 4000
        ? content.slice(0, 4000) + '\n[... contenu tronqué ...]'
        : content;

    const prompt = `
Tu es un auditeur éditorial indépendant. Un premier juge (GPT) a évalué l'article ci-dessous. Tu dois vérifier son travail.

## ARTICLE
**Titre :** "${title}"
**Contenu :**
"""
${truncatedContent}
"""

## DOSSIER D'ENQUÊTE (vérification web par Perplexity)
${JSON.stringify(factCheckContext, null, 2)}

## VERDICT DU JUGE PRIMAIRE (GPT)
${JSON.stringify(primaryVerdict, null, 2)}

## TES MISSIONS D'AUDIT

1. **Vérifier le Content Intent** : Le juge primaire a classé cet article comme "${primaryVerdict.contentIntent}". Si tu penses que c'est incorrect, corrige-le avec la bonne catégorie (REPORT, INVESTIGATION, OPINION, PROMO, ACADEMIC).

2. **Vérifier chaque pilier** : Pour chaque score, vérifie que :
   - Le "reasoning" est prouvé par le dossier d'enquête
   - Le score n'est pas extrême (< 20 ou > 90) sans justification solide
   - S'il y a une erreur, CORRIGE le score avec ta propre évaluation

3. **Produire ton propre verdict** : Remplis le même format JSON avec tes scores corrigés (ou confirmés).

## FORMAT DE RÉPONSE (JSON strict)
{
  "contentIntent": "REPORT" | "INVESTIGATION" | "OPINION" | "PROMO" | "ACADEMIC",
  "pillarScores": {
    "transparency": { "score": 0-100, "quote": "...", "reasoning": "..." },
    "editorial": { "score": 0-100, "quote": "...", "reasoning": "..." },
    "semantic": { "score": 0-100, "quote": "...", "reasoning": "..." },
    "logic": { "score": 0-100, "quote": "...", "reasoning": "..." }
  }
}

Réponds UNIQUEMENT le JSON.
`;

    try {
        const response = await mistral.chat.complete({
            model: 'mistral-small-latest',
            messages: [
                { role: 'system', content: 'Tu es un auditeur éditorial indépendant. Tu réponds UNIQUEMENT en JSON valide.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            responseFormat: { type: 'json_object' },
        });

        const rawMessage = response.choices?.[0]?.message?.content;
        // Mistral content can be string | ContentChunk[] | null | undefined
        let rawContent: string;
        if (typeof rawMessage === 'string') {
            rawContent = rawMessage;
        } else if (Array.isArray(rawMessage)) {
            // ContentChunk array — extract text from each chunk
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
        const safePillar = (p: any, fallback: any) => ({
            score: clamp(p?.score ?? fallback?.score),
            quote: p?.quote || fallback?.quote || '',
            reasoning: p?.reasoning || fallback?.reasoning || '',
        });

        const pillarScores = {
            transparency: safePillar(parsed.pillarScores?.transparency, primaryVerdict.pillarScores.transparency),
            editorial: safePillar(parsed.pillarScores?.editorial, primaryVerdict.pillarScores.editorial),
            semantic: safePillar(parsed.pillarScores?.semantic, primaryVerdict.pillarScores.semantic),
            logic: safePillar(parsed.pillarScores?.logic, primaryVerdict.pillarScores.logic),
        };

        const globalScore = calculateWeightedScore(pillarScores, contentIntent);

        logger.info(`✅ Auditor Judge verdict: Intent=${contentIntent}, Score=${globalScore} (Primary was: ${primaryVerdict.globalScore})`, { module: 'AuditorJudge' });

        return {
            contentIntent,
            pillarScores,
            globalScore,
        };

    } catch (error: any) {
        logger.error(`❌ Auditor Judge failed, falling back to Primary verdict`, { module: 'AuditorJudge', error: error.message });

        // If Mistral fails, return the primary verdict as-is (degraded mode)
        return primaryVerdict;
    }
}

/**
 * Phase 2B — The Primary Judge (OpenAI gpt-4o-mini)
 * 
 * Categorizes Content Intent and scores the article on 4 pillars.
 * Receives the article + FactCheckContext from the Investigator.
 */
import OpenAI from 'openai';
import { logger } from '../logger';
import {
    FactCheckContext,
    JudgeVerdict,
    ContentIntent,
    VALID_INTENTS,
    calculateWeightedScore,
} from './types';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Run the Primary Judge on an article with its fact-check context.
 */
export async function runPrimaryJudge(
    title: string,
    content: string,
    factCheckContext: FactCheckContext
): Promise<JudgeVerdict> {
    logger.info(`⚖️ Primary Judge starting for: "${title.slice(0, 60)}..."`, { module: 'PrimaryJudge' });

    const truncatedContent = content.length > 4000
        ? content.slice(0, 4000) + '\n[... contenu tronqué ...]'
        : content;

    const prompt = `
Tu es un juge éditorial expert et impartial. Tu dois analyser l'article ci-dessous et le noter objectivement.

## ARTICLE À ANALYSER
**Titre :** "${title}"
**Contenu :**
"""
${truncatedContent}
"""

## DOSSIER D'ENQUÊTE (vérification web préalable)
${JSON.stringify(factCheckContext, null, 2)}

## TES MISSIONS

### Mission 1 : Déterminer l'intention du texte (Content Intent)
Classe l'article parmi ces catégories UNIQUEMENT selon son contenu, PAS selon le site :
- REPORT : Article factuel, actualité, dépêche
- INVESTIGATION : Enquête journalistique, révélation
- OPINION : Tribune, chronique, éditorial
- PROMO : Contenu promotionnel, communiqué de presse
- ACADEMIC : Étude scientifique, publication de recherche

### Mission 2 : Noter chaque pilier de 0 à 100
Pour chaque pilier, donne :
- Un **score** (0-100) sur un gradient continu, proportionnel à l'effort constaté
- Un **quote** : l'extrait exact de l'article qui illustre le mieux ta notation
- Un **reasoning** : ta justification en 1-2 phrases, en citant le dossier d'enquête si pertinent

**Les 4 piliers :**
1. **transparency** : Clarté de l'identité de l'auteur, datation, attribution des sources
2. **editorial** : Densité de preuves, liens, citations vérifiables
3. **semantic** : Ratio Fait/Émotion. Score élevé = ton neutre ou émotion légitimée par des faits. Score bas = manipulation émotionnelle pure
4. **logic** : Intégrité logique. Score élevé = chiffres contextualisés, Steel-manning. Score bas = Cherry-picking, homme de paille, chiffres nus trompeurs

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
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'Tu es un juge éditorial expert. Tu réponds UNIQUEMENT en JSON valide.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' },
        });

        const rawContent = response.choices[0].message.content || '{}';
        const parsed = JSON.parse(rawContent);

        // Validate Content Intent
        const contentIntent: ContentIntent = VALID_INTENTS.includes(parsed.contentIntent)
            ? parsed.contentIntent
            : 'REPORT'; // Fallback

        // Validate pillar scores (ensure 0-100 range)
        const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v || 50)));
        const safePillar = (p: any) => ({
            score: clamp(p?.score),
            quote: p?.quote || '',
            reasoning: p?.reasoning || '',
        });

        const pillarScores = {
            transparency: safePillar(parsed.pillarScores?.transparency),
            editorial: safePillar(parsed.pillarScores?.editorial),
            semantic: safePillar(parsed.pillarScores?.semantic),
            logic: safePillar(parsed.pillarScores?.logic),
        };

        const globalScore = calculateWeightedScore(pillarScores, contentIntent);

        logger.info(`✅ Primary Judge verdict: Intent=${contentIntent}, Score=${globalScore}`, { module: 'PrimaryJudge' });

        return {
            contentIntent,
            pillarScores,
            globalScore,
        };

    } catch (error: any) {
        logger.error(`❌ Primary Judge failed`, { module: 'PrimaryJudge', error: error.message });

        // Return neutral fallback
        const neutralPillar = { score: 50, quote: '', reasoning: 'Analyse échouée — score neutre par défaut.' };
        return {
            contentIntent: 'REPORT',
            pillarScores: {
                transparency: { ...neutralPillar },
                editorial: { ...neutralPillar },
                semantic: { ...neutralPillar },
                logic: { ...neutralPillar },
            },
            globalScore: 50,
        };
    }
}

/**
 * Phase 2B — The Primary Judge (OpenAI gpt-4o-mini)
 * 
 * Dual mission:
 * 1. RÉDACTION : Rédige le titre, résumé et contenu Markdown de l'article
 * 2. ANALYSE  : Classifie Content Intent, score DISARM, citations exactes
 * 
 * Both tasks are done in a single LLM call to minimize cost and latency.
 * The "topic" (user prompt) drives the article generation when provided,
 * otherwise the judge analyzes the existing article content.
 * 
 * v3.0 — Merged article generation + DISARM analysis into single call.
 */
import OpenAI from 'openai';
import { logger } from '../logger';
import {
    FactCheckContext,
    JudgeVerdict,
    GeneratedContent,
    ContentIntent,
    PillarScore,
    DisarmCode,
    VALID_INTENTS,
    DISARM_TECHNIQUES,
    calculateWeightedScore,
    formatSourcesForPrompt,
} from './types';
import {
    buildSourceRefs,
    normalizeStructuredArticle,
    structuredArticleToMarkdown,
} from '../structured-article';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// ─── DISARM Reference ────────────────────────────────────────────────────────
const DISARM_REFERENCE = Object.entries(DISARM_TECHNIQUES)
    .map(([code, desc]) => `- ${code}: ${desc}`)
    .join('\n');

// ─── Mode: Generate + Analyze (new article from topic) ──────────────────────
async function runGenerateAndAnalyze(
    topic: string,
    factCheckContext: FactCheckContext,
    options: { language?: string; style?: string }
): Promise<JudgeVerdict> {
    const sourceRefs = buildSourceRefs(factCheckContext.sources);
    const sourcesWithIds = factCheckContext.sources.map((source, index) => ({
        ...source,
        sourceId: sourceRefs[index]?.id,
    }));
    const sourcesBlock = formatSourcesForPrompt(sourcesWithIds);

    let styleInstruction = '';
    switch (options.style) {
        case 'neutral':
            styleInstruction = 'Style reporter factuel, pyramide inversée.';
            break;
        case 'explainer':
            styleInstruction = 'Style pédagogique et didactique avec analogies. Structure : Comprendre, Enjeux, Perspectives.';
            break;
        case 'short':
            styleInstruction = 'Format brève/flash (max 300 mots). Concis, listes à puces.';
            break;
        case 'indepth':
            styleInstruction = 'Format long-form investigation (min 1000 mots). Historique, nuances, multiples points de vue.';
            break;
        default:
            styleInstruction = 'Style informatif standard.';
    }

    const langLabel = options.language === 'en' ? 'ANGLAIS' : 'FRANÇAIS';

    const systemPrompt = `Tu es le Juge-Rédacteur d'Epion — un analyste éditorial expert, rigoureusement impartial, et un rédacteur de premier plan.

Tu as DEUX MISSIONS dans cette réponse unique :

## MISSION 1 : RÉDIGER L'ARTICLE
À partir du sujet fourni, rédige le titre, le résumé et le texte complet de l'article en te basant UNIQUEMENT sur les sources Tavily vérifiées qui te sont fournies.
- N'invente AUCUNE information (zéro hallucination). Si les sources n'en parlent pas, n'en parle pas.
- Langue : ${langLabel}
- ${styleInstruction}
- Le contenu ("content") DOIT être en Markdown valide avec titres ##, ###, citations et liens
- Cite tes sources inline : "Selon Reuters [1]..." avec le numéro de la source
- Produis aussi "structuredContent" au format Epion compact.
- N'utilise que ces 5 types de sections visibles : summary, facts, context, analysis, limits.
- Relie les affirmations importantes aux sources via les IDs fournis dans le dossier (ex: "src_abc123"), pas seulement via l'ordre [1], [2].
- Génère un titre percutant, un résumé accrocheur (2 phrases), et des tags pertinents
- Génère un concept clé très court (1 à 3 mots, idéalement le nom propre, le lieu géographique ou l'entité principale) en ANGLAIS pour trouver l'article Wikipedia le plus représentatif du sujet (ex: 'Emmanuel Macron', 'Strait of Hormuz', 'Rafale'). Retourne ce concept dans la clé "wikipedia_search_query".

## MISSION 2 : ANALYSER L'ARTICLE QUE TU VIENS DE RÉDIGER (FRAMEWORK DISARM)
${DISARM_REFERENCE}

Après avoir rédigé l'article, analyse-le TOI-MÊME. Note chaque pilier en toute honnêteté :
- Un score de 50 = neutre. < 30 ou > 85 DOIT être justifié de manière exceptionnelle
- Le champ "quote" = citation EXACTE (mot-pour-mot) tirée de l'article que tu as rédigé
- Si tu détectes une technique DISARM dans ton propre texte, indique-la

Tu réponds UNIQUEMENT en JSON valide.`;

    const userPrompt = `
## SUJET DE L'ARTICLE
"${topic}"

## DOSSIER DE SOURCES VÉRIFIÉES (${factCheckContext.sources.length} sources Tavily)
${sourcesBlock}

## FORMAT DE RÉPONSE JSON STRICT
{
  "article": {
    "title": "Titre percutant en ${langLabel}",
    "summary": "Résumé accrocheur en 2 phrases",
    "content": "Le corps de l'article en Markdown, avec ## titres, citations [1], et liens",
    "structuredContent": {
      "version": 1,
      "format": "epion-article-v1",
      "lead": {
        "summary": "Résumé clair, court, sans exagération",
        "keyTakeaways": ["3 à 5 points maximum"]
      },
      "sections": [
        {
          "id": "facts",
          "type": "facts",
          "title": "Ce qui est établi",
          "body": "Texte court et lisible",
          "items": [
            {
              "id": "fact_1",
              "text": "Un fait précis",
              "claimIds": ["claim_1"],
              "sourceIds": ["${sourceRefs[0]?.id || 'src_example'}"]
            }
          ]
        }
      ],
      "claims": [
        {
          "id": "claim_1",
          "text": "Affirmation vérifiable, autonome et précise",
          "sectionId": "facts",
          "sourceIds": ["${sourceRefs[0]?.id || 'src_example'}"],
          "sourceUrls": ["${sourceRefs[0]?.url || 'https://example.com'}"],
          "support": "strong"
        }
      ],
      "sources": ${JSON.stringify(sourceRefs.slice(0, 50))}
    },
    "tags": ["tag1", "tag2", "tag3"],
    "imagePrompt": "Photorealistic DALL-E prompt in English describing the cover image, or null",
    "wikipedia_search_query": "Concept in English (1-3 words) to fetch a representative Wikipedia image, or null"
  },
  "analysis": {
    "contentIntent": "REPORT",
    "pillarScores": {
      "transparency": { "score": 75, "quote": "citation exacte de ton article...", "reasoning": "...", "disarmCodes": [] },
      "editorial": { "score": 70, "quote": "...", "reasoning": "...", "disarmCodes": [] },
      "semantic": { "score": 80, "quote": "...", "reasoning": "...", "disarmCodes": [] },
      "logic": { "score": 65, "quote": "...", "reasoning": "...", "disarmCodes": [] }
    }
  }
}

Réponds UNIQUEMENT le JSON.`;

    return executeJudgeCall(systemPrompt, userPrompt, topic, true);
}

// ─── Mode: Analyze only (existing article) ──────────────────────────────────
async function runAnalyzeOnly(
    title: string,
    content: string,
    factCheckContext: FactCheckContext
): Promise<JudgeVerdict> {
    const truncatedContent = content.length > 4000
        ? content.slice(0, 4000) + '\n[... contenu tronqué ...]'
        : content;

    const sourcesBlock = formatSourcesForPrompt(factCheckContext.sources);

    const systemPrompt = `Tu es le Juge Primaire d'Epion — un analyste éditorial expert et rigoureusement impartial.

## FRAMEWORK DISARM (Techniques de manipulation à détecter)
${DISARM_REFERENCE}

## RÈGLES DE NOTATION
- Chaque score est sur un gradient continu 0-100, proportionnel à l'effort constaté
- Un score de 50 = neutre/moyen. Un score < 30 ou > 85 DOIT être justifié de manière exceptionnelle
- Chaque pénalité DOIT être justifiée par une citation exacte tirée de l'article OU des sources
- Si tu détectes une technique DISARM, tu DOIS l'indiquer avec son code (ex: T0081)

## IMPORTANT — ANTI-HALLUCINATION
- Le champ "quote" DOIT être une citation EXACTE copiée mot-pour-mot de l'article analysé
- Ne reformule JAMAIS, ne paraphrase JAMAIS
- Si tu ne trouves pas de citation pertinente, écris "[Aucune citation spécifique]"

Tu réponds UNIQUEMENT en JSON valide.`;

    const userPrompt = `
## ARTICLE À ANALYSER
**Titre :** "${title}"
**Contenu :**
"""
${truncatedContent}
"""

## DOSSIER DE SOURCES VÉRIFIÉES (${factCheckContext.sources.length} sources Tavily)
${sourcesBlock}

## TES MISSIONS

### Mission 1 : Déterminer l'intention du texte (Content Intent)
- REPORT : Article factuel, actualité, dépêche
- INVESTIGATION : Enquête journalistique, révélation
- OPINION : Tribune, chronique, éditorial
- PROMO : Contenu promotionnel, communiqué de presse
- ACADEMIC : Étude scientifique, publication de recherche

### Mission 2 : Noter chaque pilier de 0 à 100
1. **transparency** : Clarté de l'identité de l'auteur, datation, attribution des sources
2. **editorial** : Densité de preuves, liens, citations vérifiables
3. **semantic** : Ratio Fait/Émotion (T0081, T0082)
4. **logic** : Intégrité logique (T0039, T0042, T0046)

## FORMAT DE RÉPONSE (JSON strict)
{
  "contentIntent": "REPORT",
  "pillarScores": {
    "transparency": { "score": 75, "quote": "citation exacte...", "reasoning": "...", "disarmCodes": [] },
    "editorial": { "score": 70, "quote": "...", "reasoning": "...", "disarmCodes": [] },
    "semantic": { "score": 80, "quote": "...", "reasoning": "...", "disarmCodes": [] },
    "logic": { "score": 65, "quote": "...", "reasoning": "...", "disarmCodes": [] }
  }
}

Réponds UNIQUEMENT le JSON.`;

    return executeJudgeCall(systemPrompt, userPrompt, title, false);
}

// ─── Shared execution logic ─────────────────────────────────────────────────
async function executeJudgeCall(
    systemPrompt: string,
    userPrompt: string,
    label: string,
    isGenerateMode: boolean
): Promise<JudgeVerdict> {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.3,
            max_tokens: isGenerateMode ? 6144 : 2048,
            response_format: { type: 'json_object' },
        });

        const rawContent = response.choices[0].message.content || '{}';
        const parsed = JSON.parse(rawContent);

        // Extract analysis (handle both flat and nested formats)
        const analysisBlock = parsed.analysis || parsed;

        // Validate Content Intent
        const contentIntent: ContentIntent = VALID_INTENTS.includes(analysisBlock.contentIntent)
            ? analysisBlock.contentIntent
            : 'REPORT';

        // Validate pillar scores
        const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v || 50)));
        const validDisarmCodes = Object.keys(DISARM_TECHNIQUES);

        const safePillar = (p: any): PillarScore => ({
            score: clamp(p?.score),
            quote: typeof p?.quote === 'string' ? p.quote : '',
            reasoning: typeof p?.reasoning === 'string' ? p.reasoning : '',
            disarmCodes: Array.isArray(p?.disarmCodes)
                ? p.disarmCodes.filter((c: string) => validDisarmCodes.includes(c))
                : [],
        });

        const pillarScores = {
            transparency: safePillar(analysisBlock.pillarScores?.transparency),
            editorial: safePillar(analysisBlock.pillarScores?.editorial),
            semantic: safePillar(analysisBlock.pillarScores?.semantic),
            logic: safePillar(analysisBlock.pillarScores?.logic),
        };

        const globalScore = calculateWeightedScore(pillarScores, contentIntent);

        // Extract generated content if in generate mode
        let generatedContent: GeneratedContent | undefined;
        if (isGenerateMode && parsed.article) {
            const structuredContent = normalizeStructuredArticle(parsed.article.structuredContent);
            const markdownContent = typeof parsed.article.content === 'string' && parsed.article.content.trim()
                ? parsed.article.content
                : structuredContent
                    ? structuredArticleToMarkdown(structuredContent)
                    : '';

            generatedContent = {
                title: typeof parsed.article.title === 'string' ? parsed.article.title : label,
                summary: typeof parsed.article.summary === 'string' ? parsed.article.summary : '',
                content: markdownContent,
                structuredContent,
                tags: Array.isArray(parsed.article.tags) ? parsed.article.tags : [],
                imagePrompt: typeof parsed.article.imagePrompt === 'string' ? parsed.article.imagePrompt : null,
                wikipedia_search_query: typeof parsed.article.wikipedia_search_query === 'string' ? parsed.article.wikipedia_search_query : null,
            };

            logger.info(`📝 Article generated: "${generatedContent.title.slice(0, 60)}..." (${generatedContent.content.length} chars)`, {
                module: 'PrimaryJudge',
            });
        }

        // Log
        const allCodes = [
            ...pillarScores.transparency.disarmCodes || [],
            ...pillarScores.editorial.disarmCodes || [],
            ...pillarScores.semantic.disarmCodes || [],
            ...pillarScores.logic.disarmCodes || [],
        ];

        logger.info(`✅ Primary Judge verdict: Intent=${contentIntent}, Score=${globalScore}, DISARM=[${allCodes.join(',')}]`, {
            module: 'PrimaryJudge',
        });

        return {
            contentIntent,
            pillarScores,
            globalScore,
            generatedContent,
        };

    } catch (error: any) {
        logger.error(`❌ Primary Judge failed`, { module: 'PrimaryJudge', error: error.message });

        const neutralPillar: PillarScore = {
            score: 50,
            quote: '',
            reasoning: 'Analyse échouée — score neutre par défaut.',
            disarmCodes: [],
        };
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

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Run the Primary Judge — Analyze an existing article (DISARM only).
 */
export async function runPrimaryJudge(
    title: string,
    content: string,
    factCheckContext: FactCheckContext
): Promise<JudgeVerdict> {
    logger.info(`⚖️ Primary Judge (DISARM) starting for: "${title.slice(0, 60)}..."`, {
        module: 'PrimaryJudge',
    });
    return runAnalyzeOnly(title, content, factCheckContext);
}

/**
 * Run the Primary Judge — Generate article content AND analyze it (dual mode).
 * Used when creating new articles from a user topic prompt.
 */
export async function runPrimaryJudgeWithGeneration(
    topic: string,
    factCheckContext: FactCheckContext,
    options: { language?: string; style?: string } = {}
): Promise<JudgeVerdict> {
    logger.info(`⚖️📝 Primary Judge (Generate + DISARM) starting for topic: "${topic.slice(0, 60)}..."`, {
        module: 'PrimaryJudge',
    });
    return runGenerateAndAnalyze(topic, factCheckContext, options);
}

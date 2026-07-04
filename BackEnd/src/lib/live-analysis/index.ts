/**
 * Live Analysis Pipeline — Orchestrator
 * 
 * Two modes:
 * 1. ANALYZE mode: Smart Router → Tavily → GPT-4o-mini (DISARM) → Mistral (Audit)
 * 2. GENERATE mode: Smart Router → Tavily → GPT-4o-mini (Generate + DISARM) → Mistral (Audit)
 * 
 * v3.0 — Article generation merged into the Primary Judge call.
 */
import { logger } from '../logger.js';
import { investigateArticle } from './fact-investigator.js';
import { runPrimaryJudge, runPrimaryJudgeWithGeneration } from './primary-judge.js';
import { runAuditorJudge } from './auditor-judge.js';
import { LiveAnalysisResult, PillarScore, ContentIntent, calculateWeightedScore } from './types.js';

/**
 * Run the full live analysis pipeline on an EXISTING article.
 */
export async function runLiveAnalysis(
    title: string,
    content: string
): Promise<LiveAnalysisResult> {
    const startTime = Date.now();
    logger.info(`🚀 Live Analysis Pipeline v3.0 (ANALYZE) starting for: "${title.slice(0, 60)}..."`, {
        module: 'LiveAnalysis'
    });

    // STEP 2A: Smart Router + Tavily Investigation
    const factCheckContext = await investigateArticle(title, content);
    logger.info(`📋 Investigation complete: ${factCheckContext.sources.length} sources (${Date.now() - startTime}ms)`, {
        module: 'LiveAnalysis',
        route: factCheckContext.routingDecision.route,
    });

    // STEP 2B: Primary Judge (analyze only)
    const primaryVerdict = await runPrimaryJudge(title, content, factCheckContext);
    logger.info(`⚖️ Primary Judge complete (${Date.now() - startTime}ms)`, { module: 'LiveAnalysis' });

    // STEP 2C: Auditor Judge
    const auditorVerdict = await runAuditorJudge(title, content, factCheckContext, primaryVerdict);
    logger.info(`🔎 Auditor Judge complete (${Date.now() - startTime}ms)`, { module: 'LiveAnalysis' });

    // SYNTHESIS
    return synthesize(primaryVerdict, auditorVerdict, factCheckContext, startTime);
}

/**
 * Run the full pipeline in GENERATE mode.
 * The Primary Judge generates the article Markdown AND DISARM-scores it in one call.
 * Returns everything needed to create the article in DB.
 */
export async function runLiveAnalysisWithGeneration(
    topic: string,
    options: { language?: string; style?: string } = {}
): Promise<LiveAnalysisResult> {
    const startTime = Date.now();
    logger.info(`🚀 Live Analysis Pipeline v3.0 (GENERATE) starting for topic: "${topic.slice(0, 60)}..."`, {
        module: 'LiveAnalysis'
    });

    // STEP 2A: Smart Router + Tavily Investigation (uses topic as title/content)
    const factCheckContext = await investigateArticle(topic, topic, undefined, { mode: 'generation' });
    logger.info(`📋 Investigation complete: ${factCheckContext.sources.length} sources (${Date.now() - startTime}ms)`, {
        module: 'LiveAnalysis',
        route: factCheckContext.routingDecision.route,
    });

    // STEP 2B: Primary Judge — Generate + Analyze (dual mode)
    const primaryVerdict = await runPrimaryJudgeWithGeneration(topic, factCheckContext, options);
    logger.info(`⚖️📝 Primary Judge (Generate + DISARM) complete (${Date.now() - startTime}ms)`, { module: 'LiveAnalysis' });

    // Use the generated article content for the auditor (if available)
    const articleTitle = primaryVerdict.generatedContent?.title || topic;
    const articleContent = primaryVerdict.generatedContent?.content || topic;

    // STEP 2C: Auditor Judge — Audit the generated article
    const auditorVerdict = await runAuditorJudge(articleTitle, articleContent, factCheckContext, primaryVerdict);
    logger.info(`🔎 Auditor Judge complete (${Date.now() - startTime}ms)`, { module: 'LiveAnalysis' });

    // SYNTHESIS
    const result = synthesize(primaryVerdict, auditorVerdict, factCheckContext, startTime);

    // Attach generated content to the result
    result.generatedContent = primaryVerdict.generatedContent;
    result.sources = factCheckContext.sources;

    return result;
}

// ─── Shared synthesis logic ─────────────────────────────────────────────────

function synthesize(
    primaryVerdict: any,
    auditorVerdict: any,
    factCheckContext: any,
    startTime: number
): LiveAnalysisResult {
    const finalIntent = auditorVerdict.contentIntent;
    const finalPillarScores = medianPillars(primaryVerdict.pillarScores, auditorVerdict.pillarScores);
    const globalScore = calculateWeightedScore(finalPillarScores, finalIntent);

    const totalTime = Date.now() - startTime;
    logger.info(`✅ Live Analysis v3.0 complete in ${totalTime}ms. Intent=${finalIntent}, Score=${globalScore}`, {
        module: 'LiveAnalysis',
        primary: primaryVerdict.globalScore,
        auditor: auditorVerdict.globalScore,
        final: globalScore,
        sourceCount: factCheckContext.sources.length,
        route: factCheckContext.routingDecision.route,
    });

    return {
        contentIntent: finalIntent,
        pillarScores: finalPillarScores,
        globalScore,
        judges: {
            primary: primaryVerdict,
            auditor: auditorVerdict,
        },
        sources: factCheckContext.sources,
    };
}

// ─── Median calculation ─────────────────────────────────────────────────────

function medianPillars(
    a: { transparency: PillarScore; editorial: PillarScore; semantic: PillarScore; logic: PillarScore },
    b: { transparency: PillarScore; editorial: PillarScore; semantic: PillarScore; logic: PillarScore }
): { transparency: PillarScore; editorial: PillarScore; semantic: PillarScore; logic: PillarScore } {
    return {
        transparency: medianPillar(a.transparency, b.transparency),
        editorial: medianPillar(a.editorial, b.editorial),
        semantic: medianPillar(a.semantic, b.semantic),
        logic: medianPillar(a.logic, b.logic),
    };
}

function medianPillar(a: PillarScore, b: PillarScore): PillarScore {
    const gap = Math.abs(a.score - b.score);

    let score: number;
    if (gap > 25) {
        const moderateScore = Math.abs(a.score - 50) < Math.abs(b.score - 50) ? a.score : b.score;
        const extremeScore = moderateScore === a.score ? b.score : a.score;
        score = Math.round(moderateScore * 0.6 + extremeScore * 0.4);
    } else {
        score = Math.round((a.score + b.score) / 2);
    }

    return {
        score,
        quote: b.quote || a.quote,
        reasoning: b.reasoning || a.reasoning,
        disarmCodes: a.disarmCodes || [],
    };
}

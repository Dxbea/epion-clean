/**
 * Live Analysis Pipeline — Orchestrator
 * 
 * Sequential "Relay Race": Perplexity → GPT-4o-mini → Mistral
 * 
 * Flow:
 * 1. Perplexity investigates claims and gathers web context (no scoring)
 * 2. GPT-4o-mini classifies Content Intent and scores 4 pillars
 * 3. Mistral audits GPT's work, can contest Intent, and corrects scores
 * 4. Final score = median of both judges (robust against outliers)
 */
import { logger } from '../logger';
import { investigateArticle } from './fact-investigator';
import { runPrimaryJudge } from './primary-judge';
import { runAuditorJudge } from './auditor-judge';
import { LiveAnalysisResult, PillarScore, ContentIntent, calculateWeightedScore } from './types';

/**
 * Run the full live analysis pipeline on an article.
 * Returns the final ScoreLiveBrut and all pillar details.
 */
export async function runLiveAnalysis(
    title: string,
    content: string
): Promise<LiveAnalysisResult> {
    const startTime = Date.now();
    logger.info(`🚀 Live Analysis Pipeline starting for: "${title.slice(0, 60)}..."`, { module: 'LiveAnalysis' });

    // === STEP 2A: Perplexity Investigation ===
    const factCheckContext = await investigateArticle(title, content);
    logger.info(`📋 Investigation complete (${Date.now() - startTime}ms)`, { module: 'LiveAnalysis' });

    // === STEP 2B: Primary Judge (GPT-4o-mini) ===
    const primaryVerdict = await runPrimaryJudge(title, content, factCheckContext);
    logger.info(`⚖️ Primary Judge complete (${Date.now() - startTime}ms)`, { module: 'LiveAnalysis' });

    // === STEP 2C: Auditor Judge (Mistral) ===
    const auditorVerdict = await runAuditorJudge(title, content, factCheckContext, primaryVerdict);
    logger.info(`🔎 Auditor Judge complete (${Date.now() - startTime}ms)`, { module: 'LiveAnalysis' });

    // === SYNTHESIS: Median of both judges ===
    // Use the auditor's Content Intent (they have the final word, including right to contest)
    const finalIntent = auditorVerdict.contentIntent;

    // Median per pillar (robust against one judge being an outlier)
    const finalPillarScores = medianPillars(primaryVerdict.pillarScores, auditorVerdict.pillarScores);

    // Recalculate global score with the final intent weights
    const globalScore = calculateWeightedScore(finalPillarScores, finalIntent);

    const totalTime = Date.now() - startTime;
    logger.info(`✅ Live Analysis complete in ${totalTime}ms. Intent=${finalIntent}, Score=${globalScore}`, {
        module: 'LiveAnalysis',
        primary: primaryVerdict.globalScore,
        auditor: auditorVerdict.globalScore,
        final: globalScore
    });

    return {
        contentIntent: finalIntent,
        pillarScores: finalPillarScores,
        globalScore,
        judges: {
            primary: primaryVerdict,
            auditor: auditorVerdict,
        },
    };
}

/**
 * Calculate the median pillar scores from two judges.
 * With 2 judges, the median is the average.
 * If one score is significantly more extreme than the other (>25 point gap),
 * we pull towards the more moderate score.
 */
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
        // Large disagreement: pull towards the more moderate score (closer to 50)
        const moderateScore = Math.abs(a.score - 50) < Math.abs(b.score - 50) ? a.score : b.score;
        const extremeScore = moderateScore === a.score ? b.score : a.score;
        // Weight: 60% moderate, 40% extreme
        score = Math.round(moderateScore * 0.6 + extremeScore * 0.4);
    } else {
        // Normal: simple average
        score = Math.round((a.score + b.score) / 2);
    }

    // Use the auditor's quote and reasoning (they have the last word)
    return {
        score,
        quote: b.quote || a.quote,
        reasoning: b.reasoning || a.reasoning,
    };
}

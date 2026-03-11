import { prisma } from "./db";
import { logger } from "./logger";
import { analyzeAdsTxt } from "./ads-scanner";
import { analyzePluralism } from "./scanners/pluralism-scanner";
import { analyzeSemantics } from "./semantic-scanner";
import { checkMediaReputation } from "./google-fact-check";
import { generateSourceDescription } from "../services/sourceProfiler";
import { analyzeEditorial } from "./scanners/editorial-scanner";
import { analyzeBias } from "./scanners/bias-scanner";
import { evaluateUnknownSource } from "./cold-profiler"; // NEW: Cold Profiler
import { PoliticalBias, Reliability, Source } from "@prisma/client";

// --- TYPES ---
export interface RichTrustScore {
    globalScore: number;
    confidenceLevel: string;
    details: {
        transparency: number;
        editorial: number;
        semantic: number;
        pluralism: number;
    };
    flags: {
        isPlatform: boolean;
        hasFactCheckFailures: boolean;
        isAdsTxtValid: boolean;
        isOwnerPublic: boolean;
    };
    metadata: {
        name: string;
        justification: string | null;
        description?: string | null;
        politicalBias: PoliticalBias;
        biasScore: number;
        reliability: Reliability;
        country: string;
        type: string;
        explanation?: {
            formula: string;
            range: string; // Ex: "[80-100]"
            qualityCursor: string; // Ex: "75% (Good)"
            penalties: string[];
        };
    };
}

import { TRUST_SCORE_RANGES } from "../config/trust-constants";

// --- HELPERS ---
function getRange(reliability: Reliability) {
    return TRUST_SCORE_RANGES[reliability] || TRUST_SCORE_RANGES[Reliability.UNKNOWN];
}

export async function getRichTrustScore(domain: string, url?: string): Promise<RichTrustScore> {
    // 1. Chercher le domaine dans la BDD
    let source = await prisma.source.findUnique({
        where: { domain: domain },
    });

    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const oneDayAgo = new Date();
    oneDayAgo.setDate(now.getDate() - 1);

    // 2. CHECK CACHE (Smart Cache Policy)
    let isValidCache = false;

    if (source && source.lastAuditDate) {
        if (source.isConsensusVerified) {
            // Consensus Source: Stable, 30 days cache
            if (source.lastAuditDate > thirtyDaysAgo) isValidCache = true;
        } else {
            // AI/Unknown Source: Evolving, 24h cache to allow refinement
            if (source.lastAuditDate > oneDayAgo) isValidCache = true;
        }
    }

    if (isValidCache && source) {
        if (!source.description) {
            logger.info('Cache HIT but Bio missing. Auto-generating...', { module: 'TrustScore', domain });
            const cachedDescription = await generateSourceDescription(domain);
            if (cachedDescription) {
                await prisma.source.update({ where: { domain: source.domain }, data: { description: cachedDescription } });
                source.description = cachedDescription;
            }
        }

        // Recalcul du range pour l'affichage (sans refaire l'audit)
        const range = getRange(source.reliability);

        // SELF-HEALING: Check if stored score matches the reliability range
        if (source.trustScore < range.min || source.trustScore > range.max) {
            // Consistency Check logic...
            logger.warn(`Cache HIT but Consistency Check FAILED. Re-auditing.`, { module: 'TrustScore', domain });
            // Proceed to audit
        } else {
            // Restore quality ratio
            const rangeSize = range.max - range.min;
            let recoveredQuality = 0;
            if (rangeSize > 0) {
                recoveredQuality = (source.trustScore - range.min) / rangeSize;
            }
            logger.info('Cache HIT', { module: 'TrustScore', domain });
            return formatResponse(source, range.min, range.max, recoveredQuality, []);
        }
    }

    // 3. INVESTIGATION (Cold Profiler) si Unknown
    let reliability = source?.reliability || Reliability.UNKNOWN;
    let detectedSourceType = source?.type || 'GENERAL';

    if (reliability === Reliability.UNKNOWN) {
        const investigation = await evaluateUnknownSource(domain);
        reliability = investigation.reliability;
        detectedSourceType = investigation.sourceType;
        logger.info(`Cold Profiler Verdict: ${reliability} (${detectedSourceType})`, { module: 'TrustScore', reasoning: investigation.reasoning });
    }

    // 4. FULL AUDIT (Parallel Scanners)
    logger.info('Starting V2 Audit (Range & Cursor)', { module: 'TrustScore', domain, reliability });

    const [auditResult, adsResult, pluralismResult, semanticResult, editorialResult, aiDescription, biasResult] = await Promise.all([
        checkMediaReputation(domain),        // Google Fact Check
        analyzeAdsTxt(domain),               // Ads.txt
        analyzePluralism(domain, url),       // Pluralism (Fetches content internally)
        analyzeSemantics(domain),            // Clickbait & NLP
        analyzeEditorial(domain),            // Citations & Corrections
        generateSourceDescription(domain),   // Bio IA
        analyzeBias(domain)                  // Bias Scanner
    ]);

    // 5. CALCUL DU SCORE (V2 Logic)
    // A. Définir le Range (Le Terrain)
    const { min, max } = getRange(reliability);
    const rangeSize = max - min;

    // B. Calculer le Curseur (La Position)
    // Editorial (40%) + Sémantique (30%) + Pluralisme (30%)
    // Les scores des scanners sont sur 100.

    // Normalisation Editorial (Base 60 + Modifiers)
    let editorialBase = 60;
    if (editorialResult && typeof editorialResult.scoreModifier === 'number') {
        editorialBase += editorialResult.scoreModifier; // +/- points
    }

    const editorialScore = Math.min(100, Math.max(0, editorialBase));

    // Normalisation Sémantique
    const semanticScore = semanticResult.score; // 0-100

    // Normalisation Pluralisme
    const pluralismScore = pluralismResult.score; // 0-100

    // Ratio Global (0.0 à 1.0)
    // 40% Editorial (Facts/Corrections), 30% Semantic (Tone), 30% Pluralism (Diversity)
    const qualityRatio = ((editorialScore * 0.4) + (semanticScore * 0.3) + (pluralismScore * 0.3)) / 100;

    // C. Score Brut
    let rawScore = min + (rangeSize * qualityRatio);
    logger.info(`Score Calc: Range[${min}-${max}] * Ratio[${qualityRatio.toFixed(2)}] = ${rawScore.toFixed(2)}`, { module: 'TrustScore' });

    // D. Appliquer les Modificateurs (Malus/Bonus)
    const penalties: string[] = [];

    // Malus Transparence
    if (!adsResult.isAdsTxtValid) {
        rawScore -= 5;
        penalties.push("Ads.txt Manquant (-5)");
    }

    // E. Kill Switch (Fact Check)
    if (auditResult.failureCount > 0) {
        const killCap = 40; // Max allowed for liars
        if (rawScore > killCap) {
            rawScore = killCap;
            penalties.push(`KILL SWITCH: ${auditResult.failureCount} Fact-Check Failures (Max 40)`);
        }
    }

    // F. Final Rounding
    let finalTrustScore = Math.min(100, Math.max(0, Math.round(rawScore)));

    // 6. SAUVEGARDE DB & EVOLUTION
    let finalPoliticalBias = source?.politicalBias || PoliticalBias.UNKNOWN;

    // EVOLUTION LOGIC (CUMULATIVE AVERAGE)
    // AI Sources: Cumulative Moving Average (Starts high impact, settles to 10%)
    // Consensus Sources: Fixed low impact (10%) to respect the "Expert" baseline while allowing slight movement.
    const isEvolving = source !== null; // Tout le monde peut évoluer maintenant

    // Valeurs cibles (Nouveau Scan)
    let targetEditorial = editorialScore;
    let targetSemantic = semanticScore;
    let targetPluralism = pluralismScore;
    let targetTransparency = adsResult.score;

    let nextAuditCount = (source?.auditCount || 0) + 1;

    if (isEvolving && source) {
        let newWeight = 0.10; // Default min floor

        if (source.isConsensusVerified) {
            // CONSENSUS STRATEGY:
            // On considère que le Consensus vaut comme un "très long historique".
            // On accorde seulement 10% de poids au nouveau scan pour faire varier la note à la marge.
            // C'est comme si on avait déjà 9 audits en stock (1/(9+1) = 0.1).
            newWeight = 0.10;
            logger.info(`Evolving Score for CONSENSUS ${domain}. Weights: History=0.90, New=0.10`, { module: 'TrustScore' });
        } else {
            // AI STRATEGY (Cold Profile):
            // Loi de l'inverse : Plus on a d'audits, plus le nouveau compte moins.
            // Mais on garde un plancher de 10% pour rester réactif.
            const currentCount = source.auditCount || 1;
            newWeight = 1 / (currentCount + 1);
            newWeight = Math.max(newWeight, 0.10); // Min 10% d'impact

            logger.info(`Evolving Score for AI-SOURCE ${domain} (Audit #${nextAuditCount}). Weights: History=${(1 - newWeight).toFixed(2)}, New=${newWeight.toFixed(2)}`, { module: 'TrustScore' });
        }

        const historyWeight = 1 - newWeight;

        finalTrustScore = Math.round((source.trustScore * historyWeight) + (finalTrustScore * newWeight));
        targetEditorial = Math.round((source.editorialScore * historyWeight) + (editorialScore * newWeight));
        targetSemantic = Math.round((source.semanticScore * historyWeight) + (semanticScore * newWeight));
        targetTransparency = Math.round((source.transparencyScore * historyWeight) + (adsResult.score * newWeight));

        // Pluralism History (New Field, might be null/0 initially)
        const historyPluralism = source.pluralismScore || pluralismScore; // Use new score if 0/null to init
        targetPluralism = Math.round((historyPluralism * historyWeight) + (pluralismScore * newWeight));
    }

    // Bias Logic
    if (source?.isConsensusVerified) {
        finalPoliticalBias = source.politicalBias;
        logger.info(`Consensus Protected: Ignoring AI Bias (${biasResult.bias})`, { module: 'TrustScore', domain });
    } else {
        if (biasResult.bias !== PoliticalBias.UNKNOWN) {
            finalPoliticalBias = biasResult.bias;
        }
    }

    // Bias Score Evolution (Numeric)
    // CONSENSUS PROTECTION: Never touch bias score of a consensus source with a live scan.
    // AI SOURCES: Evolve with the same cumulative logic.
    let biasScore = biasResult.score !== 0 ? biasResult.score : (source?.biasScore || 0);

    if (isEvolving && source && biasResult.score !== 0) {
        if (source.isConsensusVerified) {
            // PROTECTED. Keep DB Value.
            biasScore = source.biasScore;
            logger.info(`Consensus Bias Protected: kept ${biasScore}`, { module: 'TrustScore' });
        } else {
            // AI EVOLUTION
            const currentCount = source.auditCount || 1;
            let newWeight = 1 / (currentCount + 1);
            newWeight = Math.max(newWeight, 0.10);
            const historyWeight = 1 - newWeight;

            biasScore = Math.round((source.biasScore * historyWeight) + (biasScore * newWeight));
        }
    }

    const updatedSource = await prisma.source.upsert({
        where: { domain },
        update: {
            trustScore: finalTrustScore,
            transparencyScore: targetTransparency,
            editorialScore: targetEditorial,
            semanticScore: targetSemantic,
            pluralismScore: targetPluralism,
            pluralismDetails: pluralismResult.details, // Save details!
            reliability: reliability,
            // Only update type if it was GENERAL (don't overwrite manually-set types)
            ...(source?.type === 'GENERAL' && detectedSourceType !== 'GENERAL' ? { type: detectedSourceType } : {}),

            politicalBias: finalPoliticalBias,
            biasScore,

            isAdsTxtValid: adsResult.isAdsTxtValid,
            hasFactCheckFailures: auditResult.failureCount > 0,
            factCheckFailCount: auditResult.failureCount,

            lastAuditDate: now,
            description: aiDescription || source?.description,
            auditCount: nextAuditCount
        },
        create: {
            domain,
            name: domain,
            type: detectedSourceType,
            trustScore: finalTrustScore,
            reliability: reliability,
            transparencyScore: adsResult.score,
            editorialScore: editorialScore,
            semanticScore: semanticScore,
            pluralismScore: pluralismScore,
            pluralismDetails: pluralismResult.details,

            politicalBias: finalPoliticalBias,
            biasScore,

            isAdsTxtValid: adsResult.isAdsTxtValid,
            hasFactCheckFailures: auditResult.failureCount > 0,
            factCheckFailCount: auditResult.failureCount,

            lastAuditDate: now,
            description: aiDescription,
            auditCount: 1
        }
    });

    return formatResponse(updatedSource, min, max, qualityRatio, penalties);
}

// --- FORMATTER ---
function formatResponse(source: Source, min: number, max: number, qualityRatio: number, penalties: string[]): RichTrustScore {
    return {
        globalScore: source.trustScore,
        confidenceLevel: 'HIGH',
        details: {
            transparency: source.transparencyScore,
            editorial: source.editorialScore,
            semantic: source.semanticScore,
            pluralism: source.pluralismScore,
        },
        flags: {
            isPlatform: source.type === 'SOCIAL',
            hasFactCheckFailures: source.hasFactCheckFailures,
            isAdsTxtValid: source.isAdsTxtValid,
            isOwnerPublic: source.isOwnerPublic
        },
        metadata: {
            name: source.name,
            justification: source.justification || "Analyse V2 (Range & Cursor)",
            description: source.description,
            politicalBias: source.politicalBias,
            biasScore: source.biasScore,
            reliability: source.reliability,
            country: source.detectedCountry || "FR",
            type: source.type,
            explanation: {
                formula: `Range ${source.reliability} [${min}-${max}] + Qualité`,
                range: `[${min}-${max}]`,
                qualityCursor: `${Math.round(qualityRatio * 100)}%`,
                penalties: penalties
            }
        }
    };
}
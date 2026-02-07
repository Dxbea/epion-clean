import { prisma } from "./db";
import { logger } from "./logger";
import { analyzeAdsTxt } from "./ads-scanner";
import { analyzeUX } from "./ux-scanner";
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
        ux: number;
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

export async function getRichTrustScore(domain: string): Promise<RichTrustScore> {
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
        // ... (Logique description manquante conservée) ...
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

    // ... (Investigation / Scanners) ...
    // Note: Copied context for insertion, actual scanners run here

    // 3. INVESTIGATION (Cold Profiler) si Unknown
    let reliability = source?.reliability || Reliability.UNKNOWN;

    if (reliability === Reliability.UNKNOWN) {
        const investigation = await evaluateUnknownSource(domain);
        reliability = investigation.reliability;
        logger.info(`Cold Profiler Verdict: ${reliability}`, { module: 'TrustScore', reasoning: investigation.reasoning });
    }

    // 4. FULL AUDIT (Parallel Scanners)
    logger.info('Starting V2 Audit (Range & Cursor)', { module: 'TrustScore', domain, reliability });

    const [auditResult, adsResult, uxResult, semanticResult, editorialResult, aiDescription, biasResult] = await Promise.all([
        checkMediaReputation(domain),        // Google Fact Check
        analyzeAdsTxt(domain),               // Ads.txt
        analyzeUX(domain),                   // UX & Ads
        analyzeSemantics(domain),            // Clickbait & NLP
        analyzeEditorial(domain),            // Citations & Corrections
        generateSourceDescription(domain),   // Bio IA
        analyzeBias(domain)                  // Bias Scanner (pour confirmer/affiner)
    ]);

    // 5. CALCUL DU SCORE (V2 Logic)
    // A. Définir le Range (Le Terrain)
    const { min, max } = getRange(reliability);
    const rangeSize = max - min;

    // B. Calculer le Curseur (La Position)
    // Editorial (0.6) + Sémantique (0.4)
    // Les scores des scanners sont sur 100.

    // Normalisation Editorial (Base 60 + Modifiers)
    let editorialBase = 60;
    if (editorialResult && typeof editorialResult.scoreModifier === 'number') {
        editorialBase += editorialResult.scoreModifier; // +/- points
    }
    if (uxResult.hasCorrectionPolicy) editorialBase += 10;
    const editorialScore = Math.min(100, Math.max(0, editorialBase));

    // Normalisation Sémantique
    const semanticScore = semanticResult.score; // 0-100

    // Ratio Global (0.0 à 1.0)
    const qualityRatio = ((editorialScore * 0.6) + (semanticScore * 0.4)) / 100;

    // C. Score Brut
    let rawScore = min + (rangeSize * qualityRatio);
    logger.info(`Score Calc: Range[${min}-${max}] * Ratio[${qualityRatio.toFixed(2)}] = ${rawScore.toFixed(2)}`, { module: 'TrustScore' });

    // D. Appliquer les Modificateurs (Malus/Bonus)
    const penalties: string[] = [];

    // Malus UX
    if (uxResult.adDensity === 'HIGH') {
        rawScore -= 5;
        penalties.push("Publicité Excessive (-5)");
    } else if (uxResult.intrusivenessScore >= 4) {
        rawScore -= 3;
        penalties.push("Formats Intrusifs (-3)");
    }

    if (uxResult.hasDarkPatterns) {
        rawScore -= 3;
        penalties.push("Dark Patterns (-3)");
    }

    // Malus Transparence
    if (!adsResult.isAdsTxtValid) {
        rawScore -= 5;
        penalties.push("Ads.txt Manquant (-5)");
    }

    // Bonus Transparence
    let isOwnerPublic = uxResult.isOwnerPublic;
    if (domain.endsWith('.gouv.fr') || domain.endsWith('.gov')) isOwnerPublic = true;

    if (isOwnerPublic) {
        rawScore += 2;
        // penalties.push("Propriétaire Public (+2)"); // On n'affiche pas les bonus en 'penalties'
    }

    if (uxResult.hasAbout) {
        rawScore += 2;
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

    // EVOLUTION LOGIC
    // Si c'est un consensus, on protège.
    // Sinon, on fait une moyenne pondérée pour lisser l'évolution.
    const isEvolving = !source?.isConsensusVerified && source !== null;

    // Valeurs cibles (Nouveau Scan)
    let targetEditorial = editorialScore;
    let targetSemantic = semanticScore;
    let targetUX = uxResult.score;
    let targetTransparency = adsResult.score;

    let nextAuditCount = (source?.auditCount || 0) + 1;

    if (isEvolving && source) {
        // Weighted Average: 70% Old + 30% New (Stability > Volatility)
        // Helps avoid "Bad Audit" anomaly destroying a score, but allows progress.
        logger.info(`Evolving Score for ${domain}...`, { module: 'TrustScore' });

        finalTrustScore = Math.round((source.trustScore * 0.7) + (finalTrustScore * 0.3));
        targetEditorial = Math.round((source.editorialScore * 0.7) + (editorialScore * 0.3));
        targetSemantic = Math.round((source.semanticScore * 0.7) + (semanticScore * 0.3));
        targetUX = Math.round((source.uxScore * 0.7) + (uxResult.score * 0.3));
        targetTransparency = Math.round((source.transparencyScore * 0.7) + (adsResult.score * 0.3));
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
    let biasScore = biasResult.score !== 0 ? biasResult.score : (source?.biasScore || 0);
    if (isEvolving && source && biasResult.score !== 0) {
        biasScore = Math.round((source.biasScore * 0.7) + (biasScore * 0.3));
    }

    const updatedSource = await prisma.source.upsert({
        where: { domain },
        update: {
            trustScore: finalTrustScore,
            transparencyScore: targetTransparency,
            editorialScore: targetEditorial,
            semanticScore: targetSemantic,
            uxScore: targetUX,
            reliability: reliability,

            politicalBias: finalPoliticalBias,
            biasScore,

            isAdsTxtValid: adsResult.isAdsTxtValid,
            hasFactCheckFailures: auditResult.failureCount > 0,
            factCheckFailCount: auditResult.failureCount,
            // isClickbait: semanticResult.isClickbait, // REMOVED

            lastAuditDate: now,
            description: aiDescription || source?.description,
            auditCount: nextAuditCount
        },
        create: {
            domain,
            name: domain,
            trustScore: finalTrustScore,
            reliability: reliability,
            transparencyScore: adsResult.score,
            editorialScore: editorialScore,
            semanticScore: semanticScore,
            uxScore: uxResult.score,

            politicalBias: finalPoliticalBias,
            biasScore,

            isAdsTxtValid: adsResult.isAdsTxtValid,
            // adDensity, hasDarkPatterns, isClickbait REMOVED
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
            ux: source.uxScore,
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
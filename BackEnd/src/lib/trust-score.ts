import { prisma } from "./db.js";
import { logger } from "./logger.js";
import { analyzeAdsTxt } from "./ads-scanner.js";
import { analyzePluralism } from "./scanners/pluralism-scanner.js";
import { analyzeSemantics } from "./semantic-scanner.js";
import { checkMediaReputation } from "./google-fact-check.js";
import { resolveImmediateSourceDescription } from "../services/sourceProfiler.js";
import { analyzeEditorial } from "./scanners/editorial-scanner.js";
import { analyzeBias } from "./scanners/bias-scanner.js";
import { evaluateUnknownSource, type InvestigationResult } from "./cold-profiler.js";
import { ConfidenceLevel, PoliticalBias, Reliability, Source } from "@prisma/client";
import { TRUST_SCORE_RANGES } from "../config/trust-constants.js";
import {
    buildSourceProfileDataFromTrustScore,
    derivePublicTrustLabelFromTrustScore,
    mergeSourceProfileData,
    normalizeSourceProfileData,
    resolveSourceProfileConfidence,
} from "./source-profile.js";

export interface RichTrustScore {
    durableSourceId: string;
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
        country: string | null;
        type: string;
        explanation?: {
            formula: string;
            range: string;
            qualityCursor: string;
            penalties: string[];
        };
    };
    profileData: ReturnType<typeof normalizeSourceProfileData>;
    profileVersion: number | null;
    profileConfidence: ConfidenceLevel | null;
    lastProfiledAt: string | null;
    publicTrustLabel: ReturnType<typeof derivePublicTrustLabelFromTrustScore>;
}

export interface TrustScoreAuditInput {
    content?: string;
    metaDescription?: string | null;
}

function getRange(reliability: Reliability) {
    return TRUST_SCORE_RANGES[reliability] || TRUST_SCORE_RANGES[Reliability.UNKNOWN];
}

function buildBiasResultFromInvestigation(
    investigation: InvestigationResult,
    source: Source | null,
) {
    return {
        bias: investigation.politicalBias,
        score: investigation.biasScore,
        reliability: investigation.reliability,
        detectedCountry: source?.detectedCountry ?? null,
    };
}

export async function getRichTrustScore(
    domain: string,
    url?: string,
    auditInput: TrustScoreAuditInput = {},
): Promise<RichTrustScore> {
    let source = await prisma.source.findUnique({
        where: { domain },
    });

    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const oneDayAgo = new Date();
    oneDayAgo.setDate(now.getDate() - 1);

    let isValidCache = false;

    if (source && source.lastAuditDate) {
        if (source.isConsensusVerified) {
            if (source.lastAuditDate > thirtyDaysAgo) isValidCache = true;
        } else {
            if (source.lastAuditDate > oneDayAgo) isValidCache = true;
        }
    }

    if (isValidCache && source) {
        const range = getRange(source.reliability);

        if (source.trustScore < range.min || source.trustScore > range.max) {
            logger.warn('Cache HIT but Consistency Check FAILED. Re-auditing.', { module: 'TrustScore', domain });
        } else {
            const rangeSize = range.max - range.min;
            const recoveredQuality = rangeSize > 0
                ? (source.trustScore - range.min) / rangeSize
                : 0;

            logger.info('Cache HIT', { module: 'TrustScore', domain });
            return formatResponse(source, range.min, range.max, recoveredQuality, []);
        }
    }

    const factCheckResult = await checkMediaReputation(domain);

    let reliability = source?.reliability || Reliability.UNKNOWN;
    let detectedSourceType = source?.type || 'GENERAL';
    let investigation: InvestigationResult | null = null;

    if (reliability === Reliability.UNKNOWN) {
        investigation = await evaluateUnknownSource(domain, factCheckResult);
        reliability = investigation.reliability;
        detectedSourceType = investigation.sourceType;
        logger.info(`Cold Profiler Verdict: ${reliability} (${detectedSourceType})`, {
            module: 'TrustScore',
            domain,
            reasoning: investigation.reasoning,
        });
    }

    logger.info('Starting V2 Audit (Range & Cursor)', { module: 'TrustScore', domain, reliability });

    const [adsResult, pluralismResult, semanticResult, editorialResult, biasResult] = await Promise.all([
        analyzeAdsTxt(domain),
        analyzePluralism(domain, { url, content: auditInput.content }),
        analyzeSemantics(domain, { content: auditInput.content, metaDescription: auditInput.metaDescription }),
        analyzeEditorial(domain, { content: auditInput.content, metaDescription: auditInput.metaDescription }),
        investigation
            ? Promise.resolve(buildBiasResultFromInvestigation(investigation, source))
            : analyzeBias(domain),
    ]);

    const { min, max } = getRange(reliability);
    const rangeSize = max - min;

    let editorialBase = 60;
    if (typeof editorialResult?.scoreModifier === 'number') {
        editorialBase += editorialResult.scoreModifier;
    }

    const editorialScore = Math.min(100, Math.max(0, editorialBase));
    const semanticScore = semanticResult.score;
    const pluralismScore = pluralismResult.score;

    const qualityRatio = ((editorialScore * 0.4) + (semanticScore * 0.3) + (pluralismScore * 0.3)) / 100;

    let rawScore = min + (rangeSize * qualityRatio);
    logger.info(`Score Calc: Range[${min}-${max}] * Ratio[${qualityRatio.toFixed(2)}] = ${rawScore.toFixed(2)}`, { module: 'TrustScore' });

    const penalties: string[] = [];

    if (!adsResult.isAdsTxtValid) {
        rawScore -= 5;
        penalties.push('Ads.txt Manquant (-5)');
    }

    if (factCheckResult.failureCount > 0) {
        const killCap = 40;
        if (rawScore > killCap) {
            rawScore = killCap;
            penalties.push(`KILL SWITCH: ${factCheckResult.failureCount} Fact-Check Failures (Max 40)`);
        }
    }

    let finalTrustScore = Math.min(100, Math.max(0, Math.round(rawScore)));
    let finalPoliticalBias = source?.politicalBias || PoliticalBias.UNKNOWN;

    const isEvolving = source !== null;
    let targetEditorial = editorialScore;
    let targetSemantic = semanticScore;
    let targetPluralism = pluralismScore;
    let targetTransparency = adsResult.score;
    const nextAuditCount = (source?.auditCount || 0) + 1;

    if (isEvolving && source) {
        let newWeight = 0.10;

        if (source.isConsensusVerified) {
            newWeight = 0.10;
            logger.info(`Evolving Score for CONSENSUS ${domain}. Weights: History=0.90, New=0.10`, { module: 'TrustScore' });
        } else {
            const currentCount = source.auditCount || 1;
            newWeight = Math.max(1 / (currentCount + 1), 0.10);
            logger.info(`Evolving Score for AI-SOURCE ${domain} (Audit #${nextAuditCount}). Weights: History=${(1 - newWeight).toFixed(2)}, New=${newWeight.toFixed(2)}`, { module: 'TrustScore' });
        }

        const historyWeight = 1 - newWeight;

        finalTrustScore = Math.round((source.trustScore * historyWeight) + (finalTrustScore * newWeight));
        targetEditorial = Math.round((source.editorialScore * historyWeight) + (editorialScore * newWeight));
        targetSemantic = Math.round((source.semanticScore * historyWeight) + (semanticScore * newWeight));
        targetTransparency = Math.round((source.transparencyScore * historyWeight) + (adsResult.score * newWeight));

        const historyPluralism = source.pluralismScore || pluralismScore;
        targetPluralism = Math.round((historyPluralism * historyWeight) + (pluralismScore * newWeight));
    }

    if (source?.isConsensusVerified) {
        finalPoliticalBias = source.politicalBias;
        logger.info(`Consensus Protected: Ignoring AI Bias (${biasResult.bias})`, { module: 'TrustScore', domain });
    } else if (biasResult.bias !== PoliticalBias.UNKNOWN) {
        finalPoliticalBias = biasResult.bias;
    }

    let biasScore = typeof biasResult.score === 'number' && Number.isFinite(biasResult.score)
        ? Math.round(biasResult.score)
        : (source?.biasScore || 0);

    if (isEvolving && source && Number.isFinite(biasScore)) {
        if (source.isConsensusVerified) {
            biasScore = source.biasScore;
            logger.info(`Consensus Bias Protected: kept ${biasScore}`, { module: 'TrustScore' });
        } else {
            const currentCount = source.auditCount || 1;
            const newWeight = Math.max(1 / (currentCount + 1), 0.10);
            const historyWeight = 1 - newWeight;
            biasScore = Math.round((source.biasScore * historyWeight) + (biasScore * newWeight));
        }
    }

    const resolvedDescription = resolveImmediateSourceDescription(
        investigation?.shortBio,
        source?.description,
        auditInput.metaDescription,
    );
    const globalProfileDescription = investigation?.profileSummary
        ?? investigation?.shortBio
        ?? resolvedDescription;

    const sourceMetadata = source?.metadata;
    const legacyProfileData = sourceMetadata && typeof sourceMetadata === 'object' && !Array.isArray(sourceMetadata)
        ? (sourceMetadata as Record<string, unknown>).profileData
        : null;
    const existingProfileData = normalizeSourceProfileData(source?.profileData ?? legacyProfileData);
    const generatedProfileData = buildSourceProfileDataFromTrustScore({
        domain,
        metadata: {
            description: globalProfileDescription,
            country: source?.detectedCountry,
            type: detectedSourceType,
        },
        profileSummary: investigation?.profileSummary,
        ownership: investigation?.ownership,
        businessModel: investigation?.businessModel,
        editorialPositioning: investigation?.editorialPositioning,
        specialty: investigation?.specialty,
        strengths: investigation?.strengths,
        vigilancePoints: investigation?.vigilancePoints,
        externalReferences: investigation?.externalReferences,
    });
    const mergedProfileData = mergeSourceProfileData(existingProfileData, generatedProfileData);
    const profileDataChanged = JSON.stringify(existingProfileData) !== JSON.stringify(mergedProfileData);
    const shouldWriteProfile = Boolean(
        mergedProfileData
        && generatedProfileData
        && (!source?.profileData || profileDataChanged || source.profileVersion === null || source.profileConfidence === null),
    );
    const profileWasBuiltOrUpdated = Boolean(mergedProfileData && generatedProfileData && (!source?.profileData || profileDataChanged));
    const profileConfidence = resolveSourceProfileConfidence(
        source?.profileConfidence,
        source?.isConsensusVerified ?? false,
        Boolean(
            investigation?.externalReferences.length
            && (
                investigation.profileSummary
                || investigation.ownership
                || investigation.businessModel
                || investigation.editorialPositioning
                || investigation.specialty
                || investigation.strengths.length
                || investigation.vigilancePoints.length
            )
        ),
    ) as ConfidenceLevel;
    const profileFields = shouldWriteProfile
        ? {
            profileData: mergedProfileData as object,
            profileVersion: source?.profileVersion ?? 1,
            profileConfidence,
            ...(profileWasBuiltOrUpdated ? { lastProfiledAt: now } : {}),
        }
        : {};
    const publicTrustLabel = derivePublicTrustLabelFromTrustScore(finalTrustScore);

    const updatedSource = await prisma.source.upsert({
        where: { domain },
        update: {
            trustScore: finalTrustScore,
            transparencyScore: targetTransparency,
            editorialScore: targetEditorial,
            semanticScore: targetSemantic,
            pluralismScore: targetPluralism,
            pluralismDetails: pluralismResult.details,
            reliability,
            ...(source?.type === 'GENERAL' && detectedSourceType !== 'GENERAL' ? { type: detectedSourceType } : {}),
            politicalBias: finalPoliticalBias,
            biasScore,
            isAdsTxtValid: adsResult.isAdsTxtValid,
            hasFactCheckFailures: factCheckResult.failureCount > 0,
            factCheckFailCount: factCheckResult.failureCount,
            lastAuditDate: now,
            description: resolvedDescription ?? source?.description,
            auditCount: nextAuditCount,
            ...profileFields,
            publicTrustLabel,
        },
        create: {
            domain,
            name: domain,
            type: detectedSourceType,
            trustScore: finalTrustScore,
            reliability,
            transparencyScore: adsResult.score,
            editorialScore,
            semanticScore,
            pluralismScore,
            pluralismDetails: pluralismResult.details,
            politicalBias: finalPoliticalBias,
            biasScore,
            isAdsTxtValid: adsResult.isAdsTxtValid,
            hasFactCheckFailures: factCheckResult.failureCount > 0,
            factCheckFailCount: factCheckResult.failureCount,
            lastAuditDate: now,
            description: resolvedDescription,
            auditCount: 1,
            ...profileFields,
            publicTrustLabel,
        },
    });

    return formatResponse(updatedSource, min, max, qualityRatio, penalties);
}

function formatResponse(source: Source, min: number, max: number, qualityRatio: number, penalties: string[]): RichTrustScore {
    return {
        durableSourceId: source.id,
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
            isOwnerPublic: source.isOwnerPublic,
        },
        metadata: {
            name: source.name,
            justification: source.justification || 'Analyse V2 (Range & Cursor)',
            description: source.description,
            politicalBias: source.politicalBias,
            biasScore: source.biasScore,
            reliability: source.reliability,
            country: source.detectedCountry,
            type: source.type,
            explanation: {
                formula: `Range ${source.reliability} [${min}-${max}] + Qualité`,
                range: `[${min}-${max}]`,
                qualityCursor: `${Math.round(qualityRatio * 100)}%`,
                penalties,
            },
        },
        profileData: normalizeSourceProfileData(source.profileData),
        profileVersion: source.profileVersion,
        profileConfidence: source.profileConfidence,
        lastProfiledAt: source.lastProfiledAt?.toISOString() ?? null,
        publicTrustLabel: (source.publicTrustLabel as ReturnType<typeof derivePublicTrustLabelFromTrustScore> | null)
            ?? derivePublicTrustLabelFromTrustScore(source.trustScore),
    };
}

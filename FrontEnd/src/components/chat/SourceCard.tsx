import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SourceIdentityCard } from './trust-score-ui/SourceIdentityCard';
import { deriveSupportLevelFromScore, getPublicSupportBadgeClass, getPublicSupportLabel, type SupportLevel } from '@/lib/score-labels';
import { useI18n } from '@/i18n/I18nContext';

import { extractPlatformSourceContext, extractStructuredSourceProfile, formatSourceRoleLabel, getSourceAnalysisLabel, getSourceRoleKey, isSourceAnalysisPending, readSourceAnalysisStatus, type SourceAnalysisStatus } from '@/lib/source-ui';
export interface SourceCriteria {
    label: string;
    value: string;
}

export interface SourceMetrics {
    transparency: number;
    editorial: number;
    semantic: number;
    logic: number;
}

export interface SourceFlags {
    isAdsTxtValid?: boolean;
    isPlatform?: boolean;
    hasFactCheckFailures?: boolean;
    isClickbait?: boolean;
    hasDarkPatterns?: boolean;
}

export interface SourceData {
    id: number;
    name: string;
    domain: string;
    url?: string;
    logo?: string;
    category?: string;
    score: number | null;
    supportLevel?: import('@/lib/score-labels').SupportLevel | null;
    analysisStatus?: SourceAnalysisStatus;
    isEnriching?: boolean;
    description?: string | null;
    criteria?: SourceCriteria[];
    metrics?: SourceMetrics;
    flags?: SourceFlags;
    justification?: string;
    // New Fields
    dbScore?: number; // V2 Score carried from DB
    country?: string;
    politicalBias?: string;
    biasScore?: number;
    reliability?: string;
    liveScore?: number;
    reputationScore?: number | null;
    analysisScore?: number | null;
    explanation?: {
        formula: string;
        sources: string[];
        livePenalties: string[];
        pillarWeights: { [key: string]: string };
    };
    [key: string]: any;
}

interface SourceCardProps {
    source: SourceData;
    isFocused?: boolean;
}

const SOURCE_EXTRACTION_KEYS: Record<string, 'source_extraction_analyzed' | 'source_extraction_metadata_only' | 'source_extraction_unavailable' | 'source_extraction_pending' | 'source_extraction_failed' | 'source_extraction_success'> = {
    ANALYZED: 'source_extraction_analyzed',
    METADATA_ONLY: 'source_extraction_metadata_only',
    UNAVAILABLE: 'source_extraction_unavailable',
    PENDING: 'source_extraction_pending',
    FAILED: 'source_extraction_failed',
    SUCCESS: 'source_extraction_success',
    EXTRACTED: 'source_extraction_success',
    FULL: 'source_extraction_success',
    COMPLETED: 'source_extraction_success',
};

const SOURCE_SECTION_CLASS = 'rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-white/10 dark:bg-white/[0.03]';

type TechnicalStatus = 'used' | 'global' | 'legacy_read' | 'compatibility';

type TechnicalTransparency = {
    profileData: Record<string, any>;
    profileMethodVersion?: string;
    hasProfileLayer: boolean;
    hasProfileSnapshot: boolean;
    hasCurrentProfile: boolean;
    externalReferenceCount: number;
    claimCount: number;
    claimReferenceLinkCount: number;
    provenance?: string;
    supportStrength?: string;
    searchLane?: string;
    provider?: string;
    hasArticleSourceRelation: boolean;
    isImportedLegacy: boolean;
    hasLiveAnalysisEvidence: boolean;
    hasLegacyCompatibility: boolean;
    legacyAliases: string[];
};

function readRecord(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, any>
        : {};
}

function hasProfileValues(profile: Record<string, any>): boolean {
    return Boolean(
        profile.profileData
        || profile.profileVersion
        || profile.profileConfidence
        || profile.publicTrustLabel
        || profile.lastProfiledAt,
    );
}

function getTechnicalTransparency(source: SourceData): TechnicalTransparency {
    const snapshot = readRecord(source.profileSnapshot);
    const currentProfile = readRecord(source.currentProfile);
    const profileData = readRecord(
        source.profileData
        ?? snapshot.profileData
        ?? currentProfile.profileData,
    );
    const claimReferences = readRecord(profileData.claimReferences);
    const claimReferenceLists = Object.values(claimReferences)
        .filter((value): value is unknown[] => Array.isArray(value));
    const externalReferences = Array.isArray(profileData.externalReferences)
        ? profileData.externalReferences
        : Array.isArray(profileData.references) ? profileData.references : [];
    const provenance = typeof source.provenance === 'string' ? source.provenance.toUpperCase() : undefined;
    const supportStrength = typeof source.supportStrength === 'string' ? source.supportStrength.toUpperCase() : undefined;
    const searchLane = typeof source.searchLane === 'string' ? source.searchLane.toUpperCase() : undefined;
    const provider = typeof source.provider === 'string' ? source.provider.toUpperCase() : undefined;
    const hasArticleSourceRelation = Boolean(source.durableSourceId);
    const isImportedLegacy = provenance === 'IMPORTED_LEGACY';
    const hasLiveAnalysisEvidence = !isImportedLegacy && Boolean(
        searchLane
        || provider
        || source.officialStatement !== undefined
        || provenance === 'WEB_SEARCH'
        || provenance === 'INTERNAL_RAG',
    );
    const legacyAliases = [
        source.metadata?.dbScore !== undefined ? 'metadata.dbScore' : null,
        source.dbScore !== undefined ? 'dbScore' : null,
    ].filter((value): value is string => Boolean(value));

    return {
        profileData,
        profileMethodVersion: typeof profileData.methodVersion === 'string' ? profileData.methodVersion : undefined,
        hasProfileLayer: Object.keys(profileData).length > 0
            || Boolean(source.profileVersion ?? snapshot.profileVersion ?? currentProfile.profileVersion),
        hasProfileSnapshot: hasProfileValues(snapshot),
        hasCurrentProfile: hasProfileValues(currentProfile),
        externalReferenceCount: externalReferences.length,
        claimCount: claimReferenceLists.length,
        claimReferenceLinkCount: claimReferenceLists.reduce((total, references) => total + references.length, 0),
        provenance,
        supportStrength,
        searchLane,
        provider,
        hasArticleSourceRelation,
        isImportedLegacy,
        hasLiveAnalysisEvidence,
        hasLegacyCompatibility: isImportedLegacy
            || !hasArticleSourceRelation
            || legacyAliases.length > 0,
        legacyAliases,
    };
}

const SUPPORT_HIGHLIGHT_BORDER_CLASSES: Record<SupportLevel, string> = {
    very_strong: 'border-emerald-400 dark:border-emerald-500/70',
    strong: 'border-teal-400 dark:border-teal-500/70',
    nuanced: 'border-yellow-400 dark:border-yellow-500/70',
    fragile: 'border-amber-500 dark:border-amber-500/70',
    unverified: 'border-rose-500 dark:border-rose-500/70',
    unsourced: 'border-slate-400 dark:border-slate-500/70',
};

function ScoreBadge({ score, supportLevel, isEnriching = false, analysisStatus }: { score: number | null; supportLevel?: import('@/lib/score-labels').SupportLevel | null; isEnriching?: boolean; analysisStatus?: SourceAnalysisStatus }) {
    const { t } = useI18n();
    const analysisLabel = getSourceAnalysisLabel({ analysisStatus });
    if (analysisStatus === 'PENDING' || isEnriching) {
        return (
            <div className="flex items-center gap-2 rounded-full px-2 py-1 bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/5 animate-pulse">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {analysisLabel ?? 'Analyse en cours...'}
                </span>
                <div className="h-5 w-5 rounded-full bg-gray-200 dark:bg-white/20" />
            </div>
        );
    }
    const resolvedLevel = supportLevel ?? deriveSupportLevelFromScore(score);
    return (
        <div className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getPublicSupportBadgeClass(resolvedLevel)}`}>
            {t('source_quality_short')} · {getPublicSupportLabel({ backendScore: score, supportLevel })}
        </div>
    );
}

function ProfileSignalList({ title, items }: { title: string; items: string[] }) {
    return (
        <div>
            <dt className="font-medium text-gray-500">{title}</dt>
            <dd>
                <ul className="mt-1 space-y-1.5 text-gray-800 dark:text-gray-200">
                    {items.map((item) => <li key={item}>• {item}</li>)}
                </ul>
            </dd>
        </div>
    );
}

export default function SourceCard({ source, isFocused }: SourceCardProps) {
    const { t } = useI18n();
    const [isExpanded, setIsExpanded] = useState(false);
    const cardRef = React.useRef<HTMLDivElement>(null);
    const isPending = isSourceAnalysisPending(source);
    const roleKey = getSourceRoleKey(source);
    const roleLabel = formatSourceRoleLabel(roleKey);
    const profile = extractStructuredSourceProfile(source);
    const platformContext = extractPlatformSourceContext(source);
    const analysisStatus = readSourceAnalysisStatus(source);
    const profileConfidence = String(
        source.profileConfidence
        ?? source.profileSnapshot?.profileConfidence
        ?? source.currentProfile?.profileConfidence
        ?? ''
    ).toUpperCase();
    const profileInformationLabel = ['LOW', 'MEDIUM', 'HIGH'].includes(profileConfidence)
        ? t(`source_profile_information_${profileConfidence.toLowerCase()}`)
        : undefined;
    const profileVersion = source.profileVersion
        ?? source.profileSnapshot?.profileVersion
        ?? source.currentProfile?.profileVersion;
    const extractionStatus = source.extractionStatus ?? analysisStatus;
    const extractionTranslationKey = SOURCE_EXTRACTION_KEYS[String(extractionStatus ?? '').toUpperCase()];
    const extractionStatusLabel = extractionTranslationKey ? t(extractionTranslationKey) : undefined;
    const technical = getTechnicalTransparency(source);
    const externalReferenceCount = Math.max(technical.externalReferenceCount, profile.references.length);
    const sourceReliability = source.reliability ?? source.metadata?.reliability;
    const publicTrustLabel = source.publicTrustLabel
        ?? source.profileSnapshot?.publicTrustLabel
        ?? source.currentProfile?.publicTrustLabel;
    const hasProfileCopies = technical.hasProfileSnapshot || technical.hasCurrentProfile;
    const hasReputationSystem = typeof source.score === 'number'
        || Boolean(source.reliability ?? source.metadata?.reliability)
        || Boolean(source.metrics)
        || Boolean(source.publicTrustLabel);
    const hasArticleUsage = technical.hasArticleSourceRelation
        || Boolean(roleKey)
        || Boolean(technical.provenance)
        || Boolean(technical.supportStrength)
        || Boolean(technical.searchLane)
        || Boolean(technical.provider);
    const hasTechnicalDetails = typeof source.score === 'number'
        || technical.hasProfileLayer
        || Boolean(extractionStatusLabel)
        || hasReputationSystem
        || hasArticleUsage
        || externalReferenceCount > 0
        || technical.claimCount > 0
        || technical.hasLegacyCompatibility;
    const hasProfileData = Boolean(
        source.profileData
        ?? source.profileSnapshot?.profileData
        ?? source.currentProfile?.profileData
    );
    const knownLimits = [
        analysisStatus === 'METADATA_ONLY' ? t('source_limit_metadata_only') : null,
        analysisStatus === 'UNAVAILABLE' ? t('source_limit_unavailable') : null,
        !hasProfileData ? t('source_limit_no_profile') : null,
    ].filter((item): item is string => Boolean(item));
    const vigilanceItems = Array.from(new Set([...profile.warnings, ...knownLimits]));
    const hasEditorialReputation = Boolean(
        profile.editorialPositioning
        || profile.generalReputation
        || profile.reliabilitySignals.length
        || profile.misinformationSignals.length
        || profile.correctionHistory
        || profile.editorialPolicy
    );
    const roleExplanationKey = roleKey ? SOURCE_ROLE_EXPLANATION_KEYS[roleKey] : undefined;
    const supportLevel = source.supportLevel ?? deriveSupportLevelFromScore(source.score);
    const toggleExpanded = React.useCallback(() => {
        if (!isPending) setIsExpanded((current) => !current);
    }, [isPending]);

    React.useEffect(() => {
        if (isFocused && cardRef.current) {
            cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setIsExpanded(true);
        }
    }, [isFocused]);

    const isOpen = isExpanded;
    const openBorderClass = isFocused
        ? SUPPORT_HIGHLIGHT_BORDER_CLASSES[supportLevel]
        : 'border-gray-300 dark:border-white/20';
    const containerStyle = isOpen
        ? `border bg-white shadow-sm dark:bg-neutral-900 ${openBorderClass}`
        : 'border border-gray-200 bg-white dark:border-white/10 dark:bg-neutral-900';

    const InternalContent = () => (
        <div className="flex items-center gap-3 overflow-hidden">
            <SourceLogo source={source} />
            <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate">
                        {source.name}
                    </h4>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate w-full transition-colors">
                    {source.domain}
                </span>
            </div>
        </div>
    );

    return (
        <div
            ref={cardRef}
            className={`w-full rounded-lg transition-all hover:shadow-md ${containerStyle} ${isPending ? 'opacity-90' : ''}`}
        >
            <div className="flex items-center">
                {source.url ? (
                    <a
                        data-source-link
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-l-lg p-4 pr-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-300 dark:focus-visible:ring-white/20"
                    >
                        <div className="min-w-0 flex-1">
                            <InternalContent />
                        </div>
                        <ScoreBadge score={source.score} supportLevel={source.supportLevel} isEnriching={source.isEnriching} analysisStatus={source.analysisStatus} />
                    </a>
                ) : (
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-4 p-4 pr-3">
                        <div className="min-w-0 flex-1">
                            <InternalContent />
                        </div>
                        <ScoreBadge score={source.score} supportLevel={source.supportLevel} isEnriching={source.isEnriching} analysisStatus={source.analysisStatus} />
                    </div>
                )}

                <div className="shrink-0 pr-4">
                    {!isPending && (
                        <button
                            type="button"
                            aria-label={isOpen ? 'Fermer la fiche source' : 'Ouvrir la fiche source'}
                            aria-expanded={isOpen}
                            onClick={(event) => {
                                event.stopPropagation();
                                toggleExpanded();
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white dark:focus:ring-white/20"
                        >
                            <ChevronDown
                                className={`h-5 w-5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                            />
                        </button>
                    )}
                </div>
            </div>

            {/* EXPANDED VIEW: COMPLETE TRANSPARENCY UI */}
            {isOpen && !isPending && (
                <div className="animate-in slide-in-from-top-2 fade-in duration-200 border-t border-gray-100 p-4 dark:border-white/5">

                    <div className="space-y-4">
                        {/* 1. Informations sur la source */}
                        <section data-source-section="information" className={SOURCE_SECTION_CLASS}>
                            <div className="[&>section]:border-t-0 [&>section]:pt-0">
                                <SourceIdentityCard
                                    name={source.name}
                                    description={source.description}
                                    country={source.country}
                                    sourceType={source.category}
                                    source={source}
                                    profile={{ ...profile, roleLabel: undefined }}
                                    profileInformationLabel={profileInformationLabel}
                                    compact={true}
                                />
                            </div>
                            {platformContext.isPlatform && (
                                <div className="mt-5 border-t border-gray-200 pt-5 dark:border-white/10">
                                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('source_platform_context_title')}</div>
                                    <dl className="mt-3 space-y-3 text-sm">
                                        <div className="grid grid-cols-[100px_1fr] gap-3">
                                            <dt className="font-medium text-gray-500">{t('source_platform_label')}</dt>
                                            <dd className="font-semibold text-gray-900 dark:text-white">{platformContext.platformLabel}</dd>
                                        </div>
                                        {platformContext.actorName && (
                                            <div className="grid grid-cols-[100px_1fr] gap-3">
                                                <dt className="font-medium text-gray-500">
                                                    {t(`source_actor_${(platformContext.actorType ?? 'ACCOUNT').toLowerCase()}`)}
                                                </dt>
                                                <dd className="text-gray-900 dark:text-white">
                                                    {platformContext.actorUrl ? (
                                                        <a href={platformContext.actorUrl} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">
                                                            {platformContext.actorName}
                                                        </a>
                                                    ) : <span className="font-semibold">{platformContext.actorName}</span>}
                                                    {platformContext.handle && platformContext.handle !== platformContext.actorName && (
                                                        <span className="ml-2 text-gray-500">{platformContext.handle}</span>
                                                    )}
                                                </dd>
                                            </div>
                                        )}
                                        {platformContext.actorDescription && (
                                            <div className="grid grid-cols-[100px_1fr] gap-3">
                                                <dt className="font-medium text-gray-500">{t('source_actor_info')}</dt>
                                                <dd className="leading-6 text-gray-700 dark:text-gray-300">{platformContext.actorDescription}</dd>
                                            </div>
                                        )}
                                        {platformContext.contentTitle && (
                                            <div className="grid grid-cols-[100px_1fr] gap-3">
                                                <dt className="font-medium text-gray-500">{t('source_platform_content')}</dt>
                                                <dd className="text-gray-900 dark:text-white">
                                                    {platformContext.contentUrl ? (
                                                        <a href={platformContext.contentUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                                            {platformContext.contentTitle}
                                                        </a>
                                                    ) : platformContext.contentTitle}
                                                </dd>
                                            </div>
                                        )}
                                    </dl>
                                </div>
                            )}
                        </section>

                        {/* 2. Ce que cette source apporte à l’article */}
                        {roleLabel && roleExplanationKey && (
                            <section data-source-section="article-role" className={SOURCE_SECTION_CLASS}>
                                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('source_role_in_article')}</div>
                                <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{roleLabel}</div>
                                <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{t(roleExplanationKey)}</p>
                            </section>
                        )}

                        {/* 3. Points de vigilance */}
                        {vigilanceItems.length > 0 && (
                            <section data-source-section="vigilance" className={SOURCE_SECTION_CLASS}>
                                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('source_section_vigilance')}</div>
                                <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                                    {vigilanceItems.map((limit) => (
                                        <li key={limit} className="flex gap-2.5">
                                            <span aria-hidden="true" className="mt-[0.65rem] h-1 w-1 shrink-0 rounded-full bg-gray-400 dark:bg-gray-500" />
                                            <span>{limit}</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {/* 4. Positionnement éditorial / réputation */}
                        {hasEditorialReputation && (
                            <section data-source-section="editorial-reputation" className={SOURCE_SECTION_CLASS}>
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('source_section_editorial_reputation')}</h3>
                                <dl className="mt-3 space-y-3 text-sm">
                                    {profile.editorialPositioning && <div><dt className="font-medium text-gray-500">{t('source_editorial_positioning')}</dt><dd className="mt-1 text-gray-800 dark:text-gray-200">{profile.editorialPositioning}</dd></div>}
                                    {profile.generalReputation && <div><dt className="font-medium text-gray-500">{t('source_documented_reputation')}</dt><dd className="mt-1 text-gray-800 dark:text-gray-200">{profile.generalReputation}</dd></div>}
                                    {profile.editorialPolicy && <div><dt className="font-medium text-gray-500">{t('source_editorial_policy')}</dt><dd className="mt-1 text-gray-800 dark:text-gray-200">{profile.editorialPolicy}</dd></div>}
                                    {profile.correctionHistory && <div><dt className="font-medium text-gray-500">{t('source_documented_corrections')}</dt><dd className="mt-1 text-gray-800 dark:text-gray-200">{profile.correctionHistory}</dd></div>}
                                    {profile.reliabilitySignals.length > 0 && <ProfileSignalList title={t('source_reliability_signals')} items={profile.reliabilitySignals} />}
                                    {profile.misinformationSignals.length > 0 && <ProfileSignalList title={t('source_contextualize_signals')} items={profile.misinformationSignals} />}
                                </dl>
                            </section>
                        )}

                        {/* 5. Références utilisées */}
                        {profile.references.length > 0 && (
                            <section data-source-section="references" className={SOURCE_SECTION_CLASS}>
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('source_section_references')}</h3>
                                <ul className="mt-3 space-y-2">
                                    {profile.references.map((reference, index) => (
                                        <li key={`${reference.label}-${index}`} className="border-l-2 border-gray-200 py-1 pl-3 text-sm dark:border-white/15">
                                            {reference.url ? <a href={reference.url} target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 hover:underline dark:text-white">{reference.label}</a> : <span className="font-medium text-gray-900 dark:text-white">{reference.label}</span>}
                                            {(reference.publisher || reference.referenceType) && <p className="mt-1 text-xs text-gray-500">{[reference.publisher, reference.referenceType].filter(Boolean).join(' · ')}</p>}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {hasTechnicalDetails && (
                            <details data-source-technical-details className="group border-t border-gray-200 pt-5 dark:border-white/10">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-1 text-xs font-bold uppercase tracking-wide text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:text-gray-300 dark:focus-visible:ring-white/20 [&::-webkit-details-marker]:hidden">
                                    <span>{t('support_technical_details')}</span>
                                    <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
                                </summary>
                                <div className="mt-4">
                                    <p className="max-w-2xl text-xs leading-5 text-gray-600 dark:text-gray-300">{t('source_technical_intro_v2')}</p>
                                    <TechnicalStatusLegend />

                                    <div className="mt-4 space-y-4">
                                        <TechnicalFunctionGroup
                                            id="source-profile"
                                            title={t('source_technical_group_profile_title')}
                                            description={t('source_technical_group_profile_description')}
                                        >
                                            <TechnicalSystemRow
                                                id="profile-data"
                                                title={t('source_technical_profile_plain_title')}
                                                technicalName="Source.profileData"
                                                status={technical.hasProfileLayer ? 'used' : 'global'}
                                                description={t(technical.hasProfileLayer ? 'source_technical_profile_plain_used' : 'source_technical_profile_plain_global')}
                                            >
                                                {technical.profileMethodVersion && <TechnicalRow label={t('source_technical_method_version')} value={<TechnicalCode code={technical.profileMethodVersion} />} />}
                                                {profileVersion && <TechnicalRow label={t('source_profile_version')} value={String(profileVersion)} />}
                                                {profileConfidence && <TechnicalRow label={t('source_profile_confidence_title')} value={<TechnicalCode code={profileConfidence} />} />}
                                            </TechnicalSystemRow>

                                            <TechnicalSystemRow
                                                id="profile-history"
                                                title={t('source_technical_profile_history_title')}
                                                technicalName="profileSnapshot / currentProfile"
                                                status={hasProfileCopies ? 'used' : 'global'}
                                                description={t(hasProfileCopies ? 'source_technical_profile_history_used' : 'source_technical_profile_history_global')}
                                            >
                                                <TechnicalRow label={t('source_technical_snapshot_plain')} value={technical.hasProfileSnapshot ? t('source_technical_present') : t('source_technical_not_exposed_short')} />
                                                <TechnicalRow label={t('source_technical_current_plain')} value={technical.hasCurrentProfile ? t('source_technical_present') : t('source_technical_not_exposed_short')} />
                                            </TechnicalSystemRow>

                                            <TechnicalSystemRow
                                                id="cold-profiler"
                                                title={t('source_technical_cold_profiler_plain_title')}
                                                technicalName="Cold Profiler"
                                                status="global"
                                                description={t('source_technical_cold_profiler_plain_description')}
                                            />
                                        </TechnicalFunctionGroup>

                                        <TechnicalFunctionGroup
                                            id="source-reputation"
                                            title={t('source_technical_group_reputation_title')}
                                            description={t('source_technical_group_reputation_description')}
                                        >
                                            <TechnicalSystemRow
                                                id="trust-score"
                                                title={t('source_technical_trust_score_plain_title')}
                                                technicalName="TrustScore / Source.trustScore"
                                                status={hasReputationSystem ? 'used' : 'global'}
                                                description={t(hasReputationSystem ? 'source_technical_trust_score_used' : 'source_technical_trust_score_global')}
                                            >
                                                <TechnicalRow label={t('source_technical_reliability_plain')} value={sourceReliability ? <TechnicalCode code={String(sourceReliability)} /> : t('source_technical_not_exposed_short')} />
                                                <TechnicalRow label={t('source_technical_public_label_plain')} value={publicTrustLabel ? <TechnicalCode code={String(publicTrustLabel)} /> : t('source_technical_not_exposed_short')} />
                                                {source.metrics && <TechnicalRow label={t('source_technical_signal_families')} value={t('source_technical_signal_families_value')} />}
                                                {typeof source.score === 'number' && <TechnicalRow secondary label={t('source_technical_score')} value={`${source.score}/100`} />}
                                            </TechnicalSystemRow>

                                            <TechnicalSystemRow
                                                id="trust-audit"
                                                title={t('source_technical_audit_plain_title')}
                                                technicalName="TrustScore cache / audit history / fact-check reputation"
                                                status="global"
                                                description={t('source_technical_audit_plain_description')}
                                            >
                                                <TechnicalRow label={t('source_technical_audit_inputs_plain')} value={t('source_technical_audit_inputs_value')} />
                                                <TechnicalRow label={t('source_technical_cache_plain')} value={t('source_technical_cache_value')} />
                                                <TechnicalRow label={t('source_technical_audit_history_plain')} value={t('source_technical_audit_history_value')} />
                                            </TechnicalSystemRow>

                                            <TechnicalSystemRow
                                                id="external-consensus"
                                                title={t('source_technical_consensus_plain_title')}
                                                technicalName="MBFC / AllSides / isConsensusVerified"
                                                status="global"
                                                description={t('source_technical_consensus_plain_description')}
                                            />
                                        </TechnicalFunctionGroup>

                                        <TechnicalFunctionGroup
                                            id="article-analysis"
                                            title={t('source_technical_group_article_title')}
                                            description={t('source_technical_group_article_description')}
                                        >
                                            <TechnicalSystemRow
                                                id="live-analysis"
                                                title={t('source_technical_live_plain_title')}
                                                technicalName="Live Analysis"
                                                status={technical.hasLiveAnalysisEvidence ? 'used' : 'global'}
                                                description={t(technical.hasLiveAnalysisEvidence
                                                    ? technical.hasArticleSourceRelation ? 'source_technical_live_plain_used' : 'source_technical_live_plain_used_legacy'
                                                    : 'source_technical_live_plain_global')}
                                                dataStatus={technical.hasLiveAnalysisEvidence ? 'observed' : 'not-attributable'}
                                            >
                                                {technical.searchLane && <TechnicalRow label={t('source_technical_search_lane')} value={<TechnicalCode code={technical.searchLane} label={technicalEnumLabel(t, 'source_search_lane', technical.searchLane)} />} />}
                                                {technical.provider && <TechnicalRow label={t('source_technical_provider')} value={<TechnicalCode code={technical.provider} label={technicalEnumLabel(t, 'source_provider', technical.provider)} />} />}
                                            </TechnicalSystemRow>

                                            <TechnicalSystemRow
                                                id="article-source"
                                                title={t('source_technical_article_source_plain_title')}
                                                technicalName="ArticleSource"
                                                status={technical.isImportedLegacy || (!technical.hasArticleSourceRelation && hasArticleUsage)
                                                    ? 'legacy_read'
                                                    : technical.hasArticleSourceRelation ? 'used' : 'global'}
                                                description={t(technical.hasArticleSourceRelation
                                                    ? technical.isImportedLegacy ? 'source_technical_article_source_imported' : 'source_technical_article_source_used'
                                                    : 'source_technical_article_source_global')}
                                            >
                                                {roleKey && <TechnicalRow label={t('source_technical_role')} value={<TechnicalCode code={roleKey} label={roleLabel ?? undefined} />} />}
                                                {technical.supportStrength && <TechnicalRow label={t('source_technical_support_strength')} value={<TechnicalCode code={technical.supportStrength} label={technicalEnumLabel(t, 'source_support_strength', technical.supportStrength)} />} />}
                                                {technical.provenance && <TechnicalRow label={t('source_technical_provenance')} value={<TechnicalCode code={technical.provenance} label={technicalEnumLabel(t, 'source_provenance', technical.provenance)} />} />}
                                            </TechnicalSystemRow>

                                            <TechnicalSystemRow
                                                id="source-extraction"
                                                title={t('source_technical_extraction_plain_title')}
                                                technicalName="extractionStatus / analysisStatus"
                                                status={extractionStatusLabel ? 'used' : 'global'}
                                                description={t(extractionStatusLabel ? 'source_technical_extraction_used' : 'source_technical_extraction_global')}
                                            >
                                                {extractionStatusLabel && <TechnicalRow label={t('source_extraction_status')} value={extractionStatusLabel} />}
                                            </TechnicalSystemRow>
                                        </TechnicalFunctionGroup>

                                        <TechnicalFunctionGroup
                                            id="profile-evidence"
                                            title={t('source_technical_group_evidence_title')}
                                            description={t('source_technical_group_evidence_description')}
                                        >
                                            <TechnicalSystemRow
                                                id="external-references"
                                                title={t('source_technical_external_plain_title')}
                                                technicalName="externalReferences"
                                                status={externalReferenceCount > 0 ? 'used' : 'global'}
                                                description={t(externalReferenceCount > 0 ? 'source_technical_external_used' : 'source_technical_external_global')}
                                            >
                                                <TechnicalRow label={t('source_technical_references_count')} value={String(externalReferenceCount)} />
                                            </TechnicalSystemRow>

                                            <TechnicalSystemRow
                                                id="claim-references"
                                                title={t('source_technical_claim_plain_title')}
                                                technicalName="claimReferences"
                                                status={technical.claimCount > 0 ? 'used' : 'global'}
                                                description={t(technical.claimCount > 0 ? 'source_technical_claim_used' : 'source_technical_claim_global')}
                                            >
                                                <TechnicalRow label={t('source_technical_claim_reference_counts_label')} value={t('source_technical_claim_reference_counts')
                                                    .replace('{claims}', String(technical.claimCount))
                                                    .replace('{links}', String(technical.claimReferenceLinkCount))} />
                                            </TechnicalSystemRow>
                                        </TechnicalFunctionGroup>

                                        <TechnicalFunctionGroup
                                            id="compatibility"
                                            title={t('source_technical_group_compatibility_title')}
                                            description={t('source_technical_group_compatibility_description')}
                                        >
                                            <TechnicalSystemRow
                                                id="source-corpus-alias"
                                                title={t('source_technical_corpus_plain_title')}
                                                technicalName="sources / factCheckData.sources"
                                                status="compatibility"
                                                description={t('source_technical_corpus_plain_description')}
                                            />

                                            <TechnicalSystemRow
                                                id="score-aliases"
                                                title={t('source_technical_score_aliases_plain_title')}
                                                technicalName="metadata.dbScore / dbScore"
                                                status="legacy_read"
                                                description={t('source_technical_score_aliases_plain_description')}
                                            >
                                                {technical.legacyAliases.length > 0 && <TechnicalRow label={t('source_technical_detected_aliases')} value={technical.legacyAliases.map((alias) => <TechnicalCode key={alias} code={alias} />)} />}
                                            </TechnicalSystemRow>

                                            <TechnicalSystemRow
                                                id="legacy-profile-location"
                                                title={t('source_technical_legacy_profile_plain_title')}
                                                technicalName="Source.metadata.profileData"
                                                status="legacy_read"
                                                description={t('source_technical_legacy_profile_plain_description')}
                                            />

                                            {technical.isImportedLegacy && (
                                                <TechnicalSystemRow
                                                    id="imported-legacy"
                                                    title={t('source_technical_imported_plain_title')}
                                                    technicalName="IMPORTED_LEGACY"
                                                    status="legacy_read"
                                                    description={t('source_technical_imported_plain_description')}
                                                />
                                            )}
                                        </TechnicalFunctionGroup>
                                    </div>
                                </div>
                            </details>
                        )}

                        <Link to="/transparence/sources" className="inline-flex text-xs font-medium text-gray-600 underline decoration-gray-300 underline-offset-4 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white">
                            {t('source_transparency_link')}
                        </Link>

                        {/* 2. Unified Trust Analysis (Replacement for Pillars + Transparency) */}
                        {/* Fallback Justification if no explanation */}
                        {!source.explanation && source.justification && (
                            <div className="pt-2 border-t border-gray-200 dark:border-white/5">
                                <p className="text-xs text-gray-600 dark:text-gray-400 italic">
                                    "{source.justification}"
                                </p>
                            </div>
                        )}

                    </div>
                </div>
            )}
        </div>
    );
}

function SourceLogo({ source }: { source: SourceData }) {
    const { t } = useI18n();
    const [imageFailed, setImageFailed] = useState(false);

    React.useEffect(() => setImageFailed(false), [source.logo]);

    const initials = getSourceInitials(source.name || source.domain);
    const showImage = Boolean(source.logo) && !imageFailed;

    return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5">
            {showImage ? (
                <img
                    src={source.logo}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => setImageFailed(true)}
                />
            ) : (
                <span
                    role="img"
                    aria-label={`${t('source_logo_fallback')} ${source.name}`}
                    className="text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300"
                >
                    {initials}
                </span>
            )}
        </div>
    );
}

function getSourceInitials(value: string): string {
    const cleaned = value
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .trim();
    const parts = cleaned.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (parts[0] ?? 'S').slice(0, 2).toUpperCase();
}

function TechnicalStatusLegend() {
    const { t } = useI18n();
    const statuses: TechnicalStatus[] = ['used', 'global', 'legacy_read', 'compatibility'];

    return (
        <div aria-label={t('source_technical_status_legend')} className="mt-3 flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.025]">
            <div className="w-full text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('source_technical_status_legend')}</div>
            {statuses.map((status) => <TechnicalStatusMark key={status} status={status} label={t(`source_technical_status_${status}`)} />)}
        </div>
    );
}

function TechnicalFunctionGroup({ id, title, description, children }: {
    id: string;
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <section data-technical-group={id} className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/[0.02]">
            <header className="border-b border-gray-200 bg-gray-50/75 px-4 py-3 dark:border-white/10 dark:bg-white/[0.035]">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h4>
                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{description}</p>
            </header>
            <div className="divide-y divide-gray-200 dark:divide-white/10">{children}</div>
        </section>
    );
}

function TechnicalSystemRow({ id, title, technicalName, status, description, dataStatus, children }: {
    id: string;
    title: string;
    technicalName: string;
    status: TechnicalStatus;
    description: string;
    dataStatus?: string;
    children?: React.ReactNode;
}) {
    const { t } = useI18n();

    return (
        <div data-technical-system={id} data-technical-status={status} {...(dataStatus ? { 'data-live-analysis-status': dataStatus } : {})} className="px-4 py-3.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{title}</div>
                    <code className="mt-1 inline-block font-mono text-[10px] text-gray-500 dark:text-gray-400">{technicalName}</code>
                </div>
                <TechnicalStatusMark status={status} label={t(`source_technical_status_${status}`)} />
            </div>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-gray-600 dark:text-gray-300">{description}</p>
            {children && <dl className="mt-2.5 divide-y divide-gray-100 border-t border-gray-100 text-xs dark:divide-white/5 dark:border-white/5">{children}</dl>}
        </div>
    );
}

function TechnicalStatusMark({ status, label }: { status: TechnicalStatus; label: string }) {
    const statusClass = status === 'used'
        ? 'text-emerald-700 dark:text-emerald-300'
        : status === 'global'
            ? 'text-sky-700 dark:text-sky-300'
            : status === 'legacy_read'
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-slate-600 dark:text-slate-300';
    const dotClass = status === 'used'
        ? 'bg-emerald-500'
        : status === 'global'
            ? 'bg-sky-500'
            : status === 'legacy_read'
                ? 'bg-amber-500'
                : 'bg-slate-400';

    return (
        <span className={`inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold ${statusClass}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
            {label}
        </span>
    );
}

function TechnicalCode({ code, label }: { code: string; label?: string }) {
    return (
        <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
            {label && <span>{label}</span>}
            <code className="rounded bg-gray-200/70 px-1.5 py-0.5 font-mono text-[10px] text-gray-700 dark:bg-white/10 dark:text-gray-300">{code}</code>
        </span>
    );
}

function technicalEnumLabel(t: (key: string) => string, prefix: string, value: string): string | undefined {
    const key = `${prefix}_${value.toLowerCase()}`;
    const translated = t(key);
    return translated === key ? undefined : translated;
}

function TechnicalRow({ label, value, secondary = false }: { label: React.ReactNode; value: React.ReactNode; secondary?: boolean }) {
    return (
        <div className={`flex items-start justify-between gap-4 py-2.5 ${secondary ? 'opacity-75' : ''}`}>
            <dt className="font-medium text-gray-600 dark:text-gray-300">{label}</dt>
            <dd className="flex max-w-[60%] flex-wrap items-center justify-end gap-1.5 text-right text-gray-500 dark:text-gray-400">{value}</dd>
        </div>
    );
}

const SOURCE_ROLE_EXPLANATION_KEYS: Record<string, string> = {
    PRIMARY_EVIDENCE: 'source_role_primary_explanation',
    EVIDENCE: 'source_role_primary_explanation',
    PROOF: 'source_role_primary_explanation',
    SUPPORTING: 'source_role_primary_explanation',
    SUPPORT: 'source_role_primary_explanation',
    CONTEXT: 'source_role_context_explanation',
    BACKGROUND: 'source_role_background_explanation',
    COUNTERPOINT: 'source_role_counterpoint_explanation',
    OPPOSITION: 'source_role_counterpoint_explanation',
    CONTRADICTION: 'source_role_counterpoint_explanation',
    OFFICIAL_STATEMENT: 'source_role_official_explanation',
    QUOTE: 'source_role_quote_explanation',
    DATA: 'source_role_data_explanation',
};


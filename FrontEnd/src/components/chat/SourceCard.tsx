import React, { useState } from 'react';
import { ChevronDown, ShieldAlert } from 'lucide-react';
import { SourceIdentityCard } from './trust-score-ui/SourceIdentityCard';
import { deriveSupportLevelFromScore, getPublicSupportBadgeClass, getPublicSupportLabel } from '@/lib/score-labels';
import { useI18n } from '@/i18n/I18nContext';

import { extractPlatformSourceContext, extractStructuredSourceProfile, formatSourceRoleLabel, getPublicSourceTypeLabel, getSourceAnalysisLabel, getSourceRoleKey, isSourceAnalysisPending, readSourceAnalysisStatus, type SourceAnalysisStatus } from '@/lib/source-ui';
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
    logo: string;
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

function getCategoryStyle(category: string) {
    const cat = category.toUpperCase();
    const base = "border font-bold";
    if (['MEDIA', 'PRESSE'].includes(cat)) return `${base} bg-blue-100 text-gray-900 dark:bg-blue-900/50 dark:text-white border-blue-200`;
    if (['GOVERNMENT', 'OFFICIEL', 'GOUV'].includes(cat)) return `${base} bg-purple-100 text-gray-900 dark:bg-purple-900/50 dark:text-white border-purple-200`;
    if (['ACADEMIC', 'ACADEMIQUE', 'SCIENCE'].includes(cat)) return `${base} bg-indigo-100 text-gray-900 dark:bg-indigo-900/50 dark:text-white border-indigo-200`;
    if (['SOCIAL', 'RÉSEAU'].includes(cat)) return `${base} bg-orange-100 text-gray-900 dark:bg-orange-900/50 dark:text-white border-orange-200`;
    return `${base} bg-gray-100 text-gray-900 dark:bg-neutral-800 dark:text-white border-gray-200`;
}

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
    const publicType = getPublicSourceTypeLabel(source.category);
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
    const containerStyle = isOpen
        ? "border border-gray-300 ring-1 ring-inset ring-gray-200 shadow-sm bg-white dark:border-white/20 dark:ring-white/10 dark:bg-neutral-900 transition-all duration-300"
        : "border border-gray-200 bg-white dark:border-white/10 dark:bg-neutral-900";

    const InternalContent = () => (
        <div className="flex items-center gap-3 overflow-hidden">
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-white border border-gray-100 dark:bg-neutral-800 dark:border-neutral-700">
                <img
                    src={source.logo}
                    alt={source.name}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${source.name}&background=random&size=32`;
                    }}
                />
            </div>
            <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate">
                        {source.name}
                    </h4>
                    {publicType && (
                        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-white/5 dark:text-gray-300">
                            {publicType}
                        </span>
                    )}
                    {roleLabel && (
                        <span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-800 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-200">
                            {roleLabel}
                        </span>
                    )}
                    {source.flags?.hasFactCheckFailures && (
                        <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200 shrink-0">
                            <ShieldAlert className="w-3 h-3" />
                            Alertes
                        </span>
                    )}
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
            <div
                className="flex cursor-pointer items-center justify-between p-4"
                onClick={toggleExpanded}
            >
                <div className="flex-1 min-w-0 mr-4">
                    <InternalContent />
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    <ScoreBadge score={source.score} supportLevel={source.supportLevel} isEnriching={source.isEnriching} analysisStatus={source.analysisStatus} />
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
                <div className="animate-in slide-in-from-top-2 fade-in duration-200 border-t border-gray-100 p-4 bg-gray-50/50 dark:bg-white/5 dark:border-white/5">

                    <div className="space-y-6">
                        {/* 1. Informations sur la source */}
                        <SourceIdentityCard
                            name={source.name}
                            description={source.description}
                            country={source.country}
                            sourceType={source.category}
                            source={source}
                            profile={{ ...profile, roleLabel: undefined }}
                            compact={true}
                        />
                        {platformContext.isPlatform && (
                            <section className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
                                <div className="text-xs font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-300">{t('source_platform_context_title')}</div>
                                <dl className="mt-3 space-y-3 text-sm">
                                    <div className="grid grid-cols-[100px_1fr] gap-3">
                                        <dt className="font-medium text-sky-800/70 dark:text-sky-200/70">{t('source_platform_label')}</dt>
                                        <dd className="font-semibold text-sky-950 dark:text-sky-100">{platformContext.platformLabel}</dd>
                                    </div>
                                    {platformContext.actorName && (
                                        <div className="grid grid-cols-[100px_1fr] gap-3">
                                            <dt className="font-medium text-sky-800/70 dark:text-sky-200/70">
                                                {t(`source_actor_${(platformContext.actorType ?? 'ACCOUNT').toLowerCase()}`)}
                                            </dt>
                                            <dd className="text-sky-950 dark:text-sky-100">
                                                {platformContext.actorUrl ? (
                                                    <a href={platformContext.actorUrl} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">
                                                        {platformContext.actorName}
                                                    </a>
                                                ) : <span className="font-semibold">{platformContext.actorName}</span>}
                                                {platformContext.handle && platformContext.handle !== platformContext.actorName && (
                                                    <span className="ml-2 text-sky-800/70 dark:text-sky-200/70">{platformContext.handle}</span>
                                                )}
                                            </dd>
                                        </div>
                                    )}
                                    {platformContext.actorDescription && (
                                        <div className="grid grid-cols-[100px_1fr] gap-3">
                                            <dt className="font-medium text-sky-800/70 dark:text-sky-200/70">{t('source_actor_info')}</dt>
                                            <dd className="leading-6 text-sky-950/80 dark:text-sky-100/80">{platformContext.actorDescription}</dd>
                                        </div>
                                    )}
                                    {platformContext.contentTitle && (
                                        <div className="grid grid-cols-[100px_1fr] gap-3">
                                            <dt className="font-medium text-sky-800/70 dark:text-sky-200/70">{t('source_platform_content')}</dt>
                                            <dd className="text-sky-950 dark:text-sky-100">
                                                {platformContext.contentUrl ? (
                                                    <a href={platformContext.contentUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                                        {platformContext.contentTitle}
                                                    </a>
                                                ) : platformContext.contentTitle}
                                            </dd>
                                        </div>
                                    )}
                                </dl>
                            </section>
                        )}

                        {/* 2. Ce que cette source apporte à l’article */}
                        {roleLabel && roleExplanationKey && (
                            <section className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                                <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">{t('source_role_in_article')}</div>
                                <div className="mt-2 text-sm font-semibold text-indigo-950 dark:text-indigo-100">{roleLabel}</div>
                                <p className="mt-1 text-sm leading-6 text-indigo-950/75 dark:text-indigo-100/75">{t(roleExplanationKey)}</p>
                            </section>
                        )}

                        {/* 3. Points de vigilance */}
                        {vigilanceItems.length > 0 && (
                            <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                                <div className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">{t('source_section_vigilance')}</div>
                                <ul className="mt-2 space-y-2 text-sm leading-5 text-amber-950/80 dark:text-amber-100/80">
                                    {vigilanceItems.map((limit) => <li key={limit}>• {limit}</li>)}
                                </ul>
                            </section>
                        )}

                        {/* 4. Positionnement éditorial / réputation */}
                        {hasEditorialReputation && (
                            <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-neutral-900">
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
                            <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-neutral-900">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('source_section_references')}</h3>
                                <ul className="mt-3 space-y-2">
                                    {profile.references.map((reference, index) => (
                                        <li key={`${reference.label}-${index}`} className="rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-white/5">
                                            {reference.url ? <a href={reference.url} target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 hover:underline dark:text-white">{reference.label}</a> : <span className="font-medium text-gray-900 dark:text-white">{reference.label}</span>}
                                            {(reference.publisher || reference.referenceType) && <p className="mt-1 text-xs text-gray-500">{[reference.publisher, reference.referenceType].filter(Boolean).join(' · ')}</p>}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {typeof source.score === 'number' && (
                            <details className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-neutral-900">
                                <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">Détails techniques</summary>
                                <div className="mt-3">
                                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                                    {t('source_profile_confidence_title')} : {profileConfidence ? t(`source_profile_confidence_${profileConfidence.toLowerCase()}`) : t('source_profile_confidence_unknown')}
                                </p>
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
                                        Score backend de la source
                                    </span>
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                        {source.score}/100
                                    </span>
                                </div>
                                <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                                    Valeur technique fournie directement par le backend. Elle ne représente pas une probabilité de vérité.
                                </p>
                                </div>
                            </details>
                        )}

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


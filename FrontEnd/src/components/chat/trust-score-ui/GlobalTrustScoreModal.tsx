import React from 'react';
import { AlertTriangle, Compass, ShieldCheck } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useI18n } from '@/i18n/I18nContext';
import { getPublicSupportLabel } from '@/lib/score-labels';

type LightAnalysis = {
    supportLevel: 'strong' | 'nuanced' | 'fragile' | 'unverified';
    sourceQualitySummary: {
        totalSources: number;
        usableSources: number;
        uniqueDomains: number;
        profiledSourceCount: number;
        metadataOnlyCount: number;
        unavailableCount: number;
        profileCoverage: number;
    };
    sourceUsageSummary: {
        primaryEvidenceCount: number;
        officialStatementCount: number;
        contextCount: number;
        counterpointCount: number;
        backgroundCount: number;
        unknownRoleCount: number;
        hasPrimaryEvidence: boolean;
        domainDiversity: 'LOW' | 'MEDIUM' | 'HIGH';
    };
    limitations: string[];
    uncertainties: string[];
    analysisConfidence: 'LOW' | 'MEDIUM' | 'HIGH';
    deepAnalysisAvailable: boolean;
    deepAnalysisRecommended: boolean;
    requiresDeepAnalysis?: boolean;
    deepAnalysisReasons: string[];
};

interface GlobalTrustScoreModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: {
        sources: Array<{ id?: number; dbScore?: number; reliability?: string; publishedAt?: string }>;
        globalScore: number | null;
        sourceScore: number | null;
        aiScore: number | null;
        lightAnalysis?: LightAnalysis | null;
        liveAnalysis?: {
            contentIntent: string;
            intentReasoning?: string;
            pillarScores: Record<string, { score: number; quote?: string; reasoning: string }>;
            correctiveNotes?: string[];
        } | null;
    };
}

const REASON_KEYS: Record<string, string> = {
    INSUFFICIENT_USABLE_SOURCES: 'support_reason_insufficient_sources',
    INSUFFICIENT_SOURCES: 'support_reason_insufficient_sources',
    LOW_DOMAIN_DIVERSITY: 'support_reason_low_diversity',
    NO_PRIMARY_OR_OFFICIAL_SOURCE: 'support_reason_no_primary',
    NO_PRIMARY_EVIDENCE: 'support_reason_no_primary',
    UNKNOWN_SOURCE_PROFILE: 'support_reason_unknown_source',
    UNKNOWN_SOURCE: 'support_reason_unknown_source',
    PROFILE_COVERAGE_PARTIAL: 'support_reason_weak_profiles',
    WEAK_SOURCE_PROFILE: 'support_reason_weak_profiles',
    SOURCE_PROFILE_INCOMPLETE: 'support_reason_weak_profiles',
    LOW_SOURCE_REPUTATION: 'support_reason_unknown_source',
    INCOMPLETE_SOURCE_EXTRACTION: 'support_reason_incomplete_extraction',
    INCOMPLETE_EXTRACTION: 'support_reason_incomplete_extraction',
    ARTICLE_ANALYSIS_STALE: 'support_reason_stale',
    STALE_ANALYSIS: 'support_reason_stale',
    LOW_LIGHT_CONFIDENCE: 'support_reason_low_confidence',
    LIGHT_ANALYSIS_ERROR: 'support_reason_error',
    LIGHT_ANALYSIS_UNAVAILABLE: 'support_reason_error',
};

export function GlobalTrustScoreModal({ isOpen, onClose, data }: GlobalTrustScoreModalProps) {
    const { t } = useI18n();
    const backendScore = Number.isFinite(data.globalScore) && data.globalScore > 0 ? data.globalScore : null;
    const light = data.lightAnalysis;
    const label = getPublicSupportLabel({ supportLevel: light?.supportLevel, backendScore });
    const recommended = light?.deepAnalysisRecommended ?? light?.requiresDeepAnalysis ?? false;
    const quality = light?.sourceQualitySummary;
    const usage = light?.sourceUsageSummary;
    const limitations = [...new Set(light?.limitations ?? [])];
    const uncertainties = [...new Set(light?.uncertainties ?? [])];
    const metrics = [
        metric(quality?.usableSources, t('support_metric_usable')),
        metric(quality?.uniqueDomains, t('support_metric_domains')),
        metric(usage?.primaryEvidenceCount, t('support_metric_primary')),
        metric(usage?.officialStatementCount, t('support_metric_official')),
        metric(usage?.counterpointCount, t('support_metric_counterpoints')),
    ].filter((item): item is { value: number; label: string } => item !== null);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('support_modal_title')} size="large">
            <div className="mx-auto max-w-2xl space-y-5 px-2 py-4">
                <div className="rounded-2xl border border-black/10 bg-black/5 p-6 text-center dark:border-white/10 dark:bg-white/5">
                    <ShieldCheck className="mx-auto mb-3 h-6 w-6" />
                    <div className="text-xs font-bold uppercase tracking-wider text-gray-500">{t('support_level')}</div>
                    <div className="mt-2 text-2xl font-bold">{label}</div>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{t(`support_explanation_${light?.supportLevel ?? 'legacy'}`)}</p>
                    {light && <p className="mt-2 text-xs text-gray-500">{t('support_confidence')} : {t(`support_confidence_${light.analysisConfidence.toLowerCase()}`)}</p>}
                </div>

                {light && metrics.length > 0 && (
                    <section>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('support_source_structure')}</h3>
                        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                            {metrics.map((item) => <Metric key={item.label} value={item.value} label={item.label} />)}
                        </div>
                        <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">{t('support_structure_explanation')}</p>
                    </section>
                )}

                {limitations.length > 0 && (
                    <ExplanationSection title={t('support_known_limits')} items={limitations.map(translateReason(t))} />
                )}

                {uncertainties.length > 0 && (
                    <ExplanationSection title={t('support_uncertainties')} items={uncertainties.map(translateReason(t))} />
                )}

                {light && (
                    <section className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                        <div className="flex items-center gap-2 text-sm font-semibold text-indigo-950 dark:text-indigo-200"><Compass className="h-4 w-4" />{recommended ? t('support_deep_recommended') : t('support_deep_available')}</div>
                        <p className="mt-2 text-sm text-indigo-950/75 dark:text-indigo-100/75">
                            {recommended ? t('support_deep_recommended_intro') : t('support_deep_available_intro')}
                        </p>
                        {recommended && light.deepAnalysisReasons.length > 0 && (
                            <ul className="mt-3 space-y-2 text-sm text-indigo-950/80 dark:text-indigo-100/80">
                                {light.deepAnalysisReasons.map((reason) => <li key={reason}>• {t(REASON_KEYS[reason] ?? 'support_reason_other')}</li>)}
                            </ul>
                        )}
                        <p className="mt-3 text-xs text-indigo-950/60 dark:text-indigo-100/60">
                            {light.deepAnalysisAvailable ? t('support_deep_available_all') : t('support_deep_unavailable')}
                        </p>
                    </section>
                )}

                {backendScore !== null && (
                    <details className="rounded-xl border border-gray-200 p-4 dark:border-white/10">
                        <summary className="cursor-pointer text-sm font-semibold">{t('support_technical_details')}</summary>
                        <p className="mt-3 text-sm">{t('support_backend_score')} : {backendScore}/100</p>
                        <p className="mt-2 text-xs text-gray-500">{t('support_score_disclaimer')}</p>
                    </details>
                )}

                <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                    <AlertTriangle size={14} />
                    <p>{t('support_disclaimer')}</p>
                </div>
            </div>
        </Modal>
    );
}

function ExplanationSection({ title, items }: { title: string; items: string[] }) {
    return (
        <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
            <div className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4" />{title}</div>
            <ul className="mt-3 space-y-2 text-sm opacity-80">{items.map((item) => <li key={item}>• {item}</li>)}</ul>
        </section>
    );
}

function Metric({ value, label }: { value: number; label: string }) {
    return (
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-white/10 dark:bg-neutral-900">
            <div className="text-xl font-semibold text-gray-950 dark:text-white">{value}</div>
            <div className="mt-1 text-[11px] leading-4 text-gray-500 dark:text-gray-400">{label}</div>
        </div>
    );
}

function translateReason(t: (key: string) => string) {
    return (reason: string) => t(REASON_KEYS[reason] ?? 'support_reason_other');
}

function metric(value: unknown, label: string): { value: number; label: string } | null {
    return typeof value === 'number' && Number.isFinite(value) ? { value, label } : null;
}

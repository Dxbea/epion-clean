import React from 'react';
import { extractStructuredSourceProfile, type StructuredSourceProfile } from '@/lib/source-ui';
import { useI18n } from '@/i18n/I18nContext';

interface SourceIdentityCardProps {
    name: string;
    description?: string | null;
    owner?: string;
    country?: string;
    politicalBias?: string;
    sourceType?: string;
    articleRole?: string | null;
    source?: Record<string, any>;
    profile?: StructuredSourceProfile;
    compact?: boolean;
}

export function SourceIdentityCard({ name, description, country, sourceType, articleRole, source, profile, compact = false }: SourceIdentityCardProps) {
    const { t } = useI18n();
    const extractedProfile = profile ?? extractStructuredSourceProfile({
        ...(source ?? {}),
        description: description ?? source?.description,
        country: country ?? source?.country,
        category: sourceType ?? source?.category,
        articleRole: articleRole ?? source?.articleRole,
    });

    const hasSummaryFields = Boolean(
        extractedProfile.countryLabel
        || extractedProfile.typeLabel
        || extractedProfile.description
        || extractedProfile.analyzedAtLabel
        || Object.values(extractedProfile.sourceFacts).some(Boolean)
    );

    if (!hasSummaryFields) return null;

    return (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-neutral-900">
            <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">{t('source_section_information')}</h3>
            {!compact && <p className="mb-4 text-base font-semibold text-gray-900 dark:text-white">{name}</p>}
            <dl className="space-y-3 text-sm">
                {extractedProfile.sourceFacts.ownership && (
                    <div className="grid grid-cols-[130px_1fr] gap-3">
                        <dt className="font-medium text-gray-500">{t('source_fact_ownership')}</dt>
                        <dd className="text-gray-800 dark:text-gray-200">{extractedProfile.sourceFacts.ownership}</dd>
                    </div>
                )}
                {extractedProfile.sourceFacts.businessModel && (
                    <div className="grid grid-cols-[130px_1fr] gap-3">
                        <dt className="font-medium text-gray-500">{t('source_fact_business_model')}</dt>
                        <dd className="text-gray-800 dark:text-gray-200">{extractedProfile.sourceFacts.businessModel}</dd>
                    </div>
                )}
                {extractedProfile.sourceFacts.specialty && (
                    <div className="grid grid-cols-[130px_1fr] gap-3">
                        <dt className="font-medium text-gray-500">{t('source_fact_specialty')}</dt>
                        <dd className="text-gray-800 dark:text-gray-200">{extractedProfile.sourceFacts.specialty}</dd>
                    </div>
                )}
                {extractedProfile.sourceFacts.coverageArea && (
                    <div className="grid grid-cols-[130px_1fr] gap-3">
                        <dt className="font-medium text-gray-500">{t('source_fact_coverage')}</dt>
                        <dd className="text-gray-800 dark:text-gray-200">{extractedProfile.sourceFacts.coverageArea}</dd>
                    </div>
                )}
                {extractedProfile.countryLabel && (
                    <div className="grid grid-cols-[90px_1fr] gap-3">
                        <dt className="font-medium text-gray-500">Pays</dt>
                        <dd className="text-gray-800 dark:text-gray-200">{extractedProfile.countryLabel}</dd>
                    </div>
                )}
                {extractedProfile.typeLabel && (
                    <div className="grid grid-cols-[90px_1fr] gap-3">
                        <dt className="font-medium text-gray-500">Type</dt>
                        <dd className="text-gray-800 dark:text-gray-200">{extractedProfile.typeLabel}</dd>
                    </div>
                )}
                {extractedProfile.description && (
                    <div className="grid grid-cols-[90px_1fr] gap-3">
                        <dt className="font-medium text-gray-500">Description</dt>
                        <dd className="leading-relaxed text-gray-700 dark:text-gray-300">{extractedProfile.description}</dd>
                    </div>
                )}
                {extractedProfile.analyzedAtLabel && (
                    <div className="grid grid-cols-[90px_1fr] gap-3">
                        <dt className="font-medium text-gray-500">Dernière analyse</dt>
                        <dd className="text-gray-800 dark:text-gray-200">{extractedProfile.analyzedAtLabel}</dd>
                    </div>
                )}
            </dl>
        </div>
    );
}

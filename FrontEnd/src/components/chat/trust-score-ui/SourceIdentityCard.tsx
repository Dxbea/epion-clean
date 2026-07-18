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
    profileInformationLabel?: string;
    compact?: boolean;
}

export function SourceIdentityCard({ name, description, country, sourceType, articleRole, source, profile, profileInformationLabel, compact = false }: SourceIdentityCardProps) {
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
        || profileInformationLabel
        || Object.values(extractedProfile.sourceFacts).some(Boolean)
    );

    if (!hasSummaryFields) return null;

    const locationParts = [extractedProfile.countryLabel, extractedProfile.sourceFacts.coverageArea]
        .filter((value): value is string => Boolean(value));
    const locationLabel = [...new Set(locationParts)].join(' · ');

    return (
        <section className="border-t border-gray-200 pt-5 dark:border-white/10">
            <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">{t('source_section_information')}</h3>
            {!compact && <p className="mb-4 text-base font-semibold text-gray-900 dark:text-white">{name}</p>}
            <div className="text-sm">
                {extractedProfile.description && (
                    <div data-source-information-item className="pb-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('source_fact_description')}</h4>
                        <p className="mt-2 leading-6 text-gray-700 dark:text-gray-300">{extractedProfile.description}</p>
                    </div>
                )}
                {profileInformationLabel && (
                    <div data-source-information-item className="border-t border-gray-200 py-4 dark:border-white/10">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('source_profile_information_title')}</h4>
                        <p className="mt-2 leading-6 text-gray-700 dark:text-gray-300">{profileInformationLabel}</p>
                    </div>
                )}
                <dl className="grid gap-x-6 sm:grid-cols-2">
                    {extractedProfile.sourceFacts.ownership && <FactBlock label={t('source_fact_ownership')} value={extractedProfile.sourceFacts.ownership} />}
                    {extractedProfile.sourceFacts.businessModel && <FactBlock label={t('source_fact_business_model')} value={extractedProfile.sourceFacts.businessModel} />}
                    {extractedProfile.sourceFacts.specialty && <FactBlock label={t('source_fact_specialty')} value={extractedProfile.sourceFacts.specialty} />}
                    {locationLabel && <FactBlock label={t('source_fact_location')} value={locationLabel} />}
                    {extractedProfile.typeLabel && <FactBlock label={t('source_fact_type')} value={extractedProfile.typeLabel} />}
                    {extractedProfile.analyzedAtLabel && <FactBlock label={t('source_fact_last_analysis')} value={extractedProfile.analyzedAtLabel} />}
                </dl>
            </div>
        </section>
    );
}

function FactBlock({ label, value }: { label: string; value: string }) {
    return (
        <div data-source-fact className="border-t border-gray-200 py-3 dark:border-white/10">
            <dt className="text-xs font-medium text-gray-500">{label}</dt>
            <dd className="mt-1.5 leading-5 text-gray-800 dark:text-gray-200">{value}</dd>
        </div>
    );
}

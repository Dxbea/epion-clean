import React from 'react';
import { extractStructuredSourceProfile, type StructuredSourceProfile } from '@/lib/source-ui';

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

function ProfileList({ title, items, cautious = false }: { title: string; items: string[]; cautious?: boolean }) {
    if (items.length === 0) return null;

    return (
        <div className="space-y-1.5">
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</dt>
            {cautious && (
                <dd className="text-xs leading-5 text-gray-500 dark:text-gray-400">Éléments signalés par l’analyse.</dd>
            )}
            <dd>
                <ul className="space-y-1.5">
                    {items.map((item, index) => (
                        <li key={`${title}-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-5 text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                            {item}
                        </li>
                    ))}
                </ul>
            </dd>
        </div>
    );
}

export function SourceIdentityCard({ name, description, country, sourceType, articleRole, source, profile, compact = false }: SourceIdentityCardProps) {
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
        || extractedProfile.roleLabel
        || extractedProfile.analyzedAtLabel
    );
    const hasListFields = extractedProfile.strengths.length > 0
        || extractedProfile.warnings.length > 0
        || extractedProfile.references.length > 0;

    if (!hasSummaryFields && !hasListFields) return null;

    return (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-neutral-900">
            {!compact && <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">{name}</h3>}
            <dl className="space-y-3 text-sm">
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
                {extractedProfile.roleLabel && (
                    <div className="grid grid-cols-[90px_1fr] gap-3">
                        <dt className="font-medium text-gray-500">Rôle dans l’article</dt>
                        <dd className="text-gray-800 dark:text-gray-200">{extractedProfile.roleLabel}</dd>
                    </div>
                )}
                {extractedProfile.analyzedAtLabel && (
                    <div className="grid grid-cols-[90px_1fr] gap-3">
                        <dt className="font-medium text-gray-500">Dernière analyse</dt>
                        <dd className="text-gray-800 dark:text-gray-200">{extractedProfile.analyzedAtLabel}</dd>
                    </div>
                )}
                <ProfileList title="Éléments favorables" items={extractedProfile.strengths} />
                <ProfileList title="Points de vigilance" items={extractedProfile.warnings} cautious />
                {extractedProfile.references.length > 0 && (
                    <div className="space-y-1.5">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Références du profil</dt>
                        <dd>
                            <ul className="space-y-1.5">
                                {extractedProfile.references.map((reference, index) => (
                                    <li key={`${reference.label}-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-5 text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                                        {reference.url ? (
                                            <a href={reference.url} target="_blank" rel="noopener noreferrer" className="hover:text-gray-950 hover:underline dark:hover:text-white">
                                                {reference.label}
                                            </a>
                                        ) : reference.label}
                                    </li>
                                ))}
                            </ul>
                        </dd>
                    </div>
                )}
            </dl>
        </div>
    );
}

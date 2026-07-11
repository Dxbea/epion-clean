import React from 'react';
import { getPublicSupportLabel } from '@/lib/score-labels';

interface UnifiedTrustCardProps {
    details: { transparency: number; editorial: number; semantic: number; logic: number };
    flags: { isAdsTxtValid: boolean; hasFactCheckFailures?: boolean };
    metadata: {
        name: string;
        country?: string;
        politicalBias?: string;
        explanation?: { formula: string; range?: string; qualityCursor?: string; penalties?: string[]; sources?: string[] };
        dbScore?: number;
        liveScore?: number;
        reliability?: string;
        justification?: string | null;
        description?: string | null;
    };
}

export function UnifiedTrustCard({ metadata }: UnifiedTrustCardProps) {
    const backendScore = typeof metadata.dbScore === 'number' ? metadata.dbScore : null;
    const references = Array.isArray(metadata.explanation?.sources) ? metadata.explanation.sources.filter(Boolean) : [];

    return (
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-neutral-900">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Profil source</div>
            <div className="mt-2 text-xl font-bold">{getPublicSupportLabel({ backendScore })}</div>
            {metadata.justification && <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{metadata.justification}</p>}
            {references.length > 0 && <p className="mt-3 text-xs text-gray-500">{references.length} référence{references.length > 1 ? 's' : ''} externe{references.length > 1 ? 's' : ''} structurée{references.length > 1 ? 's' : ''}.</p>}
            {backendScore !== null && (
                <details className="mt-4 rounded-lg border border-gray-200 p-3 dark:border-white/10">
                    <summary className="cursor-pointer text-sm font-semibold">Détails techniques</summary>
                    <p className="mt-2 text-sm">Score backend : {backendScore}/100</p>
                </details>
            )}
        </div>
    );
}

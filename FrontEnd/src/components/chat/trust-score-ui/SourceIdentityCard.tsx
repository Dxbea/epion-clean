import React from 'react';
import { Building2, Globe, Scale } from 'lucide-react';

interface SourceIdentityCardProps {
    name: string;
    description?: string | null;
    owner?: string; // Not yet in backend metadata, but requested by user. Will leave optional.
    country?: string;
    politicalBias?: string;
    compact?: boolean;
}

export function SourceIdentityCard({ name, description, country, politicalBias, compact = false }: SourceIdentityCardProps) {

    // 1. Clean Description (Remove [1], [2] artifacts)
    const cleanDescription = description
        ? description.replace(/\[\d+\]/g, '').trim()
        : "Description non disponible.";

    // 2. Format Badges
    const getBiasLabel = (bias: string) => {
        const b = bias?.toUpperCase();
        if (b === 'LEFT' || b === 'LEFT_CENTER') return { label: 'Gauche / Centre-G.', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' };
        if (b === 'RIGHT' || b === 'RIGHT_CENTER') return { label: 'Droite / Centre-D.', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' };
        if (b === 'CENTER') return { label: 'Centre (Neutre)', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' };
        return { label: 'Non Classé', color: 'bg-gray-100 text-gray-600' };
    };

    const biasInfo = politicalBias ? getBiasLabel(politicalBias) : null;
    const countryLabel = country === 'FR' ? 'France 🇫🇷' : country === 'US' ? 'USA 🇺🇸' : country || 'International 🌍';

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-gray-100 dark:border-white/5 shadow-sm">
            {/* Header: Title + Badges */}
            <div className={`flex flex-col md:flex-row ${compact ? 'md:justify-start' : 'md:items-center justify-between'} gap-4 mb-3`}>
                {!compact && (
                    <div className="flex items-center gap-3">
                        {/* Fallback Logo/Icon */}
                        <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-white/10 flex items-center justify-center font-serif font-bold text-xl text-gray-700 dark:text-white">
                            {name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white leading-tight">{name}</h3>
                        </div>
                    </div>
                )}

                <div className="flex flex-wrap gap-2">
                    {/* Country Badge */}
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-50 dark:bg-white/5 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-white/5">
                        <Globe className="w-3 h-3" />
                        {countryLabel}
                    </span>

                    {/* Bias Badge */}
                    {biasInfo && (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-transparent ${biasInfo.color}`}>
                            <Scale className="w-3 h-3" />
                            {biasInfo.label}
                        </span>
                    )}
                </div>
            </div>

            {/* Description */}
            <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed line-clamp-3 md:line-clamp-none">
                {cleanDescription}
            </p>
        </div>
    );
}

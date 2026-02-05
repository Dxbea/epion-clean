import React, { useState } from 'react';
import { ChevronDown, ShieldAlert, CheckCircle, Server } from 'lucide-react';
import { SourceIdentityCard } from './trust-score-ui/SourceIdentityCard';
import { UnifiedTrustCard } from './trust-score-ui/UnifiedTrustCard';
import { getScoreGradient, getBadgeStyle } from '@/lib/color-utils';

export interface SourceCriteria {
    label: string;
    value: string;
}

export interface SourceMetrics {
    transparency: number;
    editorial: number;
    semantic: number;
    ux: number;
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
    category: string;
    score: number;
    description?: string | null;
    criteria?: SourceCriteria[];
    metrics?: SourceMetrics;
    flags?: SourceFlags;
    justification?: string;
    // New Fields
    country?: string;
    politicalBias?: string;
    biasScore?: number;
    reliability?: string;
    explanation?: {
        formula: string;
        sources: string[];
        livePenalties: string[];
        pillarWeights: { [key: string]: string };
    };
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

function ScoreBadge({ score }: { score: number | null }) {
    if (score === null) {
        return (
            <div className="flex items-center gap-2 rounded-full px-2 py-1 bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/5 animate-pulse">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Analyse...
                </span>
                <div className="h-5 w-5 rounded-full bg-gray-200 dark:bg-white/20" />
            </div>
        );
    }
    const badgeStyle = getBadgeStyle(score);
    return (
        <div
            className="flex items-center gap-2 rounded-full px-2 py-1 transition-all duration-300"
            style={badgeStyle}
        >
            <span className="text-[10px] font-bold uppercase tracking-wider drop-shadow-sm">
                Fact Score
            </span>
            <div
                className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold backdrop-blur-sm shadow-inner"
                style={{
                    backgroundColor: 'rgba(255,255,255,0.25)',
                    color: '#FFFFFF'
                }}
            >
                {score}
            </div>
        </div>
    );
}

export default function SourceCard({ source, isFocused }: SourceCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const cardRef = React.useRef<HTMLDivElement>(null);
    const isPending = source.score === null;

    React.useEffect(() => {
        if (isFocused && cardRef.current) {
            cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setIsExpanded(true);
        }
    }, [isFocused]);

    const containerStyle = isFocused
        ? "border-2 border-[#00dc82] ring-1 ring-[#00dc82] shadow-lg bg-white dark:bg-neutral-900 transition-all duration-300"
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
                    <h4 className={`font-bold text-sm text-gray-900 dark:text-white truncate ${source.url ? 'group-hover:underline group-hover:text-epion-blue' : ''}`}>
                        {source.name}
                    </h4>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${getCategoryStyle(source.category)}`}>
                        {source.category}
                    </span>
                    {source.flags?.hasFactCheckFailures && (
                        <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200 shrink-0">
                            <ShieldAlert className="w-3 h-3" />
                            Alertes
                        </span>
                    )}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate w-full group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors">
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
                onClick={() => !isPending && setIsExpanded(!isExpanded)}
            >
                {source.url ? (
                    <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="group flex-1 min-w-0 mr-4 transition-opacity hover:opacity-80"
                        title="Lire l'article original"
                    >
                        <InternalContent />
                    </a>
                ) : (
                    <div className="flex-1 min-w-0 mr-4">
                        <InternalContent />
                    </div>
                )}

                <div className="flex items-center gap-3 shrink-0">
                    <ScoreBadge score={source.score} />
                    {!isPending && (
                        <ChevronDown
                            className={`h-5 w-5 text-gray-600 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                    )}
                </div>
            </div>

            {/* EXPANDED VIEW: COMPLETE TRANSPARENCY UI */}
            {isExpanded && !isPending && (
                <div className="animate-in slide-in-from-top-2 fade-in duration-200 border-t border-gray-100 p-4 bg-gray-50/50 dark:bg-white/5 dark:border-white/5">

                    <div className="space-y-6">
                        {/* 1. Identity & Description */}
                        <SourceIdentityCard
                            name={source.name}
                            description={source.description}
                            country={source.country}
                            politicalBias={source.politicalBias}
                            compact={true}
                        />

                        {/* 2. Unified Trust Analysis (Replacement for Pillars + Transparency) */}
                        {source.metrics && (
                            <UnifiedTrustCard
                                details={source.metrics}
                                flags={{
                                    ...source.flags,
                                    isAdsTxtValid: source.flags?.isAdsTxtValid ?? true
                                }}
                                metadata={{
                                    name: source.name,
                                    country: source.country,
                                    politicalBias: source.politicalBias,
                                    explanation: source.explanation,
                                    reliability: source.reliability,
                                    justification: source.justification
                                }}
                            />
                        )}

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


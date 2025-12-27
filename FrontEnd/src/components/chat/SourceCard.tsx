import React, { useState } from 'react';
import { ChevronDown, ShieldAlert, CheckCircle, Server } from 'lucide-react';

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
    url?: string; // AJOUT
    logo: string;
    category: string;
    score: number;
    description?: string;
    criteria?: SourceCriteria[];
    metrics?: SourceMetrics;
    flags?: SourceFlags;
    justification?: string;
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

import { getScoreColor, getScoreColorWithOpacity, getScoreGradient, createGlossyGradient, getBadgeStyle } from '@/lib/color-utils';

function ScoreBadge({ score }: { score: number }) {
    // Styles Standardisés (Vibrant - Texte Blanc)
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

// Mini Jauge pour la grille 2x2
const MiniGauge = ({ label, score, colorHex, bgClass }: { label: string, score: number, colorHex: string, bgClass: string }) => (
    <div className="flex flex-col gap-1">
        <div className="flex justify-between items-end">
            <span className="text-[10px] font-bold text-gray-900 dark:text-gray-100 uppercase">{label}</span>
            <span className="text-xs font-bold" style={{ color: colorHex }}>{score}/100</span>
        </div>
        <div className={`h-1.5 w-full rounded-full overflow-hidden ${bgClass}`}>
            <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${score}%`, backgroundImage: createGlossyGradient(colorHex) }}
            />
        </div>
    </div>
);

export default function SourceCard({ source, isFocused }: SourceCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const cardRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (isFocused && cardRef.current) {
            cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setIsExpanded(true);
        }
    }, [isFocused]);

    const containerStyle = isFocused
        ? "border-2 border-[#00dc82] ring-1 ring-[#00dc82] shadow-lg bg-white dark:bg-neutral-900 transition-all duration-300"
        : "border border-gray-200 bg-white dark:border-white/10 dark:bg-neutral-900";

    // Contenu interne (Logo + Texte)
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
                    {source.flags?.isAdsTxtValid && (
                        <span className="hidden sm:flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200 shrink-0">
                            <CheckCircle className="w-3 h-3" />
                            Ads.txt OK
                        </span>
                    )}
                    {source.flags?.isPlatform && (
                        <span className="hidden sm:flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-200 shrink-0">
                            <Server className="w-3 h-3" />
                            Hébergeur
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
            className={`w-full rounded-lg transition-all hover:shadow-md ${containerStyle}`}
        >
            {/* Header (Toujours visible) */}
            <div
                className="flex cursor-pointer items-center justify-between p-4"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {/* Gauche : Logo + Infos (Cliquable si URL) */}
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

                {/* Droite : Score Badge + Chevron */}
                <div className="flex items-center gap-3 shrink-0">
                    <ScoreBadge score={source.score} />
                    <ChevronDown
                        className={`h-5 w-5 text-gray-600 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                </div>
            </div>

            {/* Corps (Expandable) */}
            {isExpanded && (
                <div className="animate-in slide-in-from-top-2 fade-in duration-200 border-t border-gray-100 p-4 bg-white dark:bg-white/5 dark:border-white/5">
                    {source.description && (
                        <p className="mb-4 text-sm text-gray-900 dark:text-gray-300 italic font-medium">
                            "{source.description}"
                        </p>
                    )}

                    <div className="rounded-lg bg-white p-4 border border-gray-200 dark:bg-neutral-800 dark:border-white/5 transition-all shadow-sm">
                        <h5 className="mb-4 text-xs font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100 flex justify-between items-center">
                            Détail du Score
                            <span className="text-[10px] font-normal text-gray-500">Score V2</span>
                        </h5>

                        {/* Grille des 4 Piliers */}
                        {source.metrics ? (
                            <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-4">
                                <MiniGauge
                                    label="Transparence"
                                    score={source.metrics.transparency}
                                    colorHex="#3B82F6"
                                    bgClass="bg-blue-100 dark:bg-blue-900/20"
                                />
                                <MiniGauge
                                    label="Processus Éditorial"
                                    score={source.metrics.editorial}
                                    colorHex="#10B981"
                                    bgClass="bg-emerald-100 dark:bg-emerald-900/20"
                                />
                                <MiniGauge
                                    label="Sémantique"
                                    score={source.metrics.semantic}
                                    colorHex="#8B5CF6"
                                    bgClass="bg-purple-100 dark:bg-purple-900/20"
                                />
                                <MiniGauge
                                    label="Qualité UX"
                                    score={source.metrics.ux}
                                    colorHex="#F97316"
                                    bgClass="bg-orange-100 dark:bg-orange-900/20"
                                />
                            </div>
                        ) : (
                            // Fallback ancien système (Criteria) ou Vide
                            source.criteria && source.criteria.length > 0 ? (
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    {source.criteria.map((c, idx) => (
                                        <div key={idx} className="flex flex-col rounded-md bg-gray-50 p-2 text-center border border-gray-200 dark:bg-neutral-900 dark:border-white/5">
                                            <span className="text-[10px] uppercase text-gray-600 dark:text-gray-400 mb-0.5">{c.label}</span>
                                            <span className="text-xs font-bold text-gray-900 dark:text-white">{c.value}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-2 text-center">
                                    <p className="text-xs text-gray-500 italic">Détails métriques non disponibles pour cette source.</p>
                                </div>
                            )
                        )}

                        {/* Justification Footer */}
                        {(source.justification || (source.criteria && source.criteria.length > 0)) && (
                            <div className="mt-2 pt-3 border-t border-gray-100 dark:border-white/5">
                                <p className="text-xs text-gray-900 dark:text-emerald-400 font-medium leading-relaxed">
                                    {source.justification ? source.justification :
                                        "Cette source est classée selon nos critères de fiabilité V1."}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}


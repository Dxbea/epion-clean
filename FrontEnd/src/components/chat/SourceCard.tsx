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
    if (['MEDIA', 'PRESSE'].includes(cat)) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800';
    if (['GOVERNMENT', 'OFFICIEL', 'GOUV'].includes(cat)) return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800';
    if (['ACADEMIC', 'ACADEMIQUE', 'SCIENCE'].includes(cat)) return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800';
    if (['SOCIAL', 'RÉSEAU'].includes(cat)) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border border-orange-200 dark:border-orange-800';
    return 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-gray-400 border border-transparent';
}

function ScoreBadge({ score }: { score: number }) {
    let bgColorClass = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    let circleColorClass = 'bg-red-200 dark:bg-red-800/40 text-red-800 dark:text-red-100';

    if (score >= 80) {
        bgColorClass = 'bg-[#2C98A0] text-white';
        circleColorClass = 'bg-[#237a80] text-white';
    } else if (score >= 50) {
        bgColorClass = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
        circleColorClass = 'bg-amber-200 dark:bg-amber-800/40 text-amber-800 dark:text-amber-100';
    }

    return (
        <div className={`flex items-center gap-2 rounded-full px-2 py-1 ${bgColorClass}`}>
            <span className="text-[10px] font-bold uppercase tracking-wider">Fact Score</span>
            <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${circleColorClass}`}>
                {score}
            </div>
        </div>
    );
}

// Mini Jauge pour la grille 2x2
const MiniGauge = ({ label, score, colorClass, bgClass }: { label: string, score: number, colorClass: string, bgClass: string }) => (
    <div className="flex flex-col gap-1">
        <div className="flex justify-between items-end">
            <span className="text-[10px] font-medium text-gray-500 uppercase">{label}</span>
            <span className={`text-xs font-bold ${colorClass.replace('bg-', 'text-')}`}>{score}/100</span>
        </div>
        <div className={`h-1.5 w-full rounded-full overflow-hidden ${bgClass}`}>
            <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${score}%` }} />
        </div>
    </div>
);

export default function SourceCard({ source, isFocused }: SourceCardProps) {
    console.log('[SourceCard] Debug:', { name: source.name, metrics: source.metrics, flags: source.flags, criteria: source.criteria });
    const [isExpanded, setIsExpanded] = useState(false);
    const cardRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (isFocused && cardRef.current) {
            cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setIsExpanded(true);
        }
    }, [isFocused]);

    const containerStyle = isFocused
        ? "border-2 border-[#2C98A0] bg-[#2C98A0]/5 shadow-md shadow-[#2C98A0]/10 dark:bg-[#2C98A0]/10"
        : "border border-black/10 bg-white dark:border-white/10 dark:bg-neutral-900";

    return (
        <div
            ref={cardRef}
            className={`w-full rounded-lg transition-all hover:shadow-sm ${containerStyle}`}
        >
            {/* Header (Toujours visible) */}
            <div
                className="flex cursor-pointer items-center justify-between p-4"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {/* Gauche : Logo + Infos */}
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-gray-50 dark:bg-neutral-800">
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
                            <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate">{source.name}</h4>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${getCategoryStyle(source.category)}`}>
                                {source.category}
                            </span>

                            {/* Nouveaux Badges Flags */}
                            {source.flags?.hasFactCheckFailures && (
                                <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 shrink-0">
                                    <ShieldAlert className="w-3 h-3" />
                                    Alertes
                                </span>
                            )}
                            {source.flags?.isAdsTxtValid && (
                                <span className="hidden sm:flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">
                                    <CheckCircle className="w-3 h-3" />
                                    Ads.txt OK
                                </span>
                            )}
                            {source.flags?.isPlatform && (
                                <span className="hidden sm:flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 shrink-0">
                                    <Server className="w-3 h-3" />
                                    Hébergeur
                                </span>
                            )}
                        </div>
                        <span className="text-xs text-black/50 dark:text-white/50 truncate w-full">{source.domain}</span>
                    </div>
                </div>

                {/* Droite : Score Badge + Chevron */}
                <div className="flex items-center gap-3 shrink-0">
                    <ScoreBadge score={source.score} />
                    <ChevronDown
                        className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                </div>
            </div>

            {/* Corps (Expandable) */}
            {isExpanded && (
                <div className="animate-in slide-in-from-top-2 fade-in duration-200 border-t border-black/5 p-4 bg-gray-50/50 dark:bg-white/5 dark:border-white/5">
                    {source.description && (
                        <p className="mb-4 text-sm text-gray-700 dark:text-gray-300 italic">
                            "{source.description}"
                        </p>
                    )}

                    <div className="rounded-lg bg-white p-4 border border-black/5 dark:bg-neutral-800 dark:border-white/5 transition-all">
                        <h5 className="mb-4 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 flex justify-between items-center">
                            Détail du Score
                            <span className="text-[10px] font-normal text-gray-400">Score V2</span>
                        </h5>

                        {/* Grille des 4 Piliers */}
                        {source.metrics ? (
                            <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-4">
                                <MiniGauge
                                    label="Transparence"
                                    score={source.metrics.transparency}
                                    colorClass="bg-blue-500"
                                    bgClass="bg-blue-100 dark:bg-blue-900/20"
                                />
                                <MiniGauge
                                    label="Processus Éditorial"
                                    score={source.metrics.editorial}
                                    colorClass="bg-emerald-500"
                                    bgClass="bg-emerald-100 dark:bg-emerald-900/20"
                                />
                                <MiniGauge
                                    label="Sémantique"
                                    score={source.metrics.semantic}
                                    colorClass="bg-purple-500"
                                    bgClass="bg-purple-100 dark:bg-purple-900/20"
                                />
                                <MiniGauge
                                    label="Qualité UX"
                                    score={source.metrics.ux}
                                    colorClass="bg-orange-500"
                                    bgClass="bg-orange-100 dark:bg-orange-900/20"
                                />
                            </div>
                        ) : (
                            // Fallback ancien système (Criteria) ou Vide
                            source.criteria && source.criteria.length > 0 ? (
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    {source.criteria.map((c, idx) => (
                                        <div key={idx} className="flex flex-col rounded-md bg-gray-50 p-2 text-center border border-black/5 dark:bg-neutral-900 dark:border-white/5">
                                            <span className="text-[10px] uppercase text-gray-400 dark:text-gray-500 mb-0.5">{c.label}</span>
                                            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{c.value}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-2 text-center">
                                    <p className="text-xs text-gray-400 italic">Détails métriques non disponibles pour cette source.</p>
                                </div>
                            )
                        )}

                        {/* Justification Footer */}
                        {(source.justification || (source.criteria && source.criteria.length > 0)) && (
                            <div className="mt-2 pt-3 border-t border-black/5 dark:border-white/5">
                                <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium leading-relaxed">
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

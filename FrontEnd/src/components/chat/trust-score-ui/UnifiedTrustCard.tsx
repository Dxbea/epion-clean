import React, { useState } from 'react';
import { Anchor, Wind, ShieldCheck, Info, X, AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react';
import { createGlossyGradient } from '@/lib/color-utils';
import { TRUST_SCORE_RANGES } from '@/config/trust-constants';

interface UnifiedTrustCardProps {
    details: {
        transparency: number;
        editorial: number;
        semantic: number;
        ux: number;
    };
    flags: {
        isAdsTxtValid: boolean;
        hasFactCheckFailures?: boolean;
    };
    metadata: {
        name: string;
        country?: string;
        politicalBias?: string;
        explanation?: {
            formula: string;
            range?: string; // V2
            qualityCursor?: string; // V2
            penalties?: string[]; // V2
            // Legacy V1 compatibility
            sources?: string[];
        };
        dbScore?: number; // Optional passed prop if we have it, otherwise implied
        liveScore?: number; // Technical/Live score
        reliability?: string;
        justification?: string | null;
        description?: string | null;
    };
}

export function UnifiedTrustCard({ details, flags, metadata }: UnifiedTrustCardProps) {
    console.log('[UnifiedTrustCard] Received Metadata:', metadata);
    const { explanation, country, politicalBias, dbScore, reliability, justification } = metadata;
    const [activePillar, setActivePillar] = useState<'transparency' | 'editorial' | 'semantic' | 'ux' | null>(null);

    // Safety check
    if (!explanation) return null;

    const { formula, range, qualityCursor } = explanation;
    const penalties = explanation.penalties || [];
    const sources = explanation.sources || [];

    // Detect V2
    const isV2 = !!range;
    const isHybrid = formula.includes('70%');

    // --- Derived Scores ---
    // Analysis Score = Average of the 4 live pillars
    const analysisScore = Math.round(
        (details.transparency + details.editorial + details.semantic + details.ux) / 4
    );

    // Removed misplaced import

    // ...

    // Reputation Score = dbScore (or derive/fallback if needed)
    const getReputationFallback = (rel?: string) => {
        switch (rel) {
            case 'HIGH': return 95; // Middle of 80-100 range roughly
            case 'MIXED': return 60; // Middle of 45-79
            case 'LOW': return 30; // Middle of 20-44
            case 'PROPAGANDA': return 10; // Middle of 0-19
            default: return 50; // Neutral fallback for UNKNOWN
        }
    };

    // Use passed dbScore, or derive from reliability if missing (Legacy data support)
    const reputationScore = dbScore || getReputationFallback(reliability);

    // --- Helpers for Penalties & Justifications ---
    const parsePenalty = (text: string) => {
        const isBonus = text.includes('+');
        const isMalus = text.includes('-');
        return { text, type: isBonus ? 'bonus' : isMalus ? 'malus' : 'neutral' };
    };

    // Static Descriptions (Restored)
    const PILLAR_DESCRIPTIONS = {
        transparency: "Propriété et mentions légales",
        editorial: "Analyse de la fiabilité éditoriale",
        semantic: "Analyse du ton et du vocabulaire",
        ux: "Expérience utilisateur & Ergonomie"
    };

    const getJustification = (pillar: 'transparency' | 'editorial' | 'semantic' | 'ux', score: number) => {
        // 1. Check Specific Flags (Priority)
        if (pillar === 'editorial') {
            if (flags.hasFactCheckFailures) return { text: "Grave : Échecs Fact-Check détectés", type: 'error' as const };
            const citationBonus = penalties.find(p => p.includes('Citations'));
            if (citationBonus) return { text: citationBonus.replace('Citations & Liens :', 'Bonus Rigueur :'), type: 'success' as const };
        }
        if (pillar === 'ux') {
            const intrusiveness = penalties.find(p => p.includes('Intrusivité'));
            if (intrusiveness) return { text: intrusiveness, type: 'warning' as const };
        }
        if (pillar === 'semantic') {
            // Clickbait flag removed from Source level
        }
        if (pillar === 'transparency') {
            if (!flags.isAdsTxtValid) return { text: "Manque de transparence technique (Ads.txt)", type: 'warning' as const };
        }

        // 2. Default Score-Based Logic
        if (score >= 80) return { text: "Standards de qualité respectés.", type: 'success' as const };
        if (score >= 50) return { text: "Niveau moyen, quelques défauts.", type: 'info' as const };
        return { text: "Niveau critique, attention requise.", type: 'error' as const };
    };

    const getIconForType = (type: 'success' | 'warning' | 'error' | 'info') => {
        switch (type) {
            case 'success': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
            case 'warning': return <AlertTriangle className="w-4 h-4 text-orange-500" />;
            case 'error': return <AlertTriangle className="w-4 h-4 text-red-500" />;
            case 'info': return <HelpCircle className="w-4 h-4 text-blue-500" />;
        }
    };

    // --- Mini Pillar Renderer (Interactive) ---
    const renderInteractivePillar = (label: string, score: number, color: string, key: 'transparency' | 'editorial' | 'semantic' | 'ux') => {
        const isActive = activePillar === key;

        // Focus Mode: Hide others
        if (activePillar && !isActive) return null;

        return (
            <div className={`transition-all duration-300 ${isActive ? 'col-span-full' : ''}`}>
                <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${isActive ? 'text-sm text-gray-900 dark:text-white font-bold' : 'text-gray-600 dark:text-gray-400'}`}>
                            {label}
                        </span>
                        <button
                            onClick={() => setActivePillar(isActive ? null : key)}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                        >
                            {isActive ? <div className="bg-gray-100 dark:bg-white/10 p-0.5 rounded-full"><X size={12} /></div> : <Info size={12} />}
                        </button>
                    </div>
                    <span className="font-mono text-xs font-bold text-gray-900 dark:text-white">{score}</span>
                </div>

                <div className="h-2 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden mb-2">
                    <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${score}%`, backgroundImage: createGlossyGradient(color) }}
                    />
                </div>

                {/* Expanded Detail View */}
                {isActive && (
                    <div className="animate-in slide-in-from-top-2 fade-in duration-200 bg-gray-50 dark:bg-white/5 p-3 rounded-lg mt-2">
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2 font-medium">
                            {PILLAR_DESCRIPTIONS[key]}
                        </p>
                        {(() => {
                            const justification = getJustification(key, score);
                            return (
                                <div className="flex items-start gap-2">
                                    {getIconForType(justification.type)}
                                    <span className={`text-xs font-medium leading-tight ${justification.type === 'error' ? 'text-red-700 dark:text-red-400' :
                                        justification.type === 'warning' ? 'text-orange-700 dark:text-orange-400' :
                                            justification.type === 'success' ? 'text-emerald-700 dark:text-emerald-400' : 'text-blue-700 dark:text-blue-400'
                                        }`}>
                                        {justification.text}
                                    </span>
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-white/5 shadow-sm p-4 mt-4">

            {/* 1. HEADER (Simple & Clean) */}
            <div className="text-center mb-6 border-b border-gray-50 dark:border-white/5 pb-3">
                <div className="flex justify-center items-center gap-2 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Transparence du Score
                    </span>
                    {isV2 ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 border border-indigo-200 dark:border-transparent">
                            Modèle V2 (Range & Cursor)
                        </span>
                    ) : isHybrid && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-transparent">
                            Méthode Hybride
                        </span>
                    )}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                    {isV2 ? (
                        <>
                            <span className="font-bold text-blue-600 dark:text-blue-400">Intervalle {range}</span>
                            <span className="mx-1 text-gray-400">+</span>
                            <span className="font-bold text-orange-500 dark:text-orange-400">Qualité {qualityCursor}</span>
                        </>
                    ) : (
                        <>
                            <span className="font-bold text-blue-600 dark:text-blue-400">70% Réputation</span>
                            <span className="mx-1 text-gray-400">+</span>
                            <span className="font-bold text-orange-500 dark:text-orange-400">30% Analyse</span>
                        </>
                    )}
                </p>
            </div>

            {/* 2. BODY (The Grid) */}
            <div className={`grid grid-cols-1 ${activePillar ? 'grid-cols-1' : 'md:grid-cols-2'} md:divide-x divide-gray-100 dark:divide-white/5 transition-all duration-300`}>

                {/* --- COL 1: RÉPUTATION (Pure White) --- */}
                {!activePillar && (
                    <div className="p-6 transition-all duration-300 animate-in fade-in slide-in-from-left-4">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                <Anchor className="w-5 h-5 text-blue-600" />
                                <h4 className="font-bold text-sm text-gray-900 dark:text-white uppercase leading-none">Réputation</h4>
                            </div>
                            <div className="text-right">
                                <span className="block text-2xl font-black text-blue-600">{reputationScore}</span>
                                <span className="text-[10px] uppercase font-bold text-gray-400">Score / 100</span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {/* 1. Description / Quote (AI or Static) */}
                            {(metadata.description || justification) && (
                                <blockquote className="relative p-4 bg-gray-50 dark:bg-white/5 rounded-lg border-l-4 border-blue-500">
                                    <p className="text-sm italic text-gray-700 dark:text-gray-300 leading-relaxed font-serif">
                                        "{metadata.description || justification}"
                                    </p>
                                </blockquote>
                            )}

                            {/* 2. Badges (Reliability & Bias) */}
                            <div className="flex flex-wrap gap-2">
                                {/* Reliability Badge */}
                                {reliability && (
                                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold border flex items-center gap-1.5 ${reliability === 'HIGH' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800' :
                                        reliability === 'MIXED' ? 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800' :
                                            'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                                        }`}>
                                        <ShieldCheck size={12} />
                                        Fiabilité: {reliability === 'HIGH' ? 'HAUTE' : reliability === 'MIXED' ? 'MIXTE' : reliability === 'LOW' ? 'FAIBLE' : reliability}
                                    </span>
                                )}

                                {/* Bias Badge */}
                                {politicalBias && (
                                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-white/10 flex items-center gap-1.5">
                                        <Info size={12} />
                                        Biais: {politicalBias}
                                    </span>
                                )}
                            </div>

                            {/* 3. Sources de Consensus (Vertical List) */}
                            <div className="bg-blue-50/50 dark:bg-blue-900/10 rounded-xl p-4 border border-blue-100 dark:border-blue-900/20">
                                <p className="text-[10px] text-blue-600 dark:text-blue-400 mb-3 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                    <ShieldCheck className="w-3 h-3" />
                                    Sources de consensus
                                </p>
                                {isHybrid && sources.length > 0 ? (
                                    <ul className="space-y-2">
                                        {sources.map((src, i) => (
                                            <li key={i} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                                                <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full p-0.5">
                                                    <CheckCircle size={10} strokeWidth={3} />
                                                </div>
                                                <span className="font-medium">{src}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="flex items-center gap-2 text-xs text-gray-400 italic">
                                        <AlertTriangle className="w-3 h-3" />
                                        Pas de consensus majeur trouvé.
                                    </div>
                                )}
                            </div>

                            {/* 4. Footer */}
                            <div className="pt-2">
                                <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1.5">
                                    <Info size={12} />
                                    Source vérifiée via {sources.length > 0 ? sources.length : 'plusieurs'} références externes
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- COL 2: ANALYSE (Interactive) --- */}
                <div className={`p-6 transition-all duration-500 ease-in-out ${activePillar ? 'bg-gray-50/50 dark:bg-white/[0.02]' : ''}`}>
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <Wind className={`w-5 h-5 text-orange-500 transition-transform duration-300 ${activePillar ? 'scale-110' : ''}`} />
                            <h4 className="font-bold text-sm text-gray-900 dark:text-white uppercase leading-none">Analyse</h4>
                        </div>
                        <div className="text-right">
                            <span className="block text-2xl font-black text-orange-500">{analysisScore}</span>
                            <span className="text-[10px] uppercase font-bold text-gray-400">Score / 100</span>
                        </div>
                    </div>

                    {/* Interactive Pillars */}
                    <div className="space-y-4 mb-4">
                        {renderInteractivePillar("Transparence", details.transparency, "#3B82F6", 'transparency')}
                        {renderInteractivePillar("Éditorial", details.editorial, "#10B981", 'editorial')}
                        {renderInteractivePillar("Sémantique", details.semantic, "#8B5CF6", 'semantic')}
                        {renderInteractivePillar("UX & Pubs", details.ux, "#F97316", 'ux')}
                    </div>

                    {/* Bonus / Malus List (Show only if not focused for clarity UI) */}
                    {!activePillar && (
                        <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-white/5 opacity-80">
                            {penalties.length > 0 ? (
                                penalties.map((item, i) => {
                                    const { text, type } = parsePenalty(item);
                                    let colorClass = "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-white/5";
                                    if (type === 'bonus') colorClass = "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/10";
                                    if (type === 'malus') colorClass = "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/10";

                                    return (
                                        <div key={i} className={`text-[10px] font-bold px-2 py-1 rounded flex items-center justify-between ${colorClass}`}>
                                            {text}
                                        </div>
                                    );
                                })
                            ) : (
                                <p className="text-[10px] text-gray-400 italic text-center">Aucun modificateur majeur.</p>
                            )}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}

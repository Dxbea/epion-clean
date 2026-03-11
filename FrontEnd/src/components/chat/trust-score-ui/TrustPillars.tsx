import React, { useState } from 'react';
import { createGlossyGradient } from '@/lib/color-utils';
import { Info, X, AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react';

interface TrustPillarsProps {
    details: {
        transparency: number;
        editorial: number;
        semantic: number;
        logic: number;
    };
    flags: {
        isAdsTxtValid: boolean;
        isClickbait?: boolean;
        hasDarkPatterns?: boolean;
        hasFactCheckFailures?: boolean;
        adDensity?: string;
    };
    livePenalties?: string[]; // From metadata.explanation
}

export function TrustPillars({ details, flags, livePenalties = [] }: TrustPillarsProps) {
    const [activePillar, setActivePillar] = useState<'transparency' | 'editorial' | 'semantic' | 'logic' | null>(null);

    // Static Descriptions
    const PILLAR_DESCRIPTIONS = {
        transparency: "Propriété et mentions légales",
        editorial: "Analyse de la fiabilité éditoriale",
        semantic: "Analyse du ton et du vocabulaire",
        logic: "Intégrité Logique & Débat"
    };

    // Helper to find relevant penalty/bonus text for a pillar
    const getJustification = (pillar: 'transparency' | 'editorial' | 'semantic' | 'logic', score: number) => {
        // 1. Check Specific Flags (Priority)
        if (pillar === 'editorial') {
            if (flags.hasFactCheckFailures) return { text: "Grave : Échecs Fact-Check détectés", type: 'error' as const };
            const citationBonus = livePenalties.find(p => p.includes('Citations'));
            if (citationBonus) return { text: citationBonus.replace('Citations & Liens :', 'Bonus Rigueur :'), type: 'success' as const };
        }
        if (pillar === 'logic') {
            if (flags.hasDarkPatterns) return { text: "Pénalité : Dark Patterns détectés", type: 'error' as const };
            const intrusiveness = livePenalties.find(p => p.includes('Intrusivité'));
            if (intrusiveness) return { text: intrusiveness, type: 'warning' as const };
            if (flags.adDensity === 'HIGH') return { text: "Attention : Densité publicitaire élevée", type: 'warning' as const };
        }
        if (pillar === 'semantic') {
            if (flags.isClickbait) return { text: "Attention : Titres sensationnalistes", type: 'warning' as const };
        }
        if (pillar === 'transparency') {
            if (!flags.isAdsTxtValid) return { text: "Manque de transparence technique (Ads.txt)", type: 'warning' as const };
        }

        // 2. Default Score-Based Logic (Fallback)
        if (score >= 80) {
            switch (pillar) {
                case 'transparency': return { text: "Identité vérifiée et claire.", type: 'success' as const };
                case 'editorial': return { text: "Standards journalistiques respectés.", type: 'success' as const };
                case 'semantic': return { text: "Ton neutre et factuel.", type: 'success' as const };
                case 'logic': return { text: "Raisonnement logique et équilibré.", type: 'success' as const };
            }
        } else if (score >= 50) {
            switch (pillar) {
                case 'transparency': return { text: "Informations légales basiques présentes.", type: 'info' as const };
                case 'editorial': return { text: "Ligne éditoriale identifiée.", type: 'info' as const };
                case 'semantic': return { text: "Vocabulaire parfois orienté.", type: 'info' as const };
                case 'logic': return { text: "Cohérence logique standard.", type: 'info' as const };
            }
        } else {
            switch (pillar) {
                case 'transparency': return { text: "Opacité sur les propriétaires.", type: 'error' as const };
                case 'editorial': return { text: "Méthodologie floue ou absente.", type: 'error' as const };
                case 'semantic': return { text: "Langage potentiellement clivant.", type: 'error' as const };
                case 'logic': return { text: "Failles logiques ou partialité.", type: 'error' as const };
            }
        }
        return null;
    };

    const getIconForType = (type: 'success' | 'warning' | 'error' | 'info') => {
        switch (type) {
            case 'success': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
            case 'warning': return <AlertTriangle className="w-5 h-5 text-orange-500" />;
            case 'error': return <AlertTriangle className="w-5 h-5 text-red-500" />;
            case 'info': return <HelpCircle className="w-5 h-5 text-blue-500" />;
        }
    };

    const renderPillar = (label: string, score: number, color: string, key: 'transparency' | 'editorial' | 'semantic' | 'logic') => {
        const isActive = activePillar === key;

        // Skip rendering if another pillar is active (Focus Mode)
        if (activePillar && !isActive) return null;

        return (
            <div className={`space-y-3 transition-all duration-300 ${isActive ? 'col-span-full' : ''}`}>
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-700 dark:text-gray-200">{label}</span>
                        <button
                            onClick={() => setActivePillar(isActive ? null : key)}
                            className={`p-1 rounded-full transition-colors ${isActive ? 'bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                        >
                            {isActive ? <X size={14} /> : <Info size={14} />}
                        </button>
                    </div>
                    <span className="font-mono text-xs font-bold text-gray-900 dark:text-white">{score}/100</span>
                </div>

                <div className="h-2 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <div
                        className="h-full transition-all duration-700 ease-out rounded-full"
                        style={{ width: `${score}%`, backgroundImage: createGlossyGradient(color) }}
                    />
                </div>

                {/* Detail View Content */}
                {isActive && (
                    <div className="pt-2 animate-in slide-in-from-top-2 fade-in duration-200">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                            {PILLAR_DESCRIPTIONS[key]}
                        </p>

                        {(() => {
                            const justification = getJustification(key, score);
                            if (!justification) return null;
                            return (
                                <div className="flex items-start gap-2 bg-gray-50 dark:bg-white/5 p-3 rounded-lg">
                                    {getIconForType(justification.type)}
                                    <span className={`text-sm font-medium ${justification.type === 'error' ? 'text-red-600 dark:text-red-400' :
                                        justification.type === 'warning' ? 'text-orange-600 dark:text-orange-400' :
                                            justification.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' :
                                                'text-blue-600 dark:text-blue-400'
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
        <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-gray-100 dark:border-white/5 shadow-sm">
            <div className={`grid grid-cols-1 ${activePillar ? 'gap-0' : 'md:grid-cols-2 gap-x-8 gap-y-6'}`}>
                {renderPillar("Transparence", details.transparency, "#3B82F6", "transparency")}
                {renderPillar("Processus Éditorial", details.editorial, "#10B981", "editorial")}
                {renderPillar("Sémantique", details.semantic, "#8B5CF6", "semantic")}
                {renderPillar("Intégrité Logique", details.logic, "#F97316", "logic")}
            </div>
        </div>
    );
}

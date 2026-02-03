import React from 'react';
import { createGlossyGradient } from '@/lib/color-utils';

interface TrustPillarsProps {
    details: {
        transparency: number;
        editorial: number;
        semantic: number;
        ux: number;
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

    // Static Descriptions
    const PILLAR_DESCRIPTIONS = {
        transparency: "Propriété et mentions légales",
        editorial: "Analyse de la fiabilité éditoriale",
        semantic: "Analyse du ton et du vocabulaire",
        ux: "Expérience utilisateur & Ergonomie"
    };

    // Helper to find relevant penalty/bonus text for a pillar
    const getJustification = (pillar: 'transparency' | 'editorial' | 'semantic' | 'ux', score: number) => {
        // 1. Check Specific Flags (Priority)
        if (pillar === 'editorial') {
            if (flags.hasFactCheckFailures) return { text: "⚠️ Grave : Échecs Fact-Check détectés", color: "text-red-500" };
            const citationBonus = livePenalties.find(p => p.includes('Citations'));
            if (citationBonus) return { text: citationBonus.replace('Citations & Liens :', '✅ Bonus Rigueur :'), color: "text-emerald-600" };
        }
        if (pillar === 'ux') {
            if (flags.hasDarkPatterns) return { text: "🛑 Pénalité : Dark Patterns détectés", color: "text-red-500" };
            const intrusiveness = livePenalties.find(p => p.includes('Intrusivité'));
            if (intrusiveness) return { text: intrusiveness, color: "text-orange-500" }; // "Malus Intrusivité : -40 pts"
            if (flags.adDensity === 'HIGH') return { text: "⚠️ Attention : Densité publicitaire élevée", color: "text-orange-500" };
        }
        if (pillar === 'semantic') {
            if (flags.isClickbait) return { text: "⚠️ Attention : Titres sensationnalistes", color: "text-orange-500" };
        }
        if (pillar === 'transparency') {
            if (!flags.isAdsTxtValid) return { text: "⚠️ Manque de transparence technique (Ads.txt)", color: "text-orange-500" };
        }

        // 2. Default Score-Based Logic (Fallback)
        if (score >= 80) {
            switch (pillar) {
                case 'transparency': return { text: "✅ Identité vérifiée et claire.", color: "text-emerald-600" };
                case 'editorial': return { text: "✅ Standards journalistiques respectés.", color: "text-emerald-600" };
                case 'semantic': return { text: "✅ Ton neutre et factuel.", color: "text-emerald-600" };
                case 'ux': return { text: "✅ Navigation fluide et respectueuse.", color: "text-emerald-600" };
            }
        } else if (score >= 50) {
            switch (pillar) {
                case 'transparency': return { text: "ℹ️ Informations légales basiques présentes.", color: "text-blue-500" };
                case 'editorial': return { text: "ℹ️ Ligne éditoriale identifiée.", color: "text-blue-500" };
                case 'semantic': return { text: "ℹ️ Vocabulaire parfois orienté.", color: "text-blue-500" };
                case 'ux': return { text: "ℹ️ Expérience utilisateur standard.", color: "text-blue-500" };
            }
        } else {
            switch (pillar) {
                case 'transparency': return { text: "⚠️ Opacité sur les propriétaires.", color: "text-orange-500" };
                case 'editorial': return { text: "⚠️ Méthodologie floue ou absente.", color: "text-orange-500" };
                case 'semantic': return { text: "⚠️ Langage potentiellement clivant.", color: "text-orange-500" };
                case 'ux': return { text: "⚠️ Navigation complexe ou intrusive.", color: "text-orange-500" };
            }
        }

        return null;
    };

    const renderPillar = (label: string, score: number, color: string, key: 'transparency' | 'editorial' | 'semantic' | 'ux') => {
        const justification = getJustification(key, score);

        return (
            <div className="space-y-1.5">
                <div className="flex justify-between items-center mb-1">
                    <div className="flex items-baseline gap-2">
                        <span className="font-bold text-sm text-gray-700 dark:text-gray-200">{label}</span>
                        <span className="hidden sm:inline-block text-[10px] text-gray-400 font-normal">
                            ({PILLAR_DESCRIPTIONS[key]})
                        </span>
                    </div>
                    <span className="font-mono text-xs font-bold text-gray-900 dark:text-white">{score}/100</span>
                </div>

                <div className="h-2 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <div
                        className="h-full transition-all duration-700 ease-out rounded-full"
                        style={{ width: `${score}%`, backgroundImage: createGlossyGradient(color) }}
                    />
                </div>

                {/* Dynamic Justification (Line 2) */}
                {justification && (
                    <p className={`text-[10px] font-medium ${justification.color} animate-in slide-in-from-top-1`}>
                        {justification.text}
                    </p>
                )}
            </div>
        );
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            {renderPillar("Transparence", details.transparency, "#3B82F6", "transparency")}
            {renderPillar("Processus Éditorial", details.editorial, "#10B981", "editorial")}
            {renderPillar("Sémantique", details.semantic, "#8B5CF6", "semantic")}
            {renderPillar("Qualité UX", details.ux, "#F97316", "ux")}
        </div>
    );
}

import React from 'react';
import Modal from '@/components/ui/Modal';
import { AlertTriangle, ShieldCheck, ShieldAlert, BadgeInfo } from 'lucide-react';
import { getScoreGradient, getScoreColor as getScoreHex, createGlossyGradient, getScoreColor } from '@/lib/color-utils';

export interface TrustData {
    globalScore: number; // Correspond maintenant à AverageSourceScore
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    details: {
        transparency: number;
        editorial: number;
        semantic: number;
        ux: number;
    };
    flags: {
        isPlatform: boolean;
        hasFactCheckFailures: boolean;
        isAdsTxtValid: boolean;
        hasDarkPatterns?: boolean;
        isClickbait?: boolean;
    };
    metadata: {
        name: string;
        justification: string | null;
        biasLevel: string;
    };
    sourceCount: number; // Nouveau
    outputScore?: number; // Score de neutralité de la réponse IA
}

interface TrustScoreModalProps {
    isOpen: boolean;
    onClose: () => void;
    trustData: TrustData;
}

export function TrustScoreModal({ isOpen, onClose, trustData }: TrustScoreModalProps) {
    const { globalScore: avgSourceScore, details, flags, metadata, sourceCount } = trustData;

    // --- LOGIQUE PONDEREE (75/25) ---
    // Sources = 75%
    // Qualité IA (Output) = 25% (ou 90 par défaut)
    const iaScore = trustData.outputScore ?? 90;
    const weightSources = 0.75;
    const weightIA = 0.25;

    // Calcul PONDÉRÉ
    const globalFactScore = Math.round((avgSourceScore * weightSources) + (iaScore * weightIA));

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Détail du Score de Fiabilité"
            size="large"
        >
            <div className="space-y-8 py-4 max-w-3xl mx-auto">

                {/* HEADER: GLOBAL FACT SCORE */}
                <div className="flex flex-col items-center justify-center p-6 border-b border-gray-100 dark:border-white/10">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="font-serif text-2xl text-gray-900 dark:text-white">Score de Fiabilité Global</div>
                        {flags.hasFactCheckFailures && (
                            <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200 text-xs font-bold border border-red-200 dark:border-red-800 animate-pulse">
                                <ShieldAlert className="w-3 h-3" />
                                PÉNALITÉ CRITIQUE
                            </span>
                        )}
                    </div>

                    <h2
                        className="font-serif tracking-tighter transition-all duration-500"
                        style={{
                            background: getScoreGradient(globalFactScore),
                            WebkitBackgroundClip: 'text',
                            backgroundClip: 'text',
                            color: 'transparent',
                            fontSize: '5rem',
                            fontWeight: 800,
                            lineHeight: 1
                        }}
                    >
                        {globalFactScore}%
                    </h2>
                    <p className="text-sm text-gray-600 mt-2 font-medium bg-white border border-gray-100 dark:bg-white/5 dark:border-white/10 px-3 py-1 rounded-full">
                        Calcul pondéré : 75% Sources + 25% Qualité de la Réponse
                    </p>
                </div>

                {/* FACTEURS DU CALCUL */}
                <div className="px-4 space-y-4">
                    {/* Barre 1 : Qualité des Sources (75%) */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-900 dark:text-gray-100">Qualité des Sources ({avgSourceScore}/100)</span>
                            <span className="text-sm font-mono font-bold transition-colors duration-300" style={{ color: getScoreColor(avgSourceScore) }}>{avgSourceScore}/100</span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full transition-all duration-500" style={{ width: `${avgSourceScore}%`, backgroundImage: getScoreGradient(avgSourceScore) }} />
                        </div>
                    </div>

                    {/* Barre 2 : Qualité IA (25%) */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-900 dark:text-gray-100">Qualité de la Réponse (Ton & Neutralité)</span>
                                <div className="group relative cursor-help">
                                    <BadgeInfo className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-black text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                        Analyse de la structure du texte généré : neutralité, absence de clickbait et lisibilité.
                                    </span>
                                </div>
                            </div>
                            <span className="text-sm font-mono font-bold transition-colors duration-300" style={{ color: getScoreColor(iaScore) }}>{iaScore}/100</span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full transition-all duration-500" style={{ width: `${iaScore}%`, backgroundImage: getScoreGradient(iaScore) }} />
                        </div>
                    </div>
                </div>

                {/* DETAIL DES PILIERS (Source Average) */}
                <div className="px-4 mt-8">
                    <h3 className="text-xs font-bold uppercase text-gray-900 dark:text-gray-100 mb-4 border-b border-gray-100 dark:border-white/5 pb-2">
                        Détails des Piliers (Moyenne Sources)
                    </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-4">

                    {/* PILLAR 1: TRANSPARENCY */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-900 dark:text-gray-200">Transparence</span>
                            <span className="text-sm font-mono text-gray-600">{details.transparency}/100</span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full transition-all duration-500" style={{ width: `${details.transparency}%`, backgroundImage: createGlossyGradient('#3B82F6') }} />
                        </div>
                        <div className="flex gap-2 mt-1">
                            {flags.isAdsTxtValid && <span className="text-[10px] bg-emerald-100 text-emerald-900 px-1.5 rounded dark:bg-emerald-900/30 dark:text-emerald-200">Ads.txt Valide</span>}
                        </div>
                    </div>

                    {/* PILLAR 2: EDITORIAL */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-900 dark:text-gray-200">Processus Éditorial</span>
                            <span className="text-sm font-mono text-gray-600">{details.editorial}/100</span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full transition-all duration-500" style={{ width: `${details.editorial}%`, backgroundImage: createGlossyGradient('#10B981') }} />
                        </div>
                    </div>

                    {/* PILLAR 3: SEMANTIC */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-900 dark:text-gray-200">Sémantique</span>
                            <span className="text-sm font-mono text-gray-600">{details.semantic}/100</span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full transition-all duration-500" style={{ width: `${details.semantic}%`, backgroundImage: createGlossyGradient('#8B5CF6') }} />
                        </div>
                        {flags.isClickbait && <span className="text-[10px] bg-orange-100 text-orange-900 px-1.5 rounded dark:bg-orange-900/30 dark:text-orange-200">Clickbait Détecté</span>}
                    </div>

                    {/* PILLAR 4: UX */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-900 dark:text-gray-200">Qualité UX</span>
                            <span className="text-sm font-mono text-gray-600">{details.ux}/100</span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full transition-all duration-500" style={{ width: `${details.ux}%`, backgroundImage: createGlossyGradient('#F97316') }} />
                        </div>
                        {flags.hasDarkPatterns && <span className="text-[10px] bg-purple-100 text-purple-900 px-1.5 rounded dark:bg-purple-900/30 dark:text-purple-200">Dark Patterns</span>}
                    </div>
                </div>

                {/* FOOTER : CONTEXT & JUSTIFICATION */}
                <div className="mx-4 mt-6 p-4 bg-white dark:bg-slate-900/50 rounded-lg border border-gray-100 dark:border-white/5">
                    <h4 className="text-xs font-bold uppercase text-gray-900 mb-2 flex items-center gap-2">
                        <ShieldCheck className="w-3 h-3" />
                        Analyse Contextuelle
                    </h4>
                    <p className="text-sm text-gray-900 dark:text-slate-300 italic leading-relaxed">
                        "{metadata.justification || "Analyse automatique basée sur les métadonnées techniques et la réputation du domaine."}"
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-[10px] text-gray-500">
                        <span>Niveau de confiance :</span>
                        <span className={`font-bold ${trustData.confidenceLevel === 'HIGH' ? 'text-emerald-600' : trustData.confidenceLevel === 'MEDIUM' ? 'text-amber-600' : 'text-gray-600'}`}>
                            {trustData.confidenceLevel === 'HIGH' ? 'ÉLEVÉ (Vérifié)' : trustData.confidenceLevel === 'MEDIUM' ? 'MOYEN' : 'FAIBLE (Automatique)'}
                        </span>
                    </div>
                </div>

            </div>
        </Modal>
    );
}

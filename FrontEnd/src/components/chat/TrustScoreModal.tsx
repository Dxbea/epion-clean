import React from 'react';
import Modal from '@/components/ui/Modal';
import { AlertTriangle, ShieldCheck, ShieldAlert, BadgeInfo } from 'lucide-react';

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
}

interface TrustScoreModalProps {
    isOpen: boolean;
    onClose: () => void;
    trustData: TrustData;
}

export function TrustScoreModal({ isOpen, onClose, trustData }: TrustScoreModalProps) {
    const { globalScore: avgSourceScore, details, flags, metadata, sourceCount } = trustData;

    // --- LOGIQUE PROBABILISTE (Mathématiques) ---
    const getConfidenceFactor = () => {
        let factor = 0.90; // Base Model Confidence (Sonar)

        // Pénalité 'Manque de Données'
        if (sourceCount < 3) {
            factor = 0.80; // Risque d'hallucination ou de biais de source unique
        }
        // Bonus 'Convergence'
        else if (sourceCount >= 5 && avgSourceScore > 70) {
            factor = 0.95; // Beaucoup de sources fiables = Forte certitude
        }

        return factor;
    };

    const confidenceFactor = getConfidenceFactor();
    const globalFactScore = Math.round(avgSourceScore * confidenceFactor);

    // --- UI HELPERS ---
    const getScoreColor = (score: number) => {
        if (score >= 70) return 'text-emerald-500';
        if (score >= 50) return 'text-amber-500';
        return 'text-red-500';
    };

    const getProgressColor = (score: number) => {
        if (score >= 70) return 'bg-emerald-500';
        if (score >= 50) return 'bg-amber-500';
        return 'bg-red-500';
    };

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
                        <div className="font-serif text-2xl text-gray-900 dark:text-white">Score de Fiabilité Probabiliste</div>
                        {flags.hasFactCheckFailures && (
                            <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-xs font-bold border border-red-200 dark:border-red-800 animate-pulse">
                                <ShieldAlert className="w-3 h-3" />
                                PÉNALITÉ CRITIQUE
                            </span>
                        )}
                    </div>

                    <div className={`font-serif text-7xl font-bold tracking-tighter ${getScoreColor(globalFactScore)}`}>
                        {globalFactScore}
                        <span className="text-3xl text-gray-400 font-light ml-1">%</span>
                    </div>
                    <p className="text-sm text-gray-400 mt-2 font-medium bg-gray-50 dark:bg-white/5 px-3 py-1 rounded-full">
                        Qualité des Sources ({avgSourceScore}/100) × Confiance Modèle IA ({Math.round(confidenceFactor * 100)}%)
                    </p>
                </div>

                {/* FACTEURS DU CALCUL */}
                <div className="px-4 space-y-4">
                    {/* Barre 1 : Qualité des Sources */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-800 dark:text-gray-100">Qualité Moyenne des Sources</span>
                            <span className={`text-sm font-mono font-bold ${getScoreColor(avgSourceScore)}`}>{avgSourceScore}/100</span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div className={`h-full ${getProgressColor(avgSourceScore)}`} style={{ width: `${avgSourceScore}%` }} />
                        </div>
                    </div>

                    {/* Barre 2 : Confiance Modèle */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-800 dark:text-gray-100">Confiance du Modèle (Sonar)</span>
                                <div className="group relative cursor-help">
                                    <BadgeInfo className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-black text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                        Facteur basé sur le volume de sources ({sourceCount}) et leur convergence. Moins de 3 sources pénalise ce score.
                                    </span>
                                </div>
                            </div>
                            <span className="text-sm font-mono text-blue-600 dark:text-blue-400 font-bold">{Math.round(confidenceFactor * 100)}%</span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: `${confidenceFactor * 100}%` }} />
                        </div>
                    </div>
                </div>

                {/* DETAIL DES PILIERS (Source Average) */}
                <div className="px-4 mt-8">
                    <h3 className="text-xs font-bold uppercase text-slate-500 mb-4 border-b border-gray-100 dark:border-white/5 pb-2">
                        Détails des Piliers (Moyenne Sources)
                    </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-4">

                    {/* PILLAR 1: TRANSPARENCY */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-700 dark:text-gray-200">Transparence</span>
                            <span className="text-sm font-mono text-gray-500">{details.transparency}/100</span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div className={`h-full ${getProgressColor(details.transparency)}`} style={{ width: `${details.transparency}%` }} />
                        </div>
                        <div className="flex gap-2 mt-1">
                            {flags.isAdsTxtValid && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 rounded dark:bg-emerald-900/30 dark:text-emerald-400">Ads.txt Valide</span>}
                        </div>
                    </div>

                    {/* PILLAR 2: EDITORIAL */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-700 dark:text-gray-200">Processus Éditorial</span>
                            <span className="text-sm font-mono text-gray-500">{details.editorial}/100</span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div className={`h-full ${getProgressColor(details.editorial)}`} style={{ width: `${details.editorial}%` }} />
                        </div>
                    </div>

                    {/* PILLAR 3: SEMANTIC */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-700 dark:text-gray-200">Sémantique</span>
                            <span className="text-sm font-mono text-gray-500">{details.semantic}/100</span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div className={`h-full ${getProgressColor(details.semantic)}`} style={{ width: `${details.semantic}%` }} />
                        </div>
                        {flags.isClickbait && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 rounded dark:bg-orange-900/30 dark:text-orange-400">Clickbait Détecté</span>}
                    </div>

                    {/* PILLAR 4: UX */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-700 dark:text-gray-200">Qualité UX</span>
                            <span className="text-sm font-mono text-gray-500">{details.ux}/100</span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div className={`h-full ${getProgressColor(details.ux)}`} style={{ width: `${details.ux}%` }} />
                        </div>
                        {flags.hasDarkPatterns && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 rounded dark:bg-purple-900/30 dark:text-purple-400">Dark Patterns</span>}
                    </div>
                </div>

                {/* FOOTER : CONTEXT & JUSTIFICATION */}
                <div className="mx-4 mt-6 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-white/5">
                    <h4 className="text-xs font-bold uppercase text-slate-500 mb-2 flex items-center gap-2">
                        <ShieldCheck className="w-3 h-3" />
                        Analyse Contextuelle
                    </h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300 italic leading-relaxed">
                        "{metadata.justification || "Analyse automatique basée sur les métadonnées techniques et la réputation du domaine."}"
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-400">
                        <span>Niveau de confiance :</span>
                        <span className={`font-bold ${trustData.confidenceLevel === 'HIGH' ? 'text-emerald-500' : trustData.confidenceLevel === 'MEDIUM' ? 'text-amber-500' : 'text-slate-500'}`}>
                            {trustData.confidenceLevel === 'HIGH' ? 'ÉLEVÉ (Vérifié)' : trustData.confidenceLevel === 'MEDIUM' ? 'MOYEN' : 'FAIBLE (Automatique)'}
                        </span>
                    </div>
                </div>

            </div>
        </Modal>
    );
}

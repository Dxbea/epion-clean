import React from 'react';
import Modal from '@/components/ui/Modal';
import { ShieldCheck, BrainCircuit, Clock, AlertTriangle, Info } from 'lucide-react';
import { getScoreGradient } from '@/lib/color-utils';

interface GlobalTrustScoreModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: {
        sources: Array<{
            id?: number;
            dbScore?: number;
            reliability?: string;
            politicalBias?: string;
            publishedAt?: string;
        }>;
        globalScore: number;
        sourceScore: number;
        aiScore: number;
    };
}

export function GlobalTrustScoreModal({ isOpen, onClose, data }: GlobalTrustScoreModalProps) {
    const { sources, globalScore, sourceScore: avgSourceScore, aiScore } = data;

    // --- 1. CALCUL SCORES ---
    // NO CALCULATION HERE - Single Source of Truth from Parent

    // --- 2. ANALYSE POLITIQUE ---
    const politicalCounts = { left: 0, center: 0, right: 0, total: 0 };
    sources.forEach(s => {
        const bias = (s.politicalBias || 'CENTER').toUpperCase();
        if (bias.includes('LEFT')) politicalCounts.left++;
        else if (bias.includes('RIGHT')) politicalCounts.right++;
        else politicalCounts.center++;
        politicalCounts.total++;
    });

    const getPct = (cnt: number) => politicalCounts.total > 0 ? (cnt / politicalCounts.total) * 100 : 0;
    const stats = {
        left: getPct(politicalCounts.left),
        center: getPct(politicalCounts.center),
        right: getPct(politicalCounts.right)
    };

    // --- CIRCULAR PROGRESS UTILS ---
    const radius = 56; // Radius of the circle
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (globalScore / 100) * circumference;

    // Determine color based on score
    const getStrokeColor = (score: number) => {
        if (score >= 70) return '#10B981'; // Emerald-500
        if (score >= 50) return '#F59E0B'; // Amber-500
        return '#EF4444'; // Red-500
    };

    // State for toggles
    const [showSourceInfo, setShowSourceInfo] = React.useState(false);
    const [showAiInfo, setShowAiInfo] = React.useState(false);
    const [showPoliticalInfo, setShowPoliticalInfo] = React.useState(false);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Détail du Score de Fiabilité"
            size="large"
        >
            <div className="py-6 px-4 space-y-8 max-w-2xl mx-auto">

                {/* 1. SCORE HEROIQUE (Circular Progress) */}
                <div className="flex flex-col items-center justify-center text-center">
                    <div className="relative w-32 h-32 flex items-center justify-center mb-4">
                        {/* SVG Circle Progress */}
                        <svg className="absolute w-full h-full -rotate-90" viewBox="0 0 128 128">
                            {/* Track */}
                            <circle
                                cx="64" cy="64" r={radius}
                                stroke="currentColor"
                                strokeWidth="8"
                                fill="none"
                                className="text-gray-100 dark:text-white/5"
                            />
                            {/* Progress */}
                            <circle
                                cx="64" cy="64" r={radius}
                                stroke={getStrokeColor(globalScore)}
                                strokeWidth="8"
                                fill="none"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                                className="transition-all duration-1000 ease-out"
                            />
                        </svg>

                        <div className="relative z-10 flex items-center justify-center">
                            <span
                                className="text-5xl font-black font-serif tracking-tighter"
                                style={{
                                    background: getScoreGradient(globalScore),
                                    WebkitBackgroundClip: 'text',
                                    backgroundClip: 'text',
                                    color: 'transparent'
                                }}
                            >
                                {globalScore}
                            </span>
                        </div>

                        {globalScore >= 80 && (
                            <div className="absolute top-0 right-0 transform translate-x-1 translate-y-1 bg-emerald-500 text-white p-1 rounded-full shadow-lg z-20">
                                <ShieldCheck size={16} />
                            </div>
                        )}
                    </div>

                    <p className="text-sm text-gray-500 max-w-xs mx-auto">
                        Score calculé à <span className="font-semibold text-gray-700 dark:text-gray-300">75% sur la fiabilité des sources</span> et <span className="font-semibold text-gray-700 dark:text-gray-300">25% sur l'IA</span>.
                    </p>
                </div>

                {/* 2. JAUGES DE DÉTAIL */}
                <div className="space-y-6">
                    {/* A. Fiabilité Sources */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm font-medium items-end">
                            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                <ShieldCheck size={16} />
                                <span>Fiabilité des Sources</span>
                                <button
                                    onClick={() => setShowSourceInfo(!showSourceInfo)}
                                    className="text-gray-400 hover:text-blue-500 transition-colors focus:outline-none"
                                    title="En savoir plus"
                                >
                                    <Info size={14} />
                                </button>
                            </div>
                            <span className="font-mono font-bold text-gray-900 dark:text-white">{avgSourceScore}/100</span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-1000 ease-out"
                                style={{
                                    width: `${avgSourceScore}%`,
                                    background: getScoreGradient(avgSourceScore)
                                }}
                            />
                        </div>

                        {showSourceInfo && (
                            <div className="mt-2 text-xs text-gray-500 bg-gray-50 dark:bg-white/5 p-3 rounded-lg animate-in fade-in slide-in-from-top-1 duration-200">
                                <p>
                                    Correspond à la <strong>moyenne des scores de fiabilité</strong> des sources utilisées dans cet article.
                                    Chaque source est notée individuellement sur sa réputation (Media Bias/Fact Check, etc.).
                                </p>
                            </div>
                        )}
                    </div>

                    {/* B. Précision IA */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm font-medium items-end">
                            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                <BrainCircuit size={16} />
                                <span>Fiabilité de l'IA</span>
                                <button
                                    onClick={() => setShowAiInfo(!showAiInfo)}
                                    className="text-gray-400 hover:text-blue-500 transition-colors focus:outline-none"
                                    title="En savoir plus"
                                >
                                    <Info size={14} />
                                </button>
                            </div>
                            <span className="font-mono font-bold text-gray-900 dark:text-white">{aiScore}/100</span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-indigo-500 rounded-full transition-all duration-1000 ease-out"
                                style={{ width: `${aiScore}%` }}
                            />
                        </div>

                        {showAiInfo && (
                            <div className="mt-2 text-xs text-gray-500 bg-gray-50 dark:bg-white/5 p-3 rounded-lg animate-in fade-in slide-in-from-top-1 duration-200">
                                <p>
                                    Évalue la précision du modèle IA ayant rédigé l'article.
                                    L'IA peut parfois "lisser" ou mal interpréter une source. Ce score mesure le respect du contexte original (Grounding).
                                </p>
                            </div>
                        )}
                    </div>

                    {/* C. Spectre Politique */}
                    <div className="pt-2">
                        <div className="flex justify-between text-sm font-medium mb-2 items-end">
                            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                <span>Spectre Politique</span>
                                <button
                                    onClick={() => setShowPoliticalInfo(!showPoliticalInfo)}
                                    className="text-gray-400 hover:text-blue-500 transition-colors focus:outline-none"
                                    title="En savoir plus"
                                >
                                    <Info size={14} />
                                </button>
                            </div>
                            <span className="text-xs text-gray-400 font-normal">Basé sur {sources.length} sources</span>
                        </div>

                        {/* Segmented Bar */}
                        <div className="flex h-2 w-full rounded-full overflow-hidden bg-gray-100 dark:bg-white/5">
                            {/* Left (Red) */}
                            {stats.left > 0 && (
                                <div style={{ width: `${stats.left}%` }} className="bg-red-600 h-full relative group"></div>
                            )}
                            {/* Center/Unknown (Gray) */}
                            {stats.center > 0 && (
                                <div style={{ width: `${stats.center}%` }} className="bg-gray-300 dark:bg-gray-600 h-full relative group"></div>
                            )}
                            {/* Right (Blue) */}
                            {stats.right > 0 && (
                                <div style={{ width: `${stats.right}%` }} className="bg-blue-600 h-full relative group"></div>
                            )}
                        </div>

                        {/* Legend */}
                        <div className="flex justify-between text-[10px] text-gray-400 mt-2 px-1 uppercase tracking-wider font-semibold">
                            <span className="text-red-600">Gauche</span>
                            <span className="text-gray-400">Centre / Neutre</span>
                            <span className="text-blue-600">Droite</span>
                        </div>

                        {showPoliticalInfo && (
                            <div className="mt-2 text-xs text-gray-500 bg-gray-50 dark:bg-white/5 p-3 rounded-lg animate-in fade-in slide-in-from-top-1 duration-200">
                                <p className="mb-2">Répartition des orientations politiques des sources citées :</p>
                                <ul className="space-y-1 list-disc list-inside ml-1">
                                    <li><span className="text-red-600 font-semibold">Gauche ({Math.round(stats.left)}%)</span> : Sources identifiées progressistes (Socialisme, Écologie...).</li>
                                    <li><span className="text-gray-500 font-semibold">Centre/Neutre ({Math.round(stats.center)}%)</span> : Sources factuelles ou non-classées.</li>
                                    <li><span className="text-blue-600 font-semibold">Droite ({Math.round(stats.right)}%)</span> : Sources identifiées conservatrices (Libéralisme, Nationalisme...).</li>
                                </ul>
                                <p className="mt-2 text-[10px] opacity-70 italic">Basé sur le pays d'origine et la ligne éditoriale connue.</p>
                            </div>
                        )}
                    </div>
                </div>

                <hr className="border-gray-100 dark:border-white/10" />

                {/* 4. DISCLAIMER */}
                <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                    <AlertTriangle size={14} />
                    <p>L'IA peut commettre des erreurs de nuance. Vérifiez toujours les sources originales.</p>
                </div>
            </div>
        </Modal>
    );
}

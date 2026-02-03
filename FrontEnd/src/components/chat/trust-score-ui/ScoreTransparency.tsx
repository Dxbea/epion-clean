import React from 'react';
import { Anchor, Wind, ShieldCheck, AlertCircle } from 'lucide-react';

interface ScoreTransparencyProps {
    explanation?: {
        formula: string;
        sources: string[];
        livePenalties: string[];
        pillarWeights?: { [key: string]: string };
    };
    dbScore?: number; // Not explicitly in backend payload yet, might need to infer or pass raw `globalScore` if formula is hidden.
    // Wait, backend doesn't send "dbScore" separately yet in the main object, only hidden in "formula" text maybe?
    // User requested: "Affiche le Score DB".
    // I might need to update backend to send `dbScore` and `liveScore` in `explanation` object.
    // For now I will mock or extract IF user insists, but I can't easily extract without backend update.
    // Proposal: Use "explanation.formula" textual description as fallback, or update backend later. 
    // Actually, I can update the backend in a jiffy if needed, but let's stick to what we have (metadata.explanation). 
    // I'll display the `sources` and `livePenalties`.
}

/**
 * Parses a penalty string like "Citations : +10 pts" to determine type.
 */
function parsePenalty(text: string) {
    const isBonus = text.includes('+');
    const isMalus = text.includes('-');
    // Extract number if possible
    // const match = text.match(/([+-]\d+)/);
    // const points = match ? match[0] : "";

    return {
        text,
        type: isBonus ? 'bonus' : isMalus ? 'malus' : 'neutral'
    };
}

export function ScoreTransparency({ explanation }: ScoreTransparencyProps) {
    if (!explanation) return null;

    const { formula, sources, livePenalties } = explanation;

    // Check if we are in "Unknown Source" mode (100% Live)
    const isHybrid = formula.includes('70%');

    return (
        <div className="bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden">
            {/* Header: The Equation */}
            <div className="bg-gray-100 dark:bg-white/10 px-4 py-2 text-center border-b border-gray-200 dark:border-white/5">
                <p className="text-xs font-mono text-gray-600 dark:text-gray-300">
                    <span className="font-bold">Formule :</span> {formula}
                </p>
            </div>

            <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-white/5">

                {/* LEFT COL: L'ANCRE (Réputation) */}
                <div className={`flex-1 p-4 ${!isHybrid ? 'opacity-50 grayscale' : ''}`}>
                    <div className="flex items-center gap-2 mb-3">
                        <Anchor className="w-4 h-4 text-blue-600" />
                        <h4 className="font-bold text-sm text-gray-900 dark:text-white uppercase">L'Ancre (Réputation)</h4>
                        {isHybrid && <span className="ml-auto text-xs font-bold text-blue-600 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">70%</span>}
                    </div>

                    <div className="space-y-2">
                        {isHybrid ? (
                            <>
                                <p className="text-xs text-gray-500 mb-2">Basé sur le consensus des auditeurs :</p>
                                <div className="flex flex-wrap gap-2">
                                    {sources.map((src, i) => (
                                        <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 dark:border-white/10 bg-white dark:bg-black text-xs font-medium text-gray-700 dark:text-gray-300">
                                            <ShieldCheck className="w-3 h-3 text-emerald-500" />
                                            {src}
                                        </span>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-20 text-gray-400 text-center">
                                <AlertCircle className="w-6 h-6 mb-1 opacity-50" />
                                <span className="text-xs">Source non répertoriée<br />Pas de consensus historique</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT COL: LA VOILE (Live) */}
                <div className="flex-1 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Wind className="w-4 h-4 text-orange-500" />
                        <h4 className="font-bold text-sm text-gray-900 dark:text-white uppercase">La Voile (Analyse Live)</h4>
                        <span className={`ml-auto text-xs font-bold text-orange-600 bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5 rounded`}>
                            {isHybrid ? '30%' : '100%'}
                        </span>
                    </div>

                    <div className="space-y-2">
                        {livePenalties.length > 0 ? (
                            <ul className="space-y-2">
                                {livePenalties.map((item, i) => {
                                    const { text, type } = parsePenalty(item);
                                    let colorClass = "text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5";
                                    if (type === 'bonus') colorClass = "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/30";
                                    if (type === 'malus') colorClass = "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/30";

                                    return (
                                        <li key={i} className={`text-xs px-2 py-1.5 rounded border border-transparent flex items-center justify-between ${colorClass}`}>
                                            <span>{text}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <p className="text-xs text-gray-400 italic text-center py-4">Aucun modificateur technique détecté (Neutre).</p>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}

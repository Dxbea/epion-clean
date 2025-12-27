import React from 'react';
import { ShieldCheck, Info, Highlighter } from 'lucide-react';
import { getBadgeStyle } from '@/lib/color-utils';

export interface TrustHeaderProps {
    score: number | null;
    sources: Array<any>; // Flexible to accept various source objects
    onHighlightClick?: () => void;
    isHighlightActive?: boolean;
    onShowSources?: () => void;
    onShowScoreDetails?: () => void;
    className?: string;
}

export default function TrustHeader({
    score,
    sources,
    onHighlightClick,
    isHighlightActive = false,
    onShowSources,
    onShowScoreDetails,
    className = ''
}: TrustHeaderProps) {
    // --- LOGIQUE SIMPLIFIÉE ("Dumb Component") ---
    // On fait confiance aveuglément au parent. Le calcul pondéré est fait dans Article.tsx.
    const finalScore = score || 0;

    return (
        <div className={`flex items-center justify-start gap-2 border-b border-black/5 pb-3 dark:border-white/5 ${className}`}>
            {/* Badge Fiabilité */}
            {finalScore > 0 ? (
                <button
                    onClick={onShowScoreDetails}
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition hover:opacity-90 shadow-sm"
                    style={getBadgeStyle(finalScore)}
                >
                    <ShieldCheck className="h-3 w-3" />
                    <span>Fiabilité : {finalScore}%</span>
                </button>
            ) : (
                <button
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-gray-500 bg-gray-100 dark:bg-white/10 dark:text-gray-400 cursor-default"
                >
                    <ShieldCheck className="h-3 w-3" />
                    <span>Calcul en cours...</span>
                </button>
            )}

            {/* Bouton Sources */}
            <button
                className="
          flex items-center gap-1.5 rounded-full border border-black/10 bg-black/5 px-2.5 py-1 text-[11px] font-medium text-gray-700 transition hover:bg-black/10
          dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10
        "
                onClick={onShowSources}
            >
                <Info className="h-3 w-3" />
                <span>{sources.length} sources analysées</span>
            </button>

            {/* Bouton Surligner (Optionnel) */}
            {onHighlightClick && (
                <button
                    onClick={onHighlightClick}
                    className={`
            flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition
            ${isHighlightActive
                            ? 'bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-900/20 dark:border-yellow-700/50 dark:text-yellow-200'
                            : 'border-transparent bg-transparent text-gray-400 hover:text-gray-600 hover:bg-black/5 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-white/5'
                        }
          `}
                >
                    <Highlighter className="h-3 w-3" />
                    <span>Surligner</span>
                </button>
            )}
        </div>
    );
}

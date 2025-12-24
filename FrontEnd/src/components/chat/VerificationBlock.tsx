import React from 'react';
import { ShieldCheck, Info, Highlighter } from 'lucide-react';

export interface Source {
    id: string | number;
    name?: string;
    url?: string;
    [key: string]: any;
}

export interface Segment {
    text: string;
    sourceId: number | null;
}

type Props = {
    score: number | null;
    sources: Source[];
    isHighlighting: boolean;
    onToggleHighlight: () => void;
    onShowSources?: () => void;
    onShowScoreDetails?: () => void;
};

export default function VerificationBlock({
    score,
    sources,
    isHighlighting,
    onToggleHighlight,
    onShowSources,
    onShowScoreDetails
}: Props) {
    return (
        <div className="flex items-center justify-start gap-2 border-b border-black/5 pb-3 dark:border-white/5">
            {/* Badge Fiabilité */}
            {score !== null ? (
                <button
                    onClick={onShowScoreDetails}
                    className={`
          flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-white transition hover:opacity-90 shadow-sm
          ${score >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}
        `}
                >
                    <ShieldCheck className="h-3 w-3" />
                    <span>Fiabilité : {score}%</span>
                </button>
            ) : (
                <button
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-gray-500 bg-gray-100 dark:bg-white/10 dark:text-gray-400 cursor-default"
                >
                    <ShieldCheck className="h-3 w-3" />
                    <span>Fiabilité : Calcul en cours</span>
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

            {/* Bouton Surligner */}
            <button
                onClick={onToggleHighlight}
                className={`
          flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition
          ${isHighlighting
                        ? 'bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-900/20 dark:border-yellow-700/50 dark:text-yellow-200'
                        : 'border-transparent bg-transparent text-gray-400 hover:text-gray-600 hover:bg-black/5 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-white/5'
                    }
        `}
            >
                <Highlighter className="h-3 w-3" />
                <span>Surligner</span>
            </button>
        </div>
    );
}

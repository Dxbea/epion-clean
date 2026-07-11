import React from 'react';
import { ShieldCheck, Info } from 'lucide-react';
import { getBadgeStyle } from '@/lib/color-utils';
import { getPublicSupportLabel, type ScoreStatus, type SupportLevel } from '@/lib/score-labels';

export interface TrustHeaderProps {
    score: number | null;
    supportLevel?: SupportLevel | null;
    status?: ScoreStatus;
    sources: Array<any>;
    onHighlightClick?: () => void;
    isHighlightActive?: boolean;
    onShowSources?: () => void;
    onShowScoreDetails?: () => void;
    className?: string;
}

export default function TrustHeader({ score, supportLevel, status, sources, onShowSources, onShowScoreDetails, className = '' }: TrustHeaderProps) {
    const backendScore = typeof score === 'number' ? score : null;
    const supportLabel = getPublicSupportLabel({ backendScore, supportLevel, status });

    return (
        <div className={`flex items-center justify-start gap-2 ${className}`}>
            <button
                onClick={onShowScoreDetails}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition hover:opacity-90 shadow-sm"
                style={backendScore !== null ? getBadgeStyle(backendScore) : undefined}
            >
                <ShieldCheck className="h-3 w-3" />
                <span>Niveau d'appui : {supportLabel}</span>
            </button>
            <button
                className="flex items-center gap-1.5 rounded-full border border-black/10 bg-black/5 px-2.5 py-1 text-[11px] font-medium text-gray-700 transition hover:bg-black/10 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
                onClick={onShowSources}
            >
                <Info className="h-3 w-3" />
                <span>{sources.length} sources analysées</span>
            </button>
        </div>
    );
}

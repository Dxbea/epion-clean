import React from 'react';
import Modal from '@/components/ui/Modal';
import { ShieldAlert } from 'lucide-react';
import { getScoreGradient } from '@/lib/color-utils';
import { SourceIdentityCard } from './trust-score-ui/SourceIdentityCard';
import { TrustPillars } from './trust-score-ui/TrustPillars';
import { ScoreTransparency } from './trust-score-ui/ScoreTransparency';

export interface TrustData {
    globalScore: number;
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
        adDensity?: string; // Needed for TrustPillars
    };
    metadata: {
        name: string;
        justification: string | null;
        description?: string | null;
        politicalBias?: string;
        biasScore?: number;
        reliability?: string;
        country?: string;
        explanation?: {
            formula: string;
            sources: string[];
            livePenalties: string[];
            pillarWeights: { [key: string]: string };
        };
    };
    sourceCount: number;
    outputScore?: number;
}

interface TrustScoreModalProps {
    isOpen: boolean;
    onClose: () => void;
    trustData: TrustData;
}

export function TrustScoreModal({ isOpen, onClose, trustData }: TrustScoreModalProps) {
    const { globalScore: avgSourceScore, details, flags, metadata } = trustData;

    // --- LOGIQUE PONDEREE (75/25) ---
    const iaScore = trustData.outputScore ?? 90;
    const globalFactScore = Math.round((avgSourceScore * 0.75) + (iaScore * 0.25));

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Détail du Score de Fiabilité"
            size="large"
        >
            <div className="space-y-6 py-4 max-w-4xl mx-auto px-2">

                {/* 1. HEADER & IDENTITY */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Score Circle */}
                    <div className="md:col-span-1 flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/5">
                        <div className="font-serif text-lg text-gray-500 dark:text-gray-400 mb-1">Score Global</div>
                        <div className="relative">
                            <h2
                                className="font-serif tracking-tighter"
                                style={{
                                    background: getScoreGradient(globalFactScore),
                                    WebkitBackgroundClip: 'text',
                                    backgroundClip: 'text',
                                    color: 'transparent',
                                    fontSize: '4rem',
                                    fontWeight: 800,
                                    lineHeight: 1
                                }}
                            >
                                {globalFactScore}
                            </h2>
                            {flags.hasFactCheckFailures && (
                                <div className="absolute top-0 right-0 -mr-4 -mt-2">
                                    <ShieldAlert className="w-6 h-6 text-red-500 animate-pulse" />
                                </div>
                            )}
                        </div>
                        <span className="text-xs text-center text-gray-400 mt-2">
                            Pondéré : 75% Source + 25% IA
                        </span>
                    </div>

                    {/* Source Identity Card */}
                    <div className="md:col-span-2">
                        <SourceIdentityCard
                            name={metadata.name}
                            description={metadata.description}
                            country={metadata.country}
                            politicalBias={metadata.politicalBias}
                        />
                    </div>
                </div>

                {/* 2. PILLARS */}
                <div>
                    <h3 className="text-xs font-bold uppercase text-gray-400 mb-4 px-1">Détail des 4 Piliers</h3>
                    <TrustPillars
                        details={details}
                        flags={flags}
                        livePenalties={metadata.explanation?.livePenalties}
                    />
                </div>

                {/* 3. TRANSPARENCY & CALCULATION */}
                <div>
                    <h3 className="text-xs font-bold uppercase text-gray-400 mb-4 px-1 mt-2">Transparence du Calcul</h3>
                    {metadata.explanation ? (
                        <ScoreTransparency explanation={metadata.explanation} />
                    ) : (
                        <p className="text-sm text-gray-500 italic text-center py-4 bg-gray-50 rounded-lg">
                            Détails du calcul non disponibles pour cette source.
                        </p>
                    )}
                </div>

            </div>
        </Modal>
    );
}

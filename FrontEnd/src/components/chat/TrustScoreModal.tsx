import React from 'react';
import Modal from '@/components/ui/Modal';
import { ShieldAlert } from 'lucide-react';
import { getScoreGradient } from '@/lib/color-utils';
import { SourceIdentityCard } from './trust-score-ui/SourceIdentityCard';
import { UnifiedTrustCard } from './trust-score-ui/UnifiedTrustCard';

export interface TrustData {
    globalScore: number;
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    details: {
        transparency: number;
        editorial: number;
        semantic: number;
        logic: number;
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
        dbScore?: number;
        liveScore?: number;
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

    // USE PASSED GLOBAL SCORE (Single Source of Truth)
    // Fallback to average source score if not provided (legacy safety), but parent should provide it.
    const globalFactScore = trustData.globalScore || avgSourceScore;

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

                {/* 2. Unified Trust Card */}
                <div>
                    <UnifiedTrustCard
                        details={details}
                        flags={{
                            isAdsTxtValid: flags.isAdsTxtValid,
                            hasFactCheckFailures: flags.hasFactCheckFailures
                        }}
                        metadata={{
                            name: metadata.name,
                            country: metadata.country,
                            politicalBias: metadata.politicalBias,
                            explanation: metadata.explanation,
                            reliability: metadata.reliability,
                            justification: metadata.justification,
                            description: metadata.description,
                            dbScore: metadata.dbScore,
                            liveScore: metadata.liveScore
                        }}
                    />
                </div>

            </div>
        </Modal>
    );
}

import React from 'react';
import Modal from '@/components/ui/Modal';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { SourceIdentityCard } from './trust-score-ui/SourceIdentityCard';
import { getPublicSupportLabel } from '@/lib/score-labels';

export interface TrustData {
    globalScore: number;
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    details: { transparency: number; editorial: number; semantic: number; logic: number };
    flags: { isPlatform: boolean; hasFactCheckFailures: boolean; isAdsTxtValid: boolean; hasDarkPatterns?: boolean; isClickbait?: boolean; adDensity?: string };
    metadata: { name: string; justification: string | null; description?: string | null; politicalBias?: string; biasScore?: number; reliability?: string; dbScore?: number; liveScore?: number; country?: string; explanation?: { formula: string; sources: string[]; livePenalties: string[]; pillarWeights: { [key: string]: string } } };
    sourceCount: number;
    outputScore?: number;
}

interface TrustScoreModalProps { isOpen: boolean; onClose: () => void; trustData: TrustData }

export function TrustScoreModal({ isOpen, onClose, trustData }: TrustScoreModalProps) {
    const backendScore = Number.isFinite(trustData.globalScore) && trustData.globalScore > 0 ? trustData.globalScore : null;
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Détail du niveau d'appui" size="large">
            <div className="space-y-6 py-4 max-w-4xl mx-auto px-2">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-5 text-center dark:border-white/5 dark:bg-white/5">
                    <ShieldCheck className="mx-auto h-6 w-6" />
                    <div className="mt-2 text-xs font-bold uppercase tracking-wider text-gray-500">Niveau d'appui</div>
                    <div className="mt-2 text-2xl font-bold">{getPublicSupportLabel({ backendScore })}</div>
                    {trustData.flags.hasFactCheckFailures && <ShieldAlert className="mx-auto mt-3 h-5 w-5 text-red-500" />}
                </div>
                <SourceIdentityCard name={trustData.metadata.name} description={trustData.metadata.description} country={trustData.metadata.country} />
                {trustData.metadata.justification && <p className="text-sm text-gray-600 dark:text-gray-300">{trustData.metadata.justification}</p>}
                {backendScore !== null && <details className="rounded-xl border border-gray-200 p-4 dark:border-white/10"><summary className="cursor-pointer text-sm font-semibold">Détails techniques</summary><p className="mt-3 text-sm">Score backend : {backendScore}/100</p></details>}
            </div>
        </Modal>
    );
}

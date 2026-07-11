import React from 'react';
import Modal from '@/components/ui/Modal';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { getPublicSupportLabel } from '@/lib/score-labels';
import { getPublicContentIntentLabel } from '@/lib/source-ui';

interface GlobalTrustScoreModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: {
        sources: Array<{ id?: number; dbScore?: number; reliability?: string; politicalBias?: string; publishedAt?: string }>;
        globalScore: number;
        sourceScore: number;
        aiScore: number;
        liveAnalysis?: {
            contentIntent: string;
            intentReasoning?: string;
            pillarScores: Record<string, { score: number; quote?: string; reasoning: string }>;
            correctiveNotes?: string[];
        } | null;
    };
}

export function GlobalTrustScoreModal({ isOpen, onClose, data }: GlobalTrustScoreModalProps) {
    const backendScore = Number.isFinite(data.globalScore) && data.globalScore > 0 ? data.globalScore : null;
    const label = getPublicSupportLabel({ backendScore });
    const intentLabel = getPublicContentIntentLabel(data.liveAnalysis?.contentIntent);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Détail du niveau d'appui" size="large">
            <div className="space-y-6 py-4 max-w-2xl mx-auto px-2">
                <div className="rounded-2xl border border-black/10 bg-black/5 p-6 text-center dark:border-white/10 dark:bg-white/5">
                    <ShieldCheck className="mx-auto mb-3 h-6 w-6" />
                    <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Niveau d'appui</div>
                    <div className="mt-2 text-2xl font-bold">{label}</div>
                    <p className="mt-2 text-sm text-gray-500">Ce niveau décrit l'appui disponible ; il ne représente pas une probabilité de vérité.</p>
                </div>

                {data.sources.length > 0 && (
                    <p className="text-sm text-gray-600 dark:text-gray-300">Analyse fondée sur {data.sources.length} source{data.sources.length > 1 ? 's' : ''} structurée{data.sources.length > 1 ? 's' : ''}.</p>
                )}

                {intentLabel && (
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-900/30 dark:bg-indigo-900/10">
                        <div className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Analyse du contenu</div>
                        <p className="mt-2 text-sm font-medium">{intentLabel}</p>
                        {data.liveAnalysis.intentReasoning && <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">{data.liveAnalysis.intentReasoning}</p>}
                    </div>
                )}

                {backendScore !== null && (
                    <details className="rounded-xl border border-gray-200 p-4 dark:border-white/10">
                        <summary className="cursor-pointer text-sm font-semibold">Détails techniques</summary>
                        <p className="mt-3 text-sm">Score backend : {backendScore}/100</p>
                    </details>
                )}

                <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                    <AlertTriangle size={14} />
                    <p>L'IA peut commettre des erreurs de nuance. Vérifiez toujours les sources originales.</p>
                </div>
            </div>
        </Modal>
    );
}

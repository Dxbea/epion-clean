import React from 'react';
import Modal from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';

interface SystemCardModalProps {
    isOpen: boolean;
    onClose: () => void;

    // Toggles
    sourceRestricted: boolean;
    setSourceRestricted: (val: boolean) => void;
    neutralityForced: boolean;
    setNeutralityForced: (val: boolean) => void;
    timeRecent: boolean;
    setTimeRecent: (val: boolean) => void;
}

export default function SystemCardModal({
    isOpen,
    onClose,
    sourceRestricted,
    setSourceRestricted,
    neutralityForced,
    setNeutralityForced,
    timeRecent,
    setTimeRecent
}: SystemCardModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Cahier des Charges de la Réponse"
            size="normal"
        >
            <div className="space-y-6 text-neutral-900 dark:text-neutral-100 p-2 font-sans">

                {/* Section 1: Filtre de Sources */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                        <h4 className="mb-1 text-base font-bold text-neutral-800 dark:text-neutral-200">
                            Filtre de Sources
                            {sourceRestricted && <span className="ml-2 text-[#00dc82]">Restrictif</span>}
                        </h4>
                        <p className="text-sm text-neutral-500 leading-snug">
                            {sourceRestricted
                                ? "Priorité aux domaines .gov, .edu et presse accréditée."
                                : "Recherche ouverte sur tout le web (blogs inclus)."}
                        </p>
                    </div>
                    <Switch
                        checked={sourceRestricted}
                        onCheckedChange={setSourceRestricted}
                    />
                </div>

                <div className="w-full h-px bg-black/5 dark:bg-white/5" />

                {/* Section 2: Neutralité */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                        <h4 className="mb-1 text-base font-bold text-neutral-800 dark:text-neutral-200">
                            Neutralité
                            {neutralityForced && <span className="ml-2 text-[#00dc82]">Forcée</span>}
                        </h4>
                        <p className="text-sm text-neutral-500 leading-snug">
                            {neutralityForced
                                ? "Interdiction formelle de donner un avis."
                                : "Analyse nuancée autorisée."}
                        </p>
                    </div>
                    <Switch
                        checked={neutralityForced}
                        onCheckedChange={setNeutralityForced}
                    />
                </div>

                <div className="w-full h-px bg-black/5 dark:bg-white/5" />

                {/* Section 3: Fenêtre Temporelle */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                        <h4 className="mb-1 text-base font-bold text-neutral-800 dark:text-neutral-200">
                            News Récentes
                            {timeRecent && <span className="ml-2 text-xs uppercase tracking-wider text-[#00dc82] font-bold">&lt; 48H</span>}
                        </h4>
                        <p className="text-sm text-neutral-500 leading-snug">
                            {timeRecent
                                ? "Se concentrer sur les événements des dernières 48h."
                                : "Recherche historique + temps réel."}
                        </p>
                    </div>
                    <Switch
                        checked={timeRecent}
                        onCheckedChange={setTimeRecent}
                    />
                </div>

                {/* Note sur la spéculation (Native) */}
                <div className="mt-6 rounded-lg bg-neutral-100 p-3 text-xs text-neutral-500 dark:bg-neutral-900">
                    <span className="font-bold">Note :</span> L'anti-hallucination est active en permanence. Si l'IA ne trouve pas l'info, elle ne l'inventera pas.
                </div>

            </div>
        </Modal>
    );
}

import React from 'react';
import Modal from '@/components/ui/Modal';
import { Cpu, Globe, Thermometer, CheckCircle2 } from 'lucide-react';

interface SystemCardModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function SystemCardModal({ isOpen, onClose }: SystemCardModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Transparence du Système"
            size="normal"
        >
            <div className="space-y-6 text-gray-900 dark:text-gray-100 p-2">

                {/* Section 1: Fiche Technique */}
                <div className="rounded-xl border border-black/5 bg-gray-50 p-4 dark:border-white/5 dark:bg-white/5">
                    <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">Fiche Technique</h4>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Cpu className="h-4 w-4 text-[#2C98A0]" />
                                <span className="text-sm font-medium">Modèle IA</span>
                            </div>
                            <span className="text-sm font-semibold">Perplexity Sonar-Medium</span>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Globe className="h-4 w-4 text-[#2C98A0]" />
                                <span className="text-sm font-medium">Accès Web</span>
                            </div>
                            <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                <span className="relative flex h-2 w-2">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                                </span>
                                Actif (Temps Réel)
                            </span>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Thermometer className="h-4 w-4 text-[#2C98A0]" />
                                <span className="text-sm font-medium">Rigueur</span>
                            </div>
                            <span className="text-sm font-semibold">Maximale (Mode Factuel)</span>
                        </div>
                    </div>
                </div>

                {/* Section 2: Directives */}
                <div>
                    <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">Nos Directives</h4>
                    <p className="mb-4 text-sm text-gray-600 dark:text-gray-400 italic">
                        "Pour garantir l'objectivité, Epion impose les règles suivantes à chaque réponse :"
                    </p>
                    <ul className="space-y-3">
                        {[
                            "Citer systématiquement les sources.",
                            "Croiser les informations contradictoires.",
                            "Signaler clairement l'incertitude.",
                            "Refuser la spéculation non fondée."
                        ].map((rule, idx) => (
                            <li key={idx} className="flex items-start gap-2.5">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2C98A0]" />
                                <span className="text-sm font-medium">{rule}</span>
                            </li>
                        ))}
                    </ul>
                </div>

            </div>
        </Modal >
    );
}

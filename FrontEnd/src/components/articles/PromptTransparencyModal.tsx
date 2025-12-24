import React from 'react';
import Modal from '@/components/ui/Modal';

interface PromptTransparencyModalProps {
    isOpen: boolean;
    onClose: () => void;
    promptText: string;
}

export default function PromptTransparencyModal({
    isOpen,
    onClose,
    promptText,
}: PromptTransparencyModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="AI Generation Context"
            size="normal"
        >
            <div className="space-y-4">
                <p className="text-sm text-black/60 dark:text-white/60">
                    Transparence sur la création de ce contenu. Voici les instructions (prompt) qui ont servi à générer cet article.
                </p>

                <div className="relative rounded-xl border border-black/10 bg-gray-50 p-4 font-mono text-xs leading-relaxed text-black/80 dark:border-white/10 dark:bg-white/5 dark:text-white/80">
                    {promptText ? (
                        <div className="whitespace-pre-wrap">{promptText}</div>
                    ) : (
                        <div className="italic opacity-50">
                            Cet article a été rédigé manuellement ou le prompt original n'est pas disponible.
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}

import React, { useEffect, useState } from 'react';
import { X, Copy, Sparkles, Check } from 'lucide-react';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    summaryText: string;
    loading?: boolean;
};

export default function SummaryModal({ isOpen, onClose, summaryText, loading = false }: Props) {
    const [copied, setCopied] = useState(false);

    // Close on Escape
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    const handleCopy = () => {
        navigator.clipboard.writeText(summaryText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            {/* Card */}
            <div
                className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white shadow-2xl transition-all dark:bg-neutral-900 border border-black/5 dark:border-white/10"
                role="dialog"
                aria-modal="true"
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-black/5 px-6 py-4 dark:border-white/5">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-teal-500" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            AI Summary
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-full p-2 text-gray-500 hover:bg-black/5 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-300"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-6">
                    {loading ? (
                        <div className="space-y-2 animate-pulse">
                            <div className="h-4 bg-gray-200 rounded w-3/4 dark:bg-gray-700"></div>
                            <div className="h-4 bg-gray-200 rounded w-full dark:bg-gray-700"></div>
                            <div className="h-4 bg-gray-200 rounded w-5/6 dark:bg-gray-700"></div>
                        </div>
                    ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-300">
                            {summaryText}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 border-t border-black/5 px-6 py-4 dark:border-white/5 bg-gray-50/50 dark:bg-neutral-900">
                    <button
                        onClick={handleCopy}
                        disabled={loading || !summaryText}
                        className="flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5"
                    >
                        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 opacity-70" />}
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button
                        onClick={onClose}
                        className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

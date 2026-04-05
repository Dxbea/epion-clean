import React, { useState } from 'react';
import { Sparkles, MessageSquare, MessageCircle, Share2, Info, X, Copy, Check, Highlighter } from 'lucide-react';
import ReactionButtons from '@/components/ui/ReactionButtons';
import SaveButton from '@/components/ui/SaveButton';

type Props = {
    articleId: string;
    onOpenComments: () => void;
    commentCount?: number;
    onSummarize: () => void;
    onChat: () => void;
    onFactCheck: () => void;
    onShowPrompt: () => void;
    summaryText?: string;
    summaryLoading?: boolean;
    promptText?: string;
    isHighlightActive?: boolean;
    onHighlightClick?: () => void;
};

type Section = 'interactions' | 'summarize' | 'info' | null;

export default function ArticleActionBar({
    articleId,
    onOpenComments,
    commentCount = 0,
    onSummarize,
    onChat,
    onFactCheck,
    onShowPrompt,
    summaryText,
    summaryLoading,
    promptText,
    isHighlightActive,
    onHighlightClick
}: Props) {
    const [activeSection, setActiveSection] = useState<Section>(null);
    const [copied, setCopied] = useState(false);

    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href);
        alert('Link copied to clipboard!');
    };

    const handleCopy = () => {
        if (summaryText) {
            navigator.clipboard.writeText(summaryText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const toggleSection = (section: Section) => {
        if (activeSection === section) {
            setActiveSection(null);
        } else {
            setActiveSection(section);
            if (section === 'summarize') onSummarize();
            if (section === 'info') onShowPrompt();
        }
    };

    // Responsive width logic
    const getWidth = () => {
        if (!activeSection) return '330px';
        if (activeSection === 'interactions') return '330px';
        // For summarize/info: 85vw on mobile, 75vw on desktop
        return 'var(--expanded-width, 75vw)';
    };

    return (
        <>
            <style>
                {`
                @media (max-width: 640px) {
                    :root { --expanded-width: 85vw; }
                }
                @media (min-width: 641px) {
                    :root { --expanded-width: 75vw; }
                }
                `}
            </style>

            {/* SVG Gradients Definitions */}
            <svg width="0" height="0" className="absolute">
                <defs>
                    <linearGradient id="grad-summarize" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#2dd4bf" />
                        <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                    <linearGradient id="grad-chat" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#34d399" />
                        <stop offset="100%" stopColor="#14b8a6" />
                    </linearGradient>
                    <linearGradient id="grad-check" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#4f46e5" />
                    </linearGradient>
                    <linearGradient id="grad-highlight" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#14b8a6" />
                        <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                </defs>
            </svg>

            <div
                style={{ width: getWidth() }}
                className={`fixed bottom-6 left-1/2 z-50 transition-all duration-500 -translate-x-1/2 flex flex-col items-center bg-white/90 backdrop-blur-xl dark:bg-neutral-900/90 border border-black/5 dark:border-white/10 shadow-2xl rounded-[32px] overflow-hidden ${activeSection ? 'p-4 gap-4' : 'p-2 gap-0'
                    }`}
            >
                {/* CONTENT PANELS */}
                <div className={`w-full overflow-hidden transition-all duration-500 ${activeSection ? 'max-h-[500px] opacity-100 mb-2' : 'max-h-0 opacity-0'
                    }`}>

                    {/* 1. INTERACTIONS PANEL */}
                    {activeSection === 'interactions' && (
                        <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="px-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                                    Interactions
                                </span>
                            </div>
                            <div className="flex flex-col gap-2">
                                <ReactionButtons articleId={articleId} variant="expanded-menu" />
                                <SaveButton
                                    articleId={articleId}
                                    variant="expanded-menu"
                                    className="border border-black/5 dark:border-white/5"
                                />
                                <button
                                    onClick={handleShare}
                                    className="cursor-pointer group relative flex w-full h-12 items-center gap-3 rounded-xl px-4 text-[15px] font-medium transition-all active:scale-95 border border-black/5 dark:border-white/5 bg-transparent hover:bg-black/5 dark:hover:bg-white/10 text-neutral-800 dark:text-neutral-200"
                                >
                                    <Share2 className="h-5 w-5 transition-transform group-hover:scale-110 text-neutral-800" />
                                    <span>Share Article</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 2. SUMMARIZE PANEL */}
                    {activeSection === 'summarize' && (
                        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="flex items-center justify-between px-2">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="h-5 w-5 text-teal-500" />
                                    <span className="text-sm font-bold text-neutral-800 dark:text-neutral-100">AI Summary</span>
                                </div>
                                <button
                                    onClick={handleCopy}
                                    disabled={summaryLoading || !summaryText}
                                    className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                >
                                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-neutral-400" />}
                                </button>
                            </div>
                            <div className="px-2 min-h-[100px] max-h-[300px] overflow-y-auto">
                                {summaryLoading ? (
                                    <div className="space-y-2 animate-pulse">
                                        <div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded w-3/4" />
                                        <div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded w-full" />
                                        <div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded w-5/6" />
                                    </div>
                                ) : (
                                    <p className="text-[15px] leading-relaxed text-neutral-600 dark:text-neutral-300">
                                        {summaryText || "No summary available."}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 3. INFO/PROMPT PANEL */}
                    {activeSection === 'info' && (
                        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="px-2">
                                <div className="flex items-center gap-2">
                                    <Info className="h-5 w-5 text-blue-500" />
                                    <span className="text-sm font-bold text-neutral-800 dark:text-neutral-100">AI Generation Context</span>
                                </div>
                            </div>
                            <div className="px-2 space-y-3">
                                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                    Transparency on content creation. Here is the prompt used to generate this article.
                                </p>
                                <div className="rounded-xl border border-black/5 bg-black/5 p-4 font-mono text-[11px] leading-relaxed text-neutral-700 dark:border-white/5 dark:bg-white/5 dark:text-neutral-300 max-h-[200px] overflow-y-auto">
                                    {promptText ? (
                                        <div className="whitespace-pre-wrap">{promptText}</div>
                                    ) : (
                                        <div className="italic opacity-50">No prompt context available.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="mt-4 h-px bg-neutral-100 dark:bg-neutral-800" />
                </div>

                {/* PRIMARY ACTIONS (Bottom Row) */}
                <div className="flex items-center gap-1 w-full justify-between px-1">

                    {/* LEFT: Interaction Trigger & Comments */}
                    <div className="flex items-center gap-1">
                        <button
                            className={`group relative flex h-10 w-10 items-center justify-center rounded-full transition-all flex-shrink-0 ${activeSection === 'interactions' ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-black/5 dark:hover:bg-white/10 text-neutral-400'
                                }`}
                            title="Interact"
                            onClick={() => toggleSection('interactions')}
                        >
                            {activeSection === 'interactions' ? (
                                <X className="h-5 w-5 animate-in spin-in-90 duration-200" />
                            ) : (
                                <Share2 className="h-5 w-5 transition-transform group-hover:scale-110" />
                            )}
                        </button>

                        <button
                            className="group relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                            onClick={onOpenComments}
                            title="Comments"
                        >
                            <MessageCircle className="h-5 w-5 text-neutral-400 transition-transform group-hover:scale-110 hover:text-black dark:text-neutral-500 dark:hover:text-white" />
                            {commentCount > 0 && (
                                <span className="absolute -right-0 -top-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm">
                                    {commentCount > 9 ? '9+' : commentCount}
                                </span>
                            )}
                        </button>
                    </div>

                    <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-800 mx-1 flex-shrink-0" />

                    {/* MIDDLE/RIGHT: AI Actions & Info */}
                    <div className="flex items-center gap-1">
                        <button
                            className={`group relative flex h-10 w-10 items-center justify-center rounded-full transition-all ${activeSection === 'summarize' ? 'bg-teal-50 dark:bg-teal-900/30' : 'hover:bg-black/5 dark:hover:bg-white/10'
                                }`}
                            title="Summarize"
                            onClick={() => toggleSection('summarize')}
                        >
                            <Sparkles
                                className="h-5 w-5 transition-transform group-hover:scale-110"
                                style={{ stroke: 'url(#grad-summarize)' }}
                            />
                        </button>

                        <button
                            className="group relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                            title="Chat with article"
                            onClick={onChat}
                        >
                            <MessageSquare
                                className="h-5 w-5 transition-transform group-hover:scale-110"
                                style={{ stroke: 'url(#grad-chat)' }}
                            />
                        </button>

                        <button
                            className={`group relative flex h-10 w-10 items-center justify-center rounded-full transition-all flex-shrink-0 ${isHighlightActive ? 'bg-cyan-50 dark:bg-cyan-900/30' : 'hover:bg-black/5 dark:hover:bg-white/10 dark:hover:bg-white/5'
                                }`}
                            title="Surligner"
                            onClick={onHighlightClick}
                        >
                            <Highlighter
                                className="h-5 w-5 transition-transform group-hover:scale-110"
                                style={{ stroke: 'url(#grad-highlight)' }}
                            />
                        </button>

                        <button
                            className={`group relative flex h-10 w-10 items-center justify-center rounded-full transition-all ${activeSection === 'info' ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-black/5 dark:hover:bg-white/10'
                                }`}
                            title="Analysis Info"
                            onClick={() => toggleSection('info')}
                        >
                            <Info
                                className="h-5 w-5 transition-transform group-hover:scale-110"
                                style={{ stroke: 'url(#grad-check)' }}
                            />
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

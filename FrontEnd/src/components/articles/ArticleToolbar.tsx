
import React from 'react';
import { Sparkles, MessageSquare, ShieldCheck, MessageCircle, Share2, Info } from 'lucide-react';

type Props = {
    onOpenComments: () => void;
    commentCount?: number;
    onSummarize: () => void;
    onChat: () => void;
    onFactCheck: () => void;
    onShowPrompt: () => void;
};

export default function ArticleToolbar({
    onOpenComments,
    commentCount = 0,
    onSummarize,
    onChat,
    onFactCheck,
    onShowPrompt
}: Props) {
    return (
        <>
            {/* SVG Gradients Definitions */}
            <svg width="0" height="0" className="absolute">
                <defs>
                    <linearGradient id="grad-summarize" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#2dd4bf" /> {/* teal-400 */}
                        <stop offset="100%" stopColor="#3b82f6" /> {/* blue-500 */}
                    </linearGradient>
                    <linearGradient id="grad-chat" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#34d399" /> {/* emerald-400 */}
                        <stop offset="100%" stopColor="#14b8a6" /> {/* teal-500 */}
                    </linearGradient>
                    <linearGradient id="grad-check" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#3b82f6" /> {/* blue-500 */}
                        <stop offset="100%" stopColor="#4f46e5" /> {/* indigo-600 */}
                    </linearGradient>
                </defs>
            </svg>

            <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-black/5 bg-white px-2 py-2 shadow-2xl shadow-black/10 dark:border-white/10 dark:bg-neutral-900">

                {/* AI Actions Group */}
                <div className="flex items-center gap-1 px-1">
                    <button
                        className="group relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                        title="Analysis Info"
                        onClick={onShowPrompt}
                    >
                        <Info className="h-5 w-5 text-neutral-400 transition-transform group-hover:scale-110 hover:text-black dark:text-neutral-500 dark:hover:text-white" />
                    </button>

                    <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-800 mx-1" />

                    <button
                        className="group relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                        title="Summarize"
                        onClick={onSummarize}
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
                        className="group relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                        title="Fact Check"
                        onClick={onFactCheck}
                    >
                        <ShieldCheck
                            className="h-5 w-5 transition-transform group-hover:scale-110"
                            style={{ stroke: 'url(#grad-check)' }}
                        />
                    </button>
                </div>

                {/* Separator */}
                <div className="h-6 w-px bg-neutral-200 dark:bg-neutral-800" />

                {/* User Actions Group */}
                <div className="flex items-center gap-1 px-1">
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

                    <button
                        className="group relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                        title="Share"
                        onClick={() => {
                            navigator.clipboard.writeText(window.location.href);
                            alert('Link copied to clipboard!');
                        }}
                    >
                        <Share2 className="h-5 w-5 text-neutral-400 transition-transform group-hover:scale-110 hover:text-black dark:text-neutral-500 dark:hover:text-white" />
                    </button>
                </div>
            </div>
        </>
    );
}

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, Forward, Heart, Highlighter, Info, MessageSquare, X } from 'lucide-react';
import { FaFacebookF, FaFacebookMessenger, FaInstagram, FaLinkedinIn, FaRedditAlien, FaWhatsapp, FaXTwitter } from 'react-icons/fa6';
import type { IconType } from 'react-icons';

import ReactionButtons from '@/components/ui/ReactionButtons';
import SaveButton from '@/components/ui/SaveButton';
import { useI18n } from '@/i18n/I18nContext';

type Props = {
    articleId: string;
    onChat: () => void;
    onFactCheck: () => void;
    onShowPrompt: () => void;
    promptText?: string;
    isHighlightActive?: boolean;
    onHighlightClick?: () => void;
};

type Section = 'share' | 'interactions' | 'info' | null;
type ToolbarAction = 'share' | 'interactions' | 'chat' | 'highlight' | 'info';
type CopyState = 'idle' | 'copied' | 'error';
type ShareDestination = {
    label: string;
    icon: IconType;
    href?: string;
    fallback?: boolean;
    title?: string;
};

const TOOLBAR_DRAG_THRESHOLD_PX = 10;

export default function ArticleActionBar({
    articleId,
    onChat,
    onShowPrompt,
    promptText,
    isHighlightActive,
    onHighlightClick
}: Props) {
    const [activeSection, setActiveSection] = useState<Section>(null);
    const [copyState, setCopyState] = useState<CopyState>('idle');
    const actionsRef = React.useRef<HTMLDivElement>(null);
    const actionDragRef = React.useRef<{ pointerId: number; startX: number; currentX: number; didDrag: boolean } | null>(null);
    const suppressActionClickRef = React.useRef(false);
    const [actionDragPercent, setActionDragPercent] = React.useState<number | null>(null);
    const [actionPreviewIndex, setActionPreviewIndex] = React.useState<number | null>(null);
    const { t, locale } = useI18n();

    const isFrench = locale.startsWith('fr');
    const newsLabel = t('nav_news') || (isFrench ? 'Actualites' : 'News');
    const shareLabel = isFrench ? 'Partager' : 'Share';
    const copyLabel = isFrench ? 'Copier' : 'Copy';
    const copiedLabel = isFrench ? 'Copié' : 'Copied';
    const copyErrorLabel = isFrench ? 'Copie indisponible' : 'Copy unavailable';
    const articleUrl = typeof window !== 'undefined' ? window.location.href : '';
    const articleTitle = typeof document !== 'undefined' ? document.title : 'Epion article';
    const encodedUrl = encodeURIComponent(articleUrl);
    const encodedTitle = encodeURIComponent(articleTitle);
    const encodedText = encodeURIComponent(articleTitle + ' ' + articleUrl);

    const toolbarActions: ToolbarAction[] = ['share', 'interactions', 'chat', 'highlight', 'info'];
    const toolbarItemWidth = 100 / toolbarActions.length;
    const activeActionIndex = actionPreviewIndex ?? (activeSection ? toolbarActions.indexOf(activeSection) : isHighlightActive ? toolbarActions.indexOf('highlight') : -1);
    const actionIndicatorPercent = actionDragPercent ?? (activeActionIndex >= 0 ? activeActionIndex * toolbarItemWidth : null);

    const shareDestinations: ShareDestination[] = [
        { label: 'X', icon: FaXTwitter, href: 'https://twitter.com/intent/tweet?url=' + encodedUrl + '&text=' + encodedTitle },
        {
            label: 'Instagram',
            icon: FaInstagram,
            fallback: true,
            title: isFrench
                ? 'Instagram ne propose pas de lien web fiable pour partager une URL. Utilise le partage natif ou copie le lien.'
                : 'Instagram does not provide a reliable web URL share endpoint. Use native share or copy the link.',
        },
        { label: 'WhatsApp', icon: FaWhatsapp, href: 'https://wa.me/?text=' + encodedText },
        { label: 'Facebook', icon: FaFacebookF, href: 'https://www.facebook.com/sharer/sharer.php?u=' + encodedUrl },
        {
            label: 'Messenger',
            icon: FaFacebookMessenger,
            fallback: true,
            title: isFrench
                ? 'Messenger demande une integration app fiable. Utilise le partage natif ou copie le lien.'
                : 'Messenger requires a reliable app integration. Use native share or copy the link.',
        },
        { label: 'Reddit', icon: FaRedditAlien, href: 'https://www.reddit.com/submit?url=' + encodedUrl + '&title=' + encodedTitle },
        { label: 'LinkedIn', icon: FaLinkedinIn, href: 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodedUrl },
    ];

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(articleUrl);
            setCopyState('copied');
            window.setTimeout(() => setCopyState('idle'), 1800);
        } catch {
            setCopyState('error');
            window.setTimeout(() => setCopyState('idle'), 1800);
        }
    };


    const handleFallbackShare = async () => {
        if (typeof navigator !== 'undefined' && navigator.share) {
            try {
                await navigator.share({ title: articleTitle, url: articleUrl });
                return;
            } catch (error: any) {
                if (error?.name === 'AbortError') return;
            }
        }

        await handleCopy();
    };

    const openToolbarAction = React.useCallback((action: ToolbarAction, source: 'click' | 'drag') => {
        if (action === 'share' || action === 'interactions' || action === 'info') {
            if (source === 'click' && activeSection === action) {
                setActiveSection(null);
                return;
            }
            setActiveSection(action);
            if (action === 'info') onShowPrompt();
            return;
        }

        if (action === 'chat') {
            setActiveSection(null);
            onChat();
            return;
        }

        setActiveSection(null);
        onHighlightClick?.();
    }, [activeSection, onChat, onHighlightClick, onShowPrompt]);

    const getActionPercentFromClientX = React.useCallback((clientX: number) => {
        const track = actionsRef.current;
        if (!track) return 0;
        const rect = track.getBoundingClientRect();
        if (rect.width <= 0) return 0;
        const raw = ((clientX - rect.left) / rect.width) * 100 - toolbarItemWidth / 2;
        return Math.max(0, Math.min(100 - toolbarItemWidth, raw));
    }, [toolbarItemWidth]);

    const getClosestActionIndex = React.useCallback((percent: number) => {
        return Math.max(0, Math.min(toolbarActions.length - 1, Math.round(percent / toolbarItemWidth)));
    }, [toolbarActions.length, toolbarItemWidth]);

    const handleActionPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        actionDragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            currentX: event.clientX,
            didDrag: false,
        };
    };

    const handleActionPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = actionDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        const deltaX = event.clientX - drag.startX;
        drag.currentX = event.clientX;

        if (!drag.didDrag && Math.abs(deltaX) < TOOLBAR_DRAG_THRESHOLD_PX) return;

        if (!drag.didDrag) {
            drag.didDrag = true;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setActionPreviewIndex(null);
        }

        event.preventDefault();
        setActionDragPercent(getActionPercentFromClientX(event.clientX));
    };

    const finishActionDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = actionDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }

        actionDragRef.current = null;

        if (!drag.didDrag) {
            setActionDragPercent(null);
            return;
        }

        const closestIndex = getClosestActionIndex(getActionPercentFromClientX(drag.currentX));
        setActionDragPercent(null);
        setActionPreviewIndex(closestIndex);
        suppressActionClickRef.current = true;
        window.setTimeout(() => {
            suppressActionClickRef.current = false;
            setActionPreviewIndex(null);
        }, 0);
        openToolbarAction(toolbarActions[closestIndex], 'drag');
    };

    const cancelActionDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        actionDragRef.current = null;
        setActionDragPercent(null);
        setActionPreviewIndex(null);
    };

    const handleActionClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!suppressActionClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressActionClickRef.current = false;
    };
    const getWidth = () => {
        if (!activeSection) return 'min(94vw, 430px)';
        if (activeSection === 'share' || activeSection === 'interactions') return 'min(94vw, 430px)';
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

            <svg width="0" height="0" className="absolute">
                <defs>
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
                style={{
                    width: getWidth(),
                    bottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
                }}
                className={`fixed left-1/2 z-50 transition-all duration-500 -translate-x-1/2 flex flex-col items-center bg-white/90 backdrop-blur-xl dark:bg-neutral-900/90 border border-black/5 dark:border-white/10 shadow-2xl rounded-[32px] overflow-hidden ${activeSection ? 'p-4 gap-4' : 'p-2 gap-0'
                    }`}
            >
                <div className={`w-full overflow-hidden transition-all duration-500 ${activeSection ? 'max-h-[500px] opacity-100 mb-2' : 'max-h-0 opacity-0'
                    }`}>

                    {activeSection === 'share' && (
                        <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="px-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                                    {shareLabel}
                                </span>
                            </div>

                            <div className="flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                {shareDestinations.map((destination) => {
                                    const Icon = destination.icon;
                                    const content = (
                                        <>
                                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-black/5 bg-black/[0.03] transition-colors dark:border-white/5 dark:bg-white/[0.05]">
                                                <Icon className="h-5 w-5" />
                                            </span>
                                            <span className="max-w-[4.5rem] truncate text-[11px] font-medium leading-none">{destination.label}</span>
                                        </>
                                    );

                                    if (destination.href) {
                                        return (
                                            <a
                                                key={destination.label}
                                                href={destination.href}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex h-[72px] w-16 flex-shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl text-neutral-700 transition-all hover:bg-black/5 active:scale-95 dark:text-neutral-200 dark:hover:bg-white/10"
                                            >
                                                {content}
                                            </a>
                                        );
                                    }

                                    return (
                                        <button
                                            key={destination.label}
                                            type="button"
                                            title={destination.title}
                                            onClick={handleFallbackShare}
                                            className="flex h-[72px] w-16 flex-shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl text-neutral-500 opacity-75 transition-all hover:bg-black/5 hover:opacity-100 active:scale-95 dark:text-neutral-400 dark:hover:bg-white/10"
                                        >
                                            {content}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className={`flex items-center gap-2 rounded-2xl border p-1.5 transition-colors ${copyState === 'copied'
                                ? 'border-emerald-400/70 bg-emerald-500/10 dark:border-emerald-400/50 dark:bg-emerald-400/10'
                                : copyState === 'error'
                                    ? 'border-red-400/60 bg-red-500/10 dark:border-red-400/50 dark:bg-red-400/10'
                                    : 'border-black/5 bg-black/[0.03] dark:border-white/5 dark:bg-white/[0.04]'
                                }`}
                            >
                                {copyState === 'copied' && <Check className="h-4 w-4 flex-shrink-0 text-emerald-500" />}
                                <input
                                    readOnly
                                    value={articleUrl}
                                    className="min-w-0 flex-1 bg-transparent px-2 text-xs text-neutral-600 outline-none dark:text-neutral-300"
                                    aria-label="Article URL"
                                />
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className="h-9 rounded-full bg-neutral-950 px-3 text-xs font-semibold text-white transition-all hover:bg-neutral-800 active:scale-95 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
                                >
                                    {copyState === 'copied' ? copiedLabel : copyState === 'error' ? copyErrorLabel : copyLabel}
                                </button>
                            </div>
                        </div>
                    )}
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
                            </div>
                        </div>
                    )}

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

                <div className="flex min-h-[44px] items-center gap-1 w-full justify-between px-1">
                    <Link
                        to="/news"
                        className="group flex h-11 min-w-0 flex-shrink items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-neutral-700 transition-all hover:bg-black/5 hover:text-neutral-950 active:scale-95 dark:text-neutral-200 dark:hover:bg-white/10 dark:hover:text-white"
                        aria-label={newsLabel}
                    >
                        <ChevronLeft className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{newsLabel}</span>
                    </Link>

                    <div className="h-5 w-px bg-neutral-200 dark:bg-neutral-800 mx-1 flex-shrink-0" />

                    <div
                        ref={actionsRef}
                        data-article-toolbar-actions
                        className="relative grid flex-shrink-0 touch-pan-y select-none grid-cols-5 gap-1 overflow-hidden rounded-full"
                        onPointerDown={handleActionPointerDown}
                        onPointerMove={handleActionPointerMove}
                        onPointerUp={finishActionDrag}
                        onPointerCancel={cancelActionDrag}
                        onClickCapture={handleActionClickCapture}
                    >
                        {actionIndicatorPercent !== null && (
                            <span
                                data-article-toolbar-indicator
                                aria-hidden="true"
                                className="absolute bottom-0 top-0 rounded-full bg-black text-white transition-[left] duration-300 ease-out motion-reduce:transition-none dark:bg-white dark:text-black"
                                style={{
                                    width: `calc(${toolbarItemWidth}% - 0.25rem)`,
                                    left: `calc(${actionIndicatorPercent}% + 0.125rem)`,
                                    transitionDuration: actionDragPercent === null ? undefined : '80ms',
                                }}
                            />
                        )}

                        <button
                            className={`group relative z-10 flex h-10 w-10 touch-manipulation items-center justify-center rounded-full transition-all active:scale-95 ${activeSection === 'share' ? 'text-white dark:text-black' : 'hover:bg-black/5 dark:hover:bg-white/10 text-neutral-400'
                                }`}
                            title={shareLabel}
                            aria-label={shareLabel}
                            onClick={() => openToolbarAction('share', 'click')}
                        >
                            {activeSection === 'share' ? (
                                <X className="h-5 w-5 animate-in spin-in-90 duration-200" />
                            ) : (
                                <Forward className="h-5 w-5 transition-transform group-hover:scale-110" />
                            )}
                        </button>

                        <button
                            className={`group relative z-10 flex h-10 w-10 touch-manipulation items-center justify-center rounded-full transition-all flex-shrink-0 ${activeSection === 'interactions' ? 'text-white dark:text-black' : 'hover:bg-black/5 dark:hover:bg-white/10 text-neutral-400'
                                }`}
                            title="Interact"
                            onClick={() => openToolbarAction('interactions', 'click')}
                        >
                            {activeSection === 'interactions' ? (
                                <X className="h-5 w-5 animate-in spin-in-90 duration-200" />
                            ) : (
                                <Heart className="h-5 w-5 transition-transform group-hover:scale-110" />
                            )}
                        </button>

                        <button
                            className="group relative z-10 flex h-10 w-10 touch-manipulation items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                            title="Chat with article"
                            onClick={() => openToolbarAction('chat', 'click')}
                        >
                            <MessageSquare
                                className="h-5 w-5 transition-transform group-hover:scale-110"
                                style={{ stroke: 'url(#grad-chat)' }}
                            />
                        </button>

                        <button
                            className={`group relative z-10 flex h-10 w-10 touch-manipulation items-center justify-center rounded-full transition-all flex-shrink-0 ${isHighlightActive ? 'text-cyan-700 dark:text-cyan-200' : 'hover:bg-black/5 dark:hover:bg-white/10 dark:hover:bg-white/5'
                                }`}
                            title="Surligner"
                            onClick={() => openToolbarAction('highlight', 'click')}
                        >
                            <Highlighter
                                className="h-5 w-5 transition-transform group-hover:scale-110"
                                style={{ stroke: 'url(#grad-highlight)' }}
                            />
                        </button>

                        <button
                            className={`group relative z-10 flex h-10 w-10 touch-manipulation items-center justify-center rounded-full transition-all ${activeSection === 'info' ? 'text-white dark:text-black' : 'hover:bg-black/5 dark:hover:bg-white/10'
                                }`}
                            title="Analysis Info"
                            onClick={() => openToolbarAction('info', 'click')}
                        >
                            <Info
                                className="h-5 w-5 transition-transform group-hover:scale-110"
                                style={{ stroke: activeSection === 'info' ? 'currentColor' : 'url(#grad-check)' }}
                            />
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

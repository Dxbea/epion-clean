import React, { useEffect, useRef } from 'react';
import CommentForm from '../comments/CommentForm';
import CommentItem from '../comments/CommentItem';
import { useMe } from '@/contexts/MeContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { X } from 'lucide-react';
import { CommentDTO } from '@/types/social';

type Props = {
    articleId: string;
    isOpen: boolean;
    onClose: () => void;
    // Props from useComments
    items: CommentDTO[];
    nextCursor: string | null;
    loadMore: () => void;
    postComment: (content: string, parentId?: string) => Promise<CommentDTO | null>;
    deleteComment: (id: string) => Promise<void>;
    loadReplies: (commentId: string) => Promise<CommentDTO[]>;
};

export default function CommentsDrawer({
    articleId,
    isOpen,
    onClose,
    items,
    nextCursor,
    loadMore,
    postComment,
    deleteComment,
    loadReplies,
}: Props) {
    // const comments = useComments(articleId); // Removing internal hook call

    const { me } = useMe();
    const { requireAuth } = useAuthPrompt();
    const drawerRef = useRef<HTMLDivElement>(null);

    // Close on Escape
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    // Auth guard helper
    const ensureAuth = React.useCallback(
        (msgForGuest: string): boolean => {
            if (!me) {
                requireAuth({
                    message: msgForGuest,
                    redirectTo: '/settings#account',
                });
                return false;
            }
            if (!me.emailVerifiedAt) {
                requireAuth({
                    message:
                        'You need to verify your email address before using comments. Go to Settings → Account to resend the verification link.',
                    redirectTo: '/settings#account',
                });
                return false;
            }
            return true;
        },
        [me, requireAuth],
    );

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 z-[60] bg-black/50 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                onClick={onClose}
            />

            {/* Bottom Sheet */}
            <aside
                ref={drawerRef}
                className={`fixed inset-x-0 bottom-0 z-[70] flex w-full flex-col bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-transform duration-300 dark:bg-neutral-900 rounded-t-3xl max-h-[85vh] ${isOpen ? 'translate-y-0' : 'translate-y-full'
                    }`}
            >
                {/* Handle */}
                <div className="flex justify-center pt-3 pb-1" onClick={onClose} >
                    <div className="h-1.5 w-12 rounded-full bg-neutral-200 dark:bg-neutral-800" />
                </div>

                {/* Header */}
                <header className="flex items-center justify-between border-b border-black/5 px-4 pb-3 pt-1 dark:border-white/5">
                    <h2 className="text-lg font-semibold">
                        Commentaires {items.length > 0 && `(${items.length})`}
                    </h2>
                    <button
                        onClick={onClose}
                        className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10"
                    >
                        <X className="h-5 w-5 opacity-70" />
                    </button>
                </header>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto px-4 py-4">
                    <div className="space-y-6 pb-20"> {/* pb-20 for bottom safe area */}
                        {/* Form */}
                        <div className="rounded-xl bg-neutral-50 p-4 dark:bg-neutral-800/50">
                            <CommentForm
                                onSubmit={async (t) => {
                                    if (!ensureAuth('You need an account to post comments.')) return;
                                    await postComment(t);
                                }}
                            />
                        </div>

                        {/* List */}
                        <div className="space-y-4">
                            {items.length === 0 ? (
                                <p className="py-8 text-center text-sm opacity-60">
                                    No comments yet. Be the first to verify!
                                </p>
                            ) : (
                                items.map((c) => (
                                    <CommentItem
                                        key={c.id}
                                        c={c}
                                        onReply={async (pid, text) => {
                                            if (!ensureAuth('You need an account to reply.')) return;
                                            await postComment(text, pid);
                                        }}
                                        onDelete={async (id) => {
                                            if (!ensureAuth('You need an account to delete comments.')) return;
                                            await deleteComment(id);
                                        }}
                                        loadReplies={loadReplies}
                                    />
                                ))
                            )}
                        </div>

                        {/* Load More */}
                        {nextCursor && (
                            <div className="flex justify-center py-4">
                                <button
                                    onClick={loadMore}
                                    className="rounded-full border px-4 py-2 text-sm hover:bg-black/5 dark:border-white/10"
                                >
                                    Load more
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </aside>
        </>
    );
}

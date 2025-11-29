// FrontEnd/src/components/comments/CommentsBlock.tsx
import React from 'react';
import { useComments } from '@/hooks/useComments';
import CommentForm from './CommentForm';
import CommentItem from './CommentItem';
import { useMe } from '@/contexts/MeContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';

export default function CommentsBlock({ articleId }: { articleId?: string }) {
  const {
    items,
    nextCursor,
    loadMore,
    postComment,
    deleteComment,
    loadReplies,
    reload,
  } = useComments(articleId);

  const { me } = useMe();
  const { requireAuth } = useAuthPrompt();
  const isGuest = !me;

  const ensureAuth = React.useCallback(
    (msg: string): boolean => {
      if (!isGuest) return true;
      requireAuth({ message: msg });
      return false;
    },
    [isGuest, requireAuth]
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Comments</h3>
        <button
          onClick={reload}
          className="text-sm opacity-70 hover:opacity-100"
        >
          Refresh
        </button>
      </div>

      {/* Nouveau commentaire */}
      <CommentForm
        onSubmit={async (t) => {
          if (!ensureAuth('You need an account to post comments.')) return;
          await postComment(t);
        }}
      />

      {/* Liste des commentaires */}
      <div className="space-y-3">
        {items.map((c) => (
          <CommentItem
            key={c.id}
            c={c}
            onReply={async (pid, text) => {
              if (!ensureAuth('You need an account to reply to comments.')) return;
              await postComment(text, pid);
            }}
            onDelete={async (id) => {
              if (!ensureAuth('You need an account to manage comments.')) return;
              await deleteComment(id);
            }}
            loadReplies={loadReplies}
          />
        ))}
      </div>

      {nextCursor && (
        <div className="flex justify-center">
          <button
            onClick={loadMore}
            className="rounded-full border px-4 py-2 text-sm hover:bg-black/5 dark:border-white/10"
          >
            Load more
          </button>
        </div>
      )}
    </section>
  );
}

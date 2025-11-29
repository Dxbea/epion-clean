// FrontEnd/src/components/comments/CommentItem.tsx
import React from 'react';
import type { CommentDTO } from '@/types/social';
import CommentForm from './CommentForm';

type CommentItemProps = {
  c: CommentDTO;
  onReply: (parentId: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  loadReplies: (commentId: string) => Promise<CommentDTO[]>;
};

export default function CommentItem({
  c,
  onReply,
  onDelete,
  loadReplies,
}: CommentItemProps) {
  const [showReply, setShowReply] = React.useState(false);
  const [replies, setReplies] = React.useState<CommentDTO[] | null>(null);
  const [loadingReplies, setLoadingReplies] = React.useState(false);

  async function openReplies() {
    // déjà chargées → on ne relance pas la requête
    if (replies !== null) return;
    setLoadingReplies(true);
    try {
      const data = await loadReplies(c.id);
      setReplies(data);
    } finally {
      setLoadingReplies(false);
    }
  }

  const authorLabel =
    c.author?.name ?? c.author?.email ?? '—';
  const createdLabel = new Date(c.createdAt).toLocaleString();

  return (
    <div className="rounded-xl border border-black/10 p-3 dark:border-white/10">
      {/* Header auteur / date */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">
          {authorLabel}
        </div>
        <div className="text-xs opacity-60">
          {createdLabel}
        </div>
      </div>

      {/* Contenu du commentaire (rendu pur texte, avec retours à la ligne) */}
      <div className="mt-1 text-sm whitespace-pre-line">
        {c.content}
      </div>

      {/* Actions */}
      <div className="mt-2 flex items-center gap-3 text-xs">
        {typeof c.repliesCount === 'number' && c.repliesCount > 0 && (
          <button
            type="button"
            onClick={openReplies}
            className="hover:underline disabled:opacity-50"
            disabled={loadingReplies}
          >
            {loadingReplies
              ? 'Loading…'
              : `View replies (${c.repliesCount})`}
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowReply((s) => !s)}
          className="hover:underline"
        >
          Reply
        </button>

        <button
          type="button"
          onClick={() => onDelete(c.id)}
          className="text-red-600 hover:underline"
        >
          Delete
        </button>
      </div>

      {/* Formulaire de réponse */}
      {showReply && (
        <div className="mt-2">
          <CommentForm
            onSubmit={async (text) => {
              await onReply(c.id, text);
              setShowReply(false);
              // après réponse, on force le chargement des replies
              if (replies === null) {
                await openReplies();
              }
            }}
            autoFocus
            placeholder="Reply…"
          />
        </div>
      )}

      {/* Liste de réponses */}
      {replies && replies.length > 0 && (
        <div className="mt-3 space-y-2 border-l pl-3">
          {replies.map((r) => {
            const replyAuthor =
              r.author?.name ?? r.author?.email ?? '—';
            const replyDate = new Date(r.createdAt).toLocaleString();

            return (
              <div key={r.id} className="text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium">
                    {replyAuthor}
                  </div>
                  <div className="text-xs opacity-60">
                    {replyDate}
                  </div>
                </div>
                <div className="mt-1 whitespace-pre-line">
                  {r.content}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

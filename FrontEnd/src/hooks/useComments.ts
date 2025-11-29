// FrontEnd/src/hooks/useComments.ts
import React from 'react';
import { API_BASE } from '@/config/api';
import type { CommentDTO, CommentsPage } from '@/types/social';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { withCsrf } from '@/lib/csrf';

export function useComments(articleId?: string) {
  const [items, setItems] = React.useState<CommentDTO[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const { requireAuth } = useAuthPrompt();

  const loadInitial = React.useCallback(async () => {
    if (!articleId) return;
    setLoading(true);
    try {
      const r = await fetch(
        `${API_BASE}/api/articles/${articleId}/comments?take=20`,
        {
          credentials: 'include',
        }
      );
      if (r.ok) {
        const j: CommentsPage = await r.json();
        setItems(j.items);
        setNextCursor(j.nextCursor);
      }
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  React.useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const loadMore = React.useCallback(async () => {
    if (!articleId || !nextCursor) return;
    setLoading(true);
    try {
      const r = await fetch(
        `${API_BASE}/api/articles/${articleId}/comments?take=20&cursor=${encodeURIComponent(
          nextCursor
        )}`,
        {
          credentials: 'include',
        }
      );
      if (r.ok) {
        const j: CommentsPage = await r.json();
        setItems((prev) => [...prev, ...j.items]);
        setNextCursor(j.nextCursor);
      }
    } finally {
      setLoading(false);
    }
  }, [articleId, nextCursor]);

  const postComment = React.useCallback(
    async (content: string, parentId?: string) => {
      if (!articleId) return null;

      const body = JSON.stringify(
        parentId ? { content, parentId } : { content }
      );

      const init = await withCsrf({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      const r = await fetch(
        `${API_BASE}/api/articles/${articleId}/comments`,
        init
      );

      if (r.status === 401) {
        requireAuth({
          message: 'You need to sign in to comment on articles.',
        });
        return null;
      }

      if (!r.ok) throw new Error('Failed');

      const c: CommentDTO = await r.json();

      // On garde le comportement actuel : les réponses ne re-populent pas la liste à plat
      setItems((prev) => (parentId ? prev : [c, ...prev]));
      return c;
    },
    [articleId, requireAuth]
  );

  const deleteComment = React.useCallback(async (id: string) => {
    const init = await withCsrf({
      method: 'DELETE',
    });

    const r = await fetch(`${API_BASE}/api/comments/${id}`, init);
    if (r.ok) {
      setItems((prev) => prev.filter((c) => c.id !== id));
    }
  }, []);

  const loadReplies = React.useCallback(async (commentId: string) => {
    const r = await fetch(
      `${API_BASE}/api/comments/${commentId}/replies?take=50`,
      {
        credentials: 'include',
      }
    );
    if (!r.ok) return [];
    const j: CommentsPage = await r.json();
    return j.items;
  }, []);

  return {
    items,
    nextCursor,
    loading,
    loadMore,
    postComment,
    deleteComment,
    loadReplies,
    reload: loadInitial,
  };
}

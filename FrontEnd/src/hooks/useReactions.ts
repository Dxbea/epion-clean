// FrontEnd/src/hooks/useReactions.ts
import React from 'react';
import { API_BASE } from '@/config/api';
import type { ReactionsSummary } from '@/types/social';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { withCsrf } from '@/lib/csrf';

export function useReactions(articleId: string | undefined) {
  const [summary, setSummary] = React.useState<ReactionsSummary>({
    likes: 0,
    likedByMe: false,
  });
  const [loading, setLoading] = React.useState(false);
  const { requireAuth } = useAuthPrompt();

  const fetchReactions = React.useCallback(async () => {
    if (!articleId) return;
    try {
      const r = await fetch(`${API_BASE}/api/articles/${articleId}/reactions`, {
        credentials: 'include',
      });
      if (r.ok) setSummary(await r.json());
    } catch {
      // ignore
    }
  }, [articleId]);

  React.useEffect(() => {
    fetchReactions();
  }, [fetchReactions]);

  const toggleLike = React.useCallback(async () => {
    if (!articleId) return;
    setLoading(true);
    try {
      const r = await fetch(
        `${API_BASE}/api/articles/${articleId}/like`,
        await withCsrf({ method: 'POST' }),
      );

      if (r.status === 401) {
        requireAuth({
          message: 'You need to sign in to like articles.',
        });
        return;
      }

      if (!r.ok) throw new Error('http');
      await fetchReactions();
    } catch {
      await fetchReactions();
    } finally {
      setLoading(false);
    }
  }, [articleId, fetchReactions, requireAuth]);

  return { summary, loading, toggleLike, refresh: fetchReactions };
}

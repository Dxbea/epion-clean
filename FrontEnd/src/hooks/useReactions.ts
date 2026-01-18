// FrontEnd/src/hooks/useReactions.ts
import React from 'react';
import { API_BASE } from '@/config/api';
import type { ReactionsSummary } from '@/types/social';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { withCsrf } from '@/lib/csrf';

export function useReactions(articleId: string | undefined) {
  const [summary, setSummary] = React.useState<{
    likes: number;
    dislikes: number;
    reposts: number;
    userReaction: 'LIKE' | 'DISLIKE' | null;
    userReposted: boolean;
  }>({
    likes: 0,
    dislikes: 0,
    reposts: 0,
    userReaction: null,
    userReposted: false,
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

  const toggleReaction = React.useCallback(async (type: 'LIKE' | 'DISLIKE') => {
    if (!articleId) return;

    // ⚡️ Optimistic Update
    const previous = { ...summary };
    const { likes, dislikes, userReaction } = previous;

    let nextLikes = likes;
    let nextDislikes = dislikes;
    let nextReaction = userReaction;

    if (userReaction === type) {
      // Toggle OFF
      nextReaction = null;
      if (type === 'LIKE') nextLikes = Math.max(0, likes - 1);
      else nextDislikes = Math.max(0, dislikes - 1);
    } else {
      // Toggle ON or Flip
      nextReaction = type;
      if (type === 'LIKE') {
        nextLikes = likes + 1;
        if (userReaction === 'DISLIKE') nextDislikes = Math.max(0, dislikes - 1);
      } else {
        nextDislikes = dislikes + 1;
        if (userReaction === 'LIKE') nextLikes = Math.max(0, likes - 1);
      }
    }

    setSummary({ ...previous, likes: nextLikes, dislikes: nextDislikes, userReaction: nextReaction });

    try {
      const r = await fetch(
        `${API_BASE}/api/articles/${articleId}/react`,
        await withCsrf({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type }),
        }),
      );

      if (r.status === 401) {
        setSummary(previous); // Revert
        requireAuth({ message: 'You need to sign in to react.' });
        return;
      }

      if (!r.ok) throw new Error('http');
      const data = await r.json();
      setSummary(prev => ({ ...prev, likes: data.likes, dislikes: data.dislikes, userReaction: data.userReaction }));
    } catch {
      setSummary(previous);
      await fetchReactions();
    }
  }, [articleId, fetchReactions, requireAuth, summary]);

  const toggleRepost = React.useCallback(async () => {
    if (!articleId) return;

    // Optimistic
    const previous = { ...summary };
    const wasReposted = previous.userReposted;
    const nextReposted = !wasReposted;
    const nextCount = wasReposted ? Math.max(0, previous.reposts - 1) : previous.reposts + 1;

    setSummary({ ...previous, userReposted: nextReposted, reposts: nextCount });

    try {
      const r = await fetch(
        `${API_BASE}/api/social/articles/${articleId}/repost`,
        await withCsrf({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}'
        })
      );

      if (r.status === 401) {
        setSummary(previous);
        requireAuth({ message: 'Sign in to repost.' });
        return;
      }

      if (!r.ok) throw new Error('Failed');

      const data = await r.json();
      // Server returns { reposted: boolean }
      // We might just trust our optimistic or re-fetch?
      // Let's re-fetch to be safe or update local based on server bool
      // But server doesn't return count.
      // Let's just trust optimistic if success, or fetchReactions() logic could be added.

    } catch {
      setSummary(previous);
      // await fetchReactions();
    }

  }, [articleId, summary, requireAuth]);

  return {
    summary,
    loading,
    toggleLike: () => toggleReaction('LIKE'),
    toggleDislike: () => toggleReaction('DISLIKE'),
    toggleRepost,
    refresh: fetchReactions
  };
}

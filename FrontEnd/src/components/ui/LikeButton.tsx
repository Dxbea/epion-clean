// FrontEnd/src/components/ui/LikeButton.tsx
import React from 'react';
import { Heart } from 'lucide-react';
import { useReactions } from '@/hooks/useReactions';
import { useMe } from '@/contexts/MeContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';

export default function LikeButton({ articleId }: { articleId: string }) {
  const { summary, loading, toggleLike } = useReactions(articleId);
  const { me } = useMe();
  const { requireAuth } = useAuthPrompt();

  const likes = summary?.likes ?? 0;
  const liked = summary?.likedByMe ?? false;
  const isGuest = !me;

  const handleClick = React.useCallback(() => {
    if (loading) return;

    if (isGuest) {
      requireAuth({ message: 'You need an account to like articles.' });
      return;
    }

    toggleLike();
  }, [isGuest, loading, requireAuth, toggleLike]);

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={[
        'inline-flex h-9 shrink-0 items-center justify-center rounded-full border px-3 text-sm shadow-sm transition-colors',
        liked
          ? 'bg-gradient-to-r from-blue-400 to-blue-600 text-white border-blue-500 hover:opacity-95'
          : 'bg-transparent text-black dark:text-white border-black/10 dark:border-white/10 hover:bg-black/5',
        loading ? 'opacity-70 cursor-not-allowed' : '',
      ].join(' ')}
      aria-pressed={liked}
      aria-label={liked ? 'Unlike' : 'Like'}
      title={liked ? 'Unlike' : 'Like'}
    >
      <Heart className={`h-4 w-4 ${liked ? 'fill-white' : ''}`} />
      {likes > 0 && <span className="ml-1">{likes}</span>}
    </button>
  );
}

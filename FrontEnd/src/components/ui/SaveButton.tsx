// FrontEnd/src/components/article/SaveButton.tsx
import React from 'react';
import { useSavedArticles } from '@/hooks/useSavedArticles';
import { useMe } from '@/contexts/MeContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { useToast } from '@/components/ui/Toast';

type Props = {
  articleId: string;
  className?: string;
  onToggle?: (saved: boolean) => void;
};

export default function SaveButton({ articleId, className = '', onToggle }: Props) {
  const { me } = useMe();
  const { requireAuth } = useAuthPrompt();
  const { push } = useToast();
  const { isSaved, toggle } = useSavedArticles();

  const saved = isSaved(articleId);
  const isGuest = !me;

  const handle = async (e: React.MouseEvent) => {
    e.preventDefault();

    if (isGuest) {
      requireAuth({ message: 'You need an account to save articles.' });
      return;
    }

    try {
      await Promise.resolve(toggle(articleId));
      onToggle?.(!saved);
    } catch {
      push('Unable to update your saved articles right now.', 'error');
    }
  };

  return (
    <button
      onClick={handle}
      className={className}
      aria-label={saved ? 'Remove from saved' : 'Save article'}
    >
      {saved ? 'Saved ★' : 'Save ☆'}
    </button>
  );
}

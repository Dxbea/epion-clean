// FrontEnd/src/components/article/SaveButton.tsx
import React from 'react';
import { PiStar, PiStarFill } from "react-icons/pi";
import { useSavedArticles } from '@/hooks/useSavedArticles';
import { useMe } from '@/contexts/MeContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { useToast } from '@/components/ui/Toast';

type Props = {
  articleId: string;
  className?: string;
  onToggle?: (saved: boolean) => void;
  iconOnly?: boolean;
  variant?: 'default' | 'expanded-menu';
};

export default function SaveButton({ articleId, className = '', onToggle, iconOnly = false, variant = 'default' }: Props) {
  // Ensure gap-2 is present for icon spacing
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

  // Base classes matching ReactionButtons
  const baseClasses = iconOnly
    ? "inline-flex items-center justify-center transition-all active:scale-95 cursor-pointer"
    : variant === 'expanded-menu'
      ? "cursor-pointer group relative flex w-full h-12 items-center gap-3 rounded-xl px-4 text-[15px] font-medium transition-all active:scale-95 border"
      : "inline-flex h-9 items-center justify-center rounded-full px-4 text-sm transition-all active:scale-95 border cursor-pointer gap-2";

  return (
    <button
      onClick={handle}
      className={`${baseClasses} ${className} ${saved
        ? 'border-amber-200 dark:border-amber-500/30 bg-gradient-to-br from-amber-50 to-orange-100 dark:from-amber-500/10 dark:to-orange-500/5 text-amber-700 dark:text-amber-400'
        : (!iconOnly ? 'border-black/5 dark:border-white/5 bg-transparent hover:bg-black/5 dark:hover:bg-white/10 text-neutral-800 dark:text-neutral-200' : 'text-neutral-400 hover:text-black dark:text-neutral-500 dark:hover:text-white')
        }`}
      aria-label={saved ? 'Remove from saved' : 'Save article'}
      title={iconOnly ? (saved ? 'Remove from saved' : 'Save article') : undefined}
    >
      {saved ? (
        <>
          <PiStarFill className={`h-5 w-5 ${!iconOnly && variant !== 'expanded-menu' && 'scale-110'}`} />
          {!iconOnly && <span>{variant === 'expanded-menu' ? 'Saved Article' : 'Saved'}</span>}
        </>
      ) : (
        <>
          <PiStar className="h-5 w-5" />
          {!iconOnly && <span>{variant === 'expanded-menu' ? 'Save Article' : 'Save'}</span>}
        </>
      )}
    </button>
  );
}

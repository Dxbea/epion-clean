// FrontEnd/src/components/article/SaveButton.tsx
import React from 'react';
import { FaStar, FaRegStar } from "react-icons/fa6";
import { useSavedArticles } from '@/hooks/useSavedArticles';
import { useMe } from '@/contexts/MeContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { useToast } from '@/components/ui/Toast';

type Props = {
  articleId: string;
  className?: string;
  onToggle?: (saved: boolean) => void;
  iconOnly?: boolean;
  variant?: 'default' | 'expanded-menu' | 'card-pill';
};

export default function SaveButton({ articleId, className = '', onToggle, iconOnly = false, variant = 'default' }: Props) {
  const { me } = useMe();
  const { requireAuth } = useAuthPrompt();
  const { push } = useToast();
  const { isSaved, toggle } = useSavedArticles();

  const saved = isSaved(articleId);
  const isGuest = !me;

  const handle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isGuest) {
      requireAuth({ message: 'You need an account to save articles.' });
      return;
    }

    try {
      await Promise.resolve(toggle(articleId));
      onToggle?.(!saved);
    } catch (error) {
      push('Unable to update your saved articles right now.', 'error');
    }
  };

  // Base classes matching ReactionButtons
  const getBaseClasses = () => {
    if (iconOnly) return "inline-flex items-center justify-center transition-all active:scale-95 cursor-pointer";
    if (variant === 'expanded-menu') return "cursor-pointer group relative flex w-full h-12 items-center gap-3 rounded-xl px-4 text-[15px] font-medium transition-all active:scale-95 border";
    if (variant === 'card-pill') return "inline-flex h-7 items-center justify-center rounded-full px-2.5 text-[11px] font-bold transition-all active:scale-95 border cursor-pointer gap-1.5 shadow-sm";
    return "inline-flex h-9 items-center justify-center rounded-full px-4 text-sm transition-all active:scale-95 border cursor-pointer gap-2";
  };

  const savedStyles = "border-[#FFB017]/30 bg-[#FFF9ED] dark:bg-[#FFB017]/10 text-[#C46101] dark:text-[#FFB017]";
  const unsavedStyles = !iconOnly
    ? "border-black/5 dark:border-white/5 bg-white/90 dark:bg-neutral-900/90 hover:bg-white dark:hover:bg-neutral-900 text-neutral-800 dark:text-neutral-200"
    : "text-neutral-400 hover:text-black dark:text-neutral-500 dark:hover:text-white";

  return (
    <button
      onClick={handle}
      className={`${getBaseClasses()} ${className} ${saved ? savedStyles : unsavedStyles}`}
      aria-label={saved ? 'Remove from saved' : 'Save article'}
      title={iconOnly ? (saved ? 'Remove from saved' : 'Save article') : undefined}
    >
      {saved ? (
        <>
          <FaStar className={`${variant === 'card-pill' ? 'h-3 w-3' : 'h-4 w-4'} transition-transform group-hover:scale-110`} />
          {!iconOnly && <span>{variant === 'expanded-menu' ? 'Saved Article' : 'Saved'}</span>}
        </>
      ) : (
        <>
          <FaRegStar className={`${variant === 'card-pill' ? 'h-3 w-3' : 'h-4 w-4'}`} />
          {!iconOnly && <span>{variant === 'expanded-menu' ? 'Save Article' : 'Save'}</span>}
        </>
      )}
    </button>
  );
}

import React from 'react';
import { PiThumbsUp, PiThumbsUpFill, PiThumbsDown, PiThumbsDownFill, PiRepeat, PiRepeatFill } from "react-icons/pi";
import { useReactions } from '@/hooks/useReactions';
import { useMe } from '@/contexts/MeContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';

export default function ReactionButtons({ articleId, variant = 'default' }: { articleId: string, variant?: 'default' | 'expanded-menu' }) {
    const { summary, loading, toggleLike, toggleDislike, toggleRepost } = useReactions(articleId);
    const { me } = useMe();
    const { requireAuth } = useAuthPrompt();

    const likes = summary?.likes ?? 0;
    const dislikes = summary?.dislikes ?? 0;
    const reposts = summary?.reposts ?? 0;
    const userReaction = summary?.userReaction ?? null; // 'LIKE' | 'DISLIKE' | null
    const userReposted = summary?.userReposted ?? false;

    const isGuest = !me;

    const handleAction = React.useCallback((type: 'LIKE' | 'DISLIKE' | 'REPOST') => {
        if (loading) return;
        if (isGuest) {
            requireAuth({ message: 'You need an account to react to articles.' });
            return;
        }
        if (type === 'LIKE') toggleLike();
        else if (type === 'DISLIKE') toggleDislike();
        else if (type === 'REPOST') toggleRepost();
    }, [isGuest, loading, requireAuth, toggleLike, toggleDislike, toggleRepost]);

    // Base classes matching SaveButton (ghost pill with border). 
    const baseClasses = variant === 'expanded-menu'
        ? "cursor-pointer group relative flex w-full h-12 items-center gap-3 rounded-xl px-4 text-[15px] font-medium transition-all active:scale-95 border"
        : "cursor-pointer group relative inline-flex h-9 items-center justify-center gap-2 rounded-full px-4 text-sm transition-all active:scale-95 border";

    return (
        <div className={variant === 'expanded-menu' ? "flex flex-col gap-2 w-full" : "flex items-center gap-3"}>
            {/* LIKE BUTTON */}
            <button
                onClick={() => handleAction('LIKE')}
                disabled={loading}
                title="Like"
                className={`${baseClasses} 
          ${userReaction === 'LIKE'
                        ? 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-600 dark:bg-emerald-600 dark:text-white'
                        : 'border-black/5 dark:border-white/5 bg-transparent hover:bg-black/5 dark:hover:bg-white/10 text-neutral-800 dark:text-neutral-200'
                    }
        `}
            >
                {userReaction === 'LIKE' ? (
                    <PiThumbsUpFill className="h-5 w-5 transition-transform scale-110" />
                ) : (
                    <PiThumbsUp className="h-5 w-5 transition-transform group-hover:scale-110" />
                )}
                <span>{likes > 0 && variant === 'default' ? likes : userReaction === 'LIKE' ? 'Liked' : 'Like'}</span>
                {variant === 'expanded-menu' && likes > 0 && (
                    <span className="ml-auto text-xs opacity-50 font-normal">{likes}</span>
                )}
            </button>

            {/* DISLIKE BUTTON */}
            <button
                onClick={() => handleAction('DISLIKE')}
                disabled={loading}
                title="Dislike"
                className={`${baseClasses} 
          ${userReaction === 'DISLIKE'
                        ? 'border-red-700 bg-red-700 text-white dark:border-red-600 dark:bg-red-600 dark:text-white'
                        : 'border-black/5 dark:border-white/5 bg-transparent hover:bg-black/5 dark:hover:bg-white/10 text-neutral-800 dark:text-neutral-200'
                    }
        `}
            >
                {userReaction === 'DISLIKE' ? (
                    <PiThumbsDownFill className="h-5 w-5 transition-transform scale-110" />
                ) : (
                    <PiThumbsDown className="h-5 w-5 transition-transform group-hover:scale-110" />
                )}
                <span>{dislikes > 0 && variant === 'default' ? dislikes : userReaction === 'DISLIKE' ? 'Disliked' : 'Dislike'}</span>
                {variant === 'expanded-menu' && dislikes > 0 && (
                    <span className="ml-auto text-xs opacity-50 font-normal">{dislikes}</span>
                )}
            </button>

            {/* REPOST BUTTON */}
            <button
                onClick={() => handleAction('REPOST')}
                disabled={loading}
                title="Repost"
                className={`${baseClasses} 
          ${userReposted
                        ? 'border-violet-700 bg-violet-700 text-white dark:border-violet-600 dark:bg-violet-600 dark:text-white'
                        : 'border-black/5 dark:border-white/5 bg-transparent hover:bg-black/5 dark:hover:bg-white/10 text-neutral-800 dark:text-neutral-200'
                    }
        `}
            >
                {userReposted ? (
                    <PiRepeatFill className="h-5 w-5 transition-transform scale-110" />
                ) : (
                    <PiRepeat className="h-5 w-5 transition-transform group-hover:rotate-180" />
                )}
                <span>{reposts > 0 && variant === 'default' ? reposts : userReposted ? 'Reposted' : 'Repost'}</span>
                {variant === 'expanded-menu' && reposts > 0 && (
                    <span className="ml-auto text-xs opacity-50 font-normal">{reposts}</span>
                )}
            </button>
        </div>
    );
}

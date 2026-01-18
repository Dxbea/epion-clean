import React from 'react';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { useMe } from '@/contexts/MeContext';
import { API_BASE } from '@/config/api';
import { PiCheck, PiPlus, PiUserPlus } from 'react-icons/pi';
import { useToast } from '../ui/Toast';
import { withCsrf } from '@/lib/csrf';

interface FollowButtonProps {
    targetUserId: string;
    initialIsFollowing?: boolean;
    onToggle?: (isFollowing: boolean, newCount?: number) => void;
    className?: string;
    size?: 'sm' | 'md';
}

export default function FollowButton({
    targetUserId,
    initialIsFollowing = false,
    onToggle,
    className = '',
    size = 'md'
}: FollowButtonProps) {
    const { me } = useMe();
    const { requireAuth } = useAuthPrompt();
    const { push } = useToast();

    // Optimistic UI state
    const [isFollowing, setIsFollowing] = React.useState(initialIsFollowing);
    const [loading, setLoading] = React.useState(false);
    const [isHovering, setIsHovering] = React.useState(false);

    // Sync if prop changes (rare but possible)
    React.useEffect(() => {
        setIsFollowing(initialIsFollowing);
    }, [initialIsFollowing]);

    const handleToggle = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!me) {
            requireAuth({ message: "Sign in to follow authors" });
            return;
        }

        if (me.id === targetUserId) {
            push("You cannot follow yourself", "error");
            return;
        }

        if (loading) return;

        // Optimistic update
        const previousState = isFollowing;
        const newState = !isFollowing;
        setIsFollowing(newState);
        setLoading(true);

        try {
            const res = await fetch(`${API_BASE}/api/social/users/${targetUserId}/follow`, await withCsrf({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            }));

            if (!res.ok) {
                if (res.status === 429) {
                    throw new Error("You are following too fast");
                }
                throw new Error("Failed to toggle follow");
            }

            const data = await res.json();

            // Confirm state from server logic (in case of desync)
            setIsFollowing(data.following);

            if (onToggle) {
                onToggle(data.following, data.followersCount);
            }

        } catch (err: any) {
            // Revert
            setIsFollowing(previousState);
            push(err.message || "Something went wrong", "error");
        } finally {
            setLoading(false);
        }
    };

    const isFollowingMe = me?.id === targetUserId;
    if (isFollowingMe) return null;

    const baseClasses = "rounded-full font-medium transition-all active:scale-95 flex items-center justify-center gap-2";

    // Size variants
    const sizeClasses = size === 'sm'
        ? "px-3 py-1 text-xs h-8"
        : "px-5 py-2 text-sm h-10";

    // State variants
    // 1. Following (Active)
    const followingClasses = "bg-transparent border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-900/50 dark:hover:bg-red-900/10 dark:hover:text-red-400";

    // 2. Not Following (Inactive)
    const notFollowingClasses = "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 border border-transparent";

    return (
        <button
            onClick={handleToggle}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            disabled={loading}
            className={`${baseClasses} ${sizeClasses} ${isFollowing ? followingClasses : notFollowingClasses} ${className}`}
        >
            {isFollowing ? (
                <>
                    {isHovering ? (
                        <span>Unfollow</span>
                    ) : (
                        <>
                            <span>Following</span>
                        </>
                    )}
                </>
            ) : (
                <>
                    <PiPlus className="w-4 h-4" />
                    <span>Follow</span>
                </>
            )}
        </button>
    );
}

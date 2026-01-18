
import React from 'react';
import { Link } from 'react-router-dom';
import { PiUser } from 'react-icons/pi';
import { API_BASE } from '@/config/api';

interface ArticleAuthorPillProps {
    author: {
        id: string;
        name?: string | null;
        username?: string | null;
        avatarUrl?: string | null;
        email?: string | null;
    } | null;
    className?: string;
}

export default function ArticleAuthorPill({ author, className = '' }: ArticleAuthorPillProps) {
    if (!author) return null;

    const displayName = author.name || author.email?.split('@')[0] || 'Unknown';
    const handle = author.username ? `@${author.username}` : null;

    // Construct avatar URL properly if it's relative
    let avatarSrc = author.avatarUrl;
    if (avatarSrc && !avatarSrc.startsWith('http') && !avatarSrc.startsWith('data:')) {
        avatarSrc = `${API_BASE}${avatarSrc}`;
    }

    return (
        <Link
            to={`/u/${author.id}`}
            className={`inline-flex max-w-[200px] items-center gap-3 rounded-full border border-black/10 bg-white py-1 pr-4 pl-1 transition-all hover:bg-black/5 active:scale-95 dark:border-white/10 dark:bg-transparent dark:hover:bg-white/10 ${className}`}
        >
            {/* Avatar Circle */}
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                {avatarSrc ? (
                    <img
                        src={avatarSrc}
                        alt={displayName}
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-neutral-400">
                        <PiUser className="h-4 w-4" />
                    </div>
                )}
            </div>

            {/* Name & Handle */}
            <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    {displayName}
                </span>
                {handle && (
                    <span className="truncate text-[11px] text-neutral-500">
                        {handle}
                    </span>
                )}
            </div>
        </Link>
    );
}

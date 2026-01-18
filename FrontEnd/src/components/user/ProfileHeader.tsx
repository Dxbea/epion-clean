import React, { useRef } from 'react';
import { PiCalendarBlank, PiUsers, PiCamera } from 'react-icons/pi';
import FollowButton from '@/components/social/FollowButton';
import { useMe } from '@/contexts/MeContext';
import { API_BASE } from '@/config/api';
import { useToast } from '@/components/ui/Toast';
import { withCsrf } from '@/lib/csrf';

interface ProfileUser {
    id: string;
    displayName?: string | null;
    username?: string | null;
    avatarUrl?: string | null;
    bannerUrl?: string | null;
    bio?: string | null;
    createdAt: string;
    followersCount: number;
    followingCount: number;
}

interface ProfileHeaderProps {
    user: ProfileUser;
    isOwnProfile?: boolean;
    initialIsFollowing?: boolean;
}

export default function ProfileHeader({ user, isOwnProfile = false, initialIsFollowing = false }: ProfileHeaderProps) {
    const { updateLocal } = useMe();
    const { push } = useToast();
    const [followersCount, setFollowersCount] = React.useState(user.followersCount);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    const displayName = user.displayName || 'Anonymous User';
    const handle = user.username ? `@${user.username}` : null;
    const joinedDate = new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const initials = (displayName || '?').charAt(0).toUpperCase();

    const handleFollowToggle = (isFollowing: boolean, newCount?: number) => {
        if (typeof newCount === 'number') {
            setFollowersCount(newCount);
        } else {
            setFollowersCount(prev => isFollowing ? prev + 1 : prev - 1);
        }
    };

    const handleBannerClick = () => {
        if (isOwnProfile) {
            bannerInputRef.current?.click();
        }
    };

    const onBannerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Front-end resizing/checking
        if (file.size > 10 * 1024 * 1024) {
            push('File too large (max 10MB)', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
            const dataUrl = reader.result as string;
            // Optimistic update
            updateLocal({ bannerUrl: dataUrl });

            try {
                // Prepare request with CSRF
                const init = await withCsrf({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dataUrl }),
                    credentials: 'include',
                });

                const res = await fetch(`${API_BASE}/api/me/banner`, init);

                // Detailed Error Handling
                if (res.status === 413) {
                    push('File too large (server rejected)', 'error');
                    return;
                }

                if (res.status === 403) {
                    push('Session invalid or expired. Please refresh.', 'error');
                    return;
                }

                if (!res.ok) {
                    const errorJson = await res.json().catch(() => ({}));
                    throw new Error(errorJson.error || `Upload failed (HTTP ${res.status})`);
                }

                const data = await res.json();
                if (data.bannerUrl) {
                    updateLocal({ bannerUrl: data.bannerUrl });
                    push('Banner updated', 'success');
                }
            } catch (error: any) {
                console.error(error);
                push(error.message || 'Failed to upload banner', 'error');
            }
        };
        reader.readAsDataURL(file);
    };

    // Fix relative banner urls
    const displayBannerUrl = user.bannerUrl
        ? (user.bannerUrl.startsWith('http') || user.bannerUrl.startsWith('data:'))
            ? user.bannerUrl
            : `${API_BASE}${user.bannerUrl}`
        : null;

    return (
        <div className="w-full group">
            <input
                type="file"
                ref={bannerInputRef}
                className="hidden"
                accept="image/png, image/jpeg, image/webp"
                onChange={onBannerFileChange}
            />

            {/* Banner/Cover Area */}
            <div className="relative h-48 md:h-64 w-full group">
                {/* Background/Image Container */}
                <div className="absolute inset-0 rounded-t-3xl overflow-hidden bg-gradient-to-r from-emerald-50 to-teal-100 dark:from-neutral-800 dark:to-neutral-900">
                    {displayBannerUrl ? (
                        <img
                            src={displayBannerUrl}
                            alt="Profile Banner"
                            className="h-full w-full object-cover"
                        />
                    ) : null}
                </div>

                {/* Edit Button - Positioned absolutely on top of the banner, z-index 50 to ensure clickability */}
                {isOwnProfile && (
                    <button
                        onClick={handleBannerClick}
                        className="absolute bottom-4 right-4 z-50 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-sm transition opacity-0 group-hover:opacity-100 cursor-pointer"
                        title="Change banner"
                    >
                        <PiCamera className="w-5 h-5" />
                    </button>
                )}
            </div>

            <div className="relative px-6 pb-6">
                {/* Avatar & Action Row */}
                <div className="flex items-end justify-between -mt-12 mb-4">
                    {/* Avatar Container with z-index to sit nicely relative to banner but below button if needed */}
                    <div className="relative z-20 h-24 w-24 overflow-hidden rounded-full border-4 border-white dark:border-neutral-950 bg-white dark:bg-neutral-900 shadow-sm">
                        {user.avatarUrl ? (
                            <img
                                src={user.avatarUrl}
                                alt={displayName}
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center bg-emerald-500 text-3xl font-bold text-white uppercase">
                                {initials}
                            </div>
                        )}
                    </div>

                    <div className="mb-1 z-20">
                        {isOwnProfile ? (
                            <a
                                href="/settings#account"
                                className="inline-flex h-10 items-center justify-center rounded-full border border-neutral-200 bg-white px-5 text-sm font-medium transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                            >
                                Edit profile
                            </a>
                        ) : (
                            <FollowButton
                                targetUserId={user.id}
                                initialIsFollowing={initialIsFollowing}
                                onToggle={handleFollowToggle}
                            />
                        )}
                    </div>
                </div>

                {/* Identity */}
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold tracking-tight font-display text-neutral-900 dark:text-neutral-50">
                        {displayName}
                    </h1>
                    {handle && (
                        <p className="text-neutral-500 dark:text-neutral-400">
                            {handle}
                        </p>
                    )}
                </div>

                {/* Bio */}
                {user.bio && (
                    <p className="mt-4 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 max-w-2xl whitespace-pre-wrap">
                        {user.bio}
                    </p>
                )}

                {/* Meta & Stats */}
                <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-neutral-500 dark:text-neutral-400">
                    <div className="flex items-center gap-1.5">
                        <PiCalendarBlank className="h-4 w-4" />
                        <span>Joined {joinedDate}</span>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-neutral-700 dark:text-neutral-300">
                        <div className="flex items-center gap-1 hover:underline cursor-pointer">
                            <span className="font-bold text-neutral-900 dark:text-white">{followersCount}</span>
                            <span className="text-neutral-500">Followers</span>
                        </div>
                        <div className="flex items-center gap-1 hover:underline cursor-pointer">
                            <span className="font-bold text-neutral-900 dark:text-white">{user.followingCount}</span>
                            <span className="text-neutral-500">Following</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

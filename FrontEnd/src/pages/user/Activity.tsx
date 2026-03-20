import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { API_BASE } from '@/config/api';
import { useMe } from '@/contexts/MeContext';
import ArticleCard from '@/components/articles/ArticleCard';
import SectionHeader from '@/components/SectionHeader';
import { PiHeart, PiThumbsDown, PiBookmarkSimple, PiRepeat, PiChatCircle } from "react-icons/pi";

type ActivityType = 'SAVED' | 'LIKED' | 'DISLIKED' | 'REPOSTED' | 'COMMENTS';

const TABS: { id: ActivityType; label: string; icon: React.ReactNode }[] = [
    { id: 'SAVED', label: 'Saved', icon: <PiBookmarkSimple className="w-4 h-4" /> },
    { id: 'LIKED', label: 'Liked', icon: <PiHeart className="w-4 h-4" /> },
    { id: 'DISLIKED', label: 'Disliked', icon: <PiThumbsDown className="w-4 h-4" /> },
    { id: 'REPOSTED', label: 'Reposts', icon: <PiRepeat className="w-4 h-4" /> },
    { id: 'COMMENTS', label: 'Comments', icon: <PiChatCircle className="w-4 h-4" /> },
];

export default function Activity() {
    const { me } = useMe();
    const [searchParams, setSearchParams] = useSearchParams();
    const currentTab = (searchParams.get('tab') as ActivityType) || 'SAVED';

    const [items, setItems] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [nextCursor, setNextCursor] = React.useState<string | null>(null);

    // Reset list when tab changes
    React.useEffect(() => {
        setItems([]);
        setNextCursor(null);
    }, [currentTab]);

    const loadItems = React.useCallback(async (cursor?: string | null) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                type: currentTab,
                take: '24',
            });
            if (cursor) params.set('cursor', cursor);

            const r = await fetch(`${API_BASE}/api/social/activity?${params.toString()}`, {
                credentials: 'include',
            });
            if (!r.ok) throw new Error('Failed to load');
            const data = await r.json();

            setItems(prev => cursor ? [...prev, ...data.items] : data.items);
            setNextCursor(data.nextCursor);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [currentTab]);

    // Initial load
    React.useEffect(() => {
        loadItems();
    }, [loadItems]);

    const handleTabChange = (tab: ActivityType) => {
        setSearchParams({ tab });
    };

    return (
        <main className="mx-auto w-full max-w-6xl px-4 py-10 space-y-8 min-h-[60vh]">
            {/* Header */}
            <header className="flex items-center gap-4 border-b border-black/5 dark:border-white/5 pb-8">
                <div className="h-16 w-16 overflow-hidden rounded-full ring-2 ring-black/5 dark:ring-white/10">
                    {me?.avatarUrl ? (
                        <img src={me.avatarUrl} alt={me.displayName || 'User'} className="h-full w-full object-cover" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-emerald-500 text-2xl font-bold text-white uppercase">
                            {me?.displayName?.[0] || me?.email?.[0] || 'U'}
                        </div>
                    )}
                </div>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight font-display">Your Activity</h1>
                    <p className="text-neutral-500 dark:text-neutral-400">
                        Manage your interactions
                    </p>
                </div>
            </header>

            {/* Tabs */}
            <div className="flex overflow-x-auto border-b border-black/10 dark:border-white/10 no-scrollbar">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        className={`
              flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap relative
              ${currentTab === tab.id
                                ? 'text-black dark:text-white'
                                : 'text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white'
                            }
            `}
                    >
                        {tab.icon}
                        {tab.label}
                        {currentTab === tab.id && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black dark:bg-white rounded-t-full" />
                        )}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="pt-4">
                {loading && items.length === 0 ? (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="aspect-[4/3] rounded-2xl bg-black/5 dark:bg-white/5 animate-pulse" />
                        ))}
                    </div>
                ) : items.length === 0 ? (
                    <div className="rounded-2xl border border-black/10 p-12 text-center dark:border-white/10 bg-neutral-50 dark:bg-neutral-900/50">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-black/5 dark:bg-white/5 mb-4 text-2xl">
                            {TABS.find(t => t.id === currentTab)?.icon}
                        </div>
                        <h3 className="text-lg font-medium">No activity yet</h3>
                        <p className="mt-1 text-sm text-neutral-500">
                            You haven't interacted with any content in this section yet.
                        </p>
                        <Link to="/news" className="mt-6 inline-flex h-10 items-center justify-center rounded-full bg-black px-6 text-sm font-medium text-white transition-transform active:scale-95 dark:bg-white dark:text-black">
                            Explore content
                        </Link>
                    </div>
                ) : (
                    currentTab === 'COMMENTS' ? (
                        <div className="space-y-4">
                            {items.map((item) => (
                                <div key={item.id} className="rounded-2xl border border-black/10 p-5 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                                    <div className="flex items-center justify-between text-xs text-neutral-500 mb-2">
                                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                                        <Link to={item.article.url} className="hover:underline text-emerald-600 dark:text-emerald-400 font-medium">
                                            {item.article.title}
                                        </Link>
                                    </div>
                                    <p className="text-sm leading-relaxed">{item.content}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            {items.map((article) => (
                                <ArticleCard key={article.id} article={article} />
                            ))}
                        </div>
                    )
                )}

                {nextCursor && !loading && (
                    <div className="mt-12 flex justify-center">
                        <button
                            onClick={() => loadItems(nextCursor)}
                            className="h-10 px-6 rounded-full border border-black/10 dark:border-white/10 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                        >
                            Load more
                        </button>
                    </div>
                )}
            </div>
        </main>
    );
}

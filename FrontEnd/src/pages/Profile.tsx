
import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { API_BASE } from '@/config/api';
import PageContainer from '@/components/ui/PageContainer';
import ProfileHeader from '@/components/user/ProfileHeader';
import ArticleCard from '@/components/articles/ArticleCard';
import type { Article } from '@/types/article';
import { PiSpinner } from 'react-icons/pi';

export default function Profile() {
    const { userId } = useParams<{ userId: string }>();
    const [user, setUser] = React.useState<any>(null);
    const [loadingUser, setLoadingUser] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    // Articles state
    const [articles, setArticles] = React.useState<Article[]>([]);
    const [loadingArticles, setLoadingArticles] = React.useState(false);

    // Fetch User
    React.useEffect(() => {
        if (!userId) return;
        setLoadingUser(true);
        setError(null);
        (async () => {
            try {
                const r = await fetch(`${API_BASE}/api/users/${userId}`, { credentials: 'include' }); // Supports ID or Username
                if (!r.ok) {
                    if (r.status === 404) throw new Error('User not found');
                    throw new Error('Failed to load profile');
                }
                const data = await r.json();
                setUser(data);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoadingUser(false);
            }
        })();
    }, [userId]);

    // Fetch Articles (once user is loaded and we have their real ID)
    React.useEffect(() => {
        if (!user?.id) return;
        setLoadingArticles(true);
        (async () => {
            try {
                const r = await fetch(`${API_BASE}/api/articles?authorId=${user.id}&status=PUBLISHED&take=20`);
                if (!r.ok) return;
                const data = await r.json();
                setArticles(data.items || []);
            } catch {
                // ignore
            } finally {
                setLoadingArticles(false);
            }
        })();
    }, [user?.id]);

    if (loadingUser) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <PiSpinner className="h-8 w-8 animate-spin text-neutral-400" />
            </div>
        );
    }

    if (error || !user) {
        return (
            <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center">
                <h1 className="text-2xl font-bold">Profile not found</h1>
                <p className="text-neutral-500">The user you are looking for does not exist.</p>
                <Link to="/" className="text-emerald-600 hover:underline">Go Home</Link>
            </div>
        );
    }

    return (
        <PageContainer className="py-0 pb-20">
            <ProfileHeader
                user={user}
                isOwnProfile={user.isMe}
            />

            <div className="mt-8 px-4 max-w-5xl mx-auto space-y-8">
                <div>
                    <h2 className="text-2xl font-bold font-display mb-6">Published Articles</h2>

                    {loadingArticles ? (
                        <div className="py-12 text-center opacity-50">Loading articles...</div>
                    ) : articles.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {articles.map(article => (
                                <ArticleCard key={article.id} article={article} />
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 p-12 text-center">
                            <p className="text-neutral-500">No published articles yet.</p>
                        </div>
                    )}
                </div>
            </div>
        </PageContainer>
    );
}

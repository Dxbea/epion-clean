import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { PiSpinner } from 'react-icons/pi';

import ArticleCard from '@/components/articles/ArticleCard';
import { Button } from '@/components/ui';
import PageContainer from '@/components/ui/PageContainer';
import ProfileHeader from '@/components/user/ProfileHeader';
import { API_BASE } from '@/config/api';
import type { Article } from '@/types/article';

export default function Profile() {
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = React.useState<any>(null);
  const [loadingUser, setLoadingUser] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [articles, setArticles] = React.useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = React.useState(false);

  React.useEffect(() => {
    if (!userId) return;

    setLoadingUser(true);
    setError(null);

    (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/users/${userId}`, {
          credentials: 'include',
        });
        if (!response.ok) {
          if (response.status === 404) throw new Error('User not found');
          throw new Error('Failed to load profile');
        }

        const data = await response.json();
        setUser(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoadingUser(false);
      }
    })();
  }, [userId]);

  React.useEffect(() => {
    if (!user?.id) return;

    setLoadingArticles(true);

    (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/articles?authorId=${user.id}&status=PUBLISHED&take=20`);
        if (!response.ok) return;

        const data = await response.json();
        setArticles(data.items || []);
      } catch {
        // Ignore sidebar article loading errors.
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
        <h1 className="font-serif text-3xl font-medium tracking-tight">Profile not found</h1>
        <p className="text-neutral-500">The user you are looking for does not exist.</p>
        <Button as={Link} to="/" variant="ghost" size="auto" className="min-h-[44px] rounded-full px-5 py-2.5 text-sm">
          Go Home
        </Button>
      </div>
    );
  }

  return (
    <PageContainer className="pt-6 pb-20 sm:pt-8">
      <ProfileHeader user={user} isOwnProfile={user.isMe} />

      <div className="mx-auto mt-8 max-w-5xl space-y-8 px-0 sm:px-4">
        <div>
          <h2 className="mb-6 font-serif text-3xl font-medium tracking-tight">Published Articles</h2>

          {loadingArticles ? (
            <div className="py-12 text-center opacity-50">Loading articles...</div>
          ) : articles.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-200 p-12 text-center dark:border-neutral-800">
              <p className="text-neutral-500">No published articles yet.</p>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}

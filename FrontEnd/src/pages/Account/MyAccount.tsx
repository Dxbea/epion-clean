import React from 'react';
import { useMe } from '@/contexts/MeContext';
import ProfileHeader from '@/components/user/ProfileHeader';
import PageContainer from '@/components/ui/PageContainer';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { Navigate } from 'react-router-dom';
// import MyArticlesPage from '../MyArticlesPage';

export default function MyAccount() {
  const { me, loading } = useMe();
  const { requireAuth } = useAuthPrompt();

  if (loading) return null;
  if (!me) {
    return <Navigate to="/settings#account" replace />;
  }

  // Construct profile user object
  const profileUser = {
    id: me.id,
    displayName: me.displayName,
    username: me.username,
    avatarUrl: me.avatarUrl,
    bannerUrl: me.bannerUrl,
    bio: me.bio, // Now available from context/api
    createdAt: (me as any).createdAt || new Date().toISOString(), // Fallback
    followersCount: (me as any).followersCount || 0,
    followingCount: (me as any).followingCount || 0,
  };

  return (
    <PageContainer className="py-0 pb-20">
      <ProfileHeader
        user={profileUser}
        isOwnProfile={true}
      />

      {/* Content Feed */}
      <div className="mt-8 px-4 max-w-5xl mx-auto">
        <MyArticlesSection />
      </div>
    </PageContainer>
  );
}

// INLINED MyArticlesSection to fix layout
import ArticleCard from '@/components/articles/ArticleCard';
import { API_BASE } from '@/config/api';
import type { Article } from '@/types/article';
import { useSearchParams, Link } from 'react-router-dom';

const TABS = ['ALL', 'DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
type Tab = typeof TABS[number];

function MyArticlesSection() {
  const [params, setParams] = useSearchParams();

  const tab = (params.get('status')?.toUpperCase() as Tab) || 'ALL';
  const qParam = (params.get('q') || '').trim();

  const [items, setItems] = React.useState<
    (Article & { slug?: string | null; status?: string | null })[]
  >([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [stats, setStats] = React.useState<{
    total: number;
    draft: number;
    published: number;
    archived: number;
  } | null>(null);

  // fetch stats once
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/me/articles/stats`, { credentials: 'include' });
        if (!r.ok) return;
        const j = await r.json();
        if (!alive) return;
        setStats({
          total: j.total ?? 0,
          draft: j.draft ?? 0,
          published: j.published ?? 0,
          archived: j.archived ?? 0,
        });
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, []);

  const load = React.useCallback(
    async (cursor?: string | null) => {
      try {
        if (!cursor) setLoading(true);

        const qp = new URLSearchParams();
        qp.set('status', tab);
        if (qParam) qp.set('q', qParam);
        qp.set('take', '12'); // Optimized for grid
        if (cursor) qp.set('cursor', cursor);

        const res = await fetch(`${API_BASE}/api/me/articles?${qp.toString()}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        const page: any[] = Array.isArray(json.items) ? json.items : [];

        setItems((prev) => (cursor ? [...prev, ...page] : page));
        setNextCursor(json.nextCursor ?? null);
        setError(null);
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
        if (!cursor) {
          setItems([]);
          setNextCursor(null);
        }
      } finally {
        setLoading(false);
      }
    },
    [tab, qParam]
  );

  React.useEffect(() => {
    load(null);
  }, [load]);

  function setTab(t: Tab) {
    const p = new URLSearchParams(params);
    if (t === 'ALL') p.delete('status');
    else p.set('status', t);
    setParams(p, { replace: true });
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row items-baseline justify-between mb-6 gap-4">
        <h2 className="text-2xl font-bold font-display">Articles</h2>

        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${tab === t
                ? 'bg-neutral-900 border-neutral-900 text-white dark:bg-white dark:border-white dark:text-black'
                : 'border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-700'
                }`}
            >
              {t === 'ALL' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase()}
              {stats && t === 'ALL'
                ? ` ${stats.total}`
                : stats && t === 'DRAFT'
                  ? ` ${stats.draft}`
                  : stats && t === 'PUBLISHED'
                    ? ` ${stats.published}`
                    : stats && t === 'ARCHIVED'
                      ? ` ${stats.archived}`
                      : ''}
            </button>
          ))}
        </div>
      </div>

      {loading && !items.length ? (
        <div className="py-12 text-center opacity-50">Loading articles...</div>
      ) : error ? (
        <div className="py-8 text-center text-red-500">{error}</div>
      ) : items.length ? (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((a) => (
              <Link key={a.id} to={`/account/articles/${a.slug || a.id}/edit`} className="block group">
                <ArticleCard article={a as Article} disableLink />
              </Link>
            ))}
          </div>
          {nextCursor && (
            <div className="mt-8 flex justify-center">
              <button onClick={() => load(nextCursor)} className="px-6 py-2 rounded-full border border-neutral-200 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900 transition-colors">
                Load more
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 p-12 text-center">
          <p className="text-neutral-500">No articles found.</p>
          <Link to="/actuality/create" className="mt-4 inline-block px-4 py-2 bg-black text-white rounded-full text-sm font-medium">Create Article</Link>
        </div>
      )}
    </>
  );
}


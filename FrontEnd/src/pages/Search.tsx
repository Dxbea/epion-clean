import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import ArticleCard from '@/components/articles/ArticleCard';
import SectionHeader from '@/components/SectionHeader';
import { Button } from '@/components/ui';
import { API_BASE } from '@/config/api';
import type { Article } from '@/types/article';

function useQuery() {
  const { search } = useLocation();
  return React.useMemo(() => new URLSearchParams(search), [search]);
}

export default function SearchPage() {
  const qs = useQuery();
  const navigate = useNavigate();
  const q = (qs.get('q') || '').trim();

  const [query, setQuery] = React.useState(q);
  const [items, setItems] = React.useState<Article[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [initialLoaded, setInitialLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (cursor?: string | null) => {
    if (!q) {
      setItems([]);
      setNextCursor(null);
      setInitialLoaded(true);
      return;
    }

    try {
      if (!cursor) setLoading(true);

      const params = new URLSearchParams();
      params.set('q', q);
      params.set('take', '24');
      if (cursor) params.set('cursor', cursor);

      const response = await fetch(`${API_BASE}/api/articles/search?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const json = await response.json();
      const page: Article[] = (Array.isArray(json.items) ? json.items : []).map((item: any) => ({
        id: item.id,
        title: item.title,
        excerpt: item.excerpt ?? item.summary ?? null,
        imageUrl: item.imageUrl ?? null,
        url: `/article/${item.slug || item.id}`,
        publishedAt: item.publishedAt ?? item.createdAt ?? new Date().toISOString(),
        category: item.category?.name ?? null,
        tags: item.tags ?? [],
        views: typeof item.views === 'number' ? item.views : 0,
      }));

      setItems((prev) => (cursor ? [...prev, ...page] : page));
      setNextCursor(json.nextCursor ?? null);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load results');
      if (!cursor) setItems([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  }, [q]);

  React.useEffect(() => {
    load(null);
  }, [load]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header className="space-y-4">
        <nav className="text-sm opacity-70">
          <Link to="/news" className="hover:underline">
            news
          </Link>
          <span className="mx-2">/</span>
          <span>Search</span>
        </nav>

        <SectionHeader title="Search" />

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            navigate(`/news/search?q=${encodeURIComponent(query.trim())}`);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          placeholder="Search..."
          className="form-input mt-2 h-11 w-full max-w-3xl sm:h-12"
        />
      </header>

      <div className="mt-8 space-y-8">
        {!query ? (
          <div className="rounded-3xl border border-black/10 p-6 text-center dark:border-white/10 sm:p-8">
            <div className="text-lg font-medium">Type something to search.</div>
            <div className="mt-1 text-sm opacity-70">Use the search bar on the news page.</div>
          </div>
        ) : !initialLoaded && loading ? (
          <div className="text-center opacity-70">Loading...</div>
        ) : error ? (
          <div className="rounded-3xl border border-black/10 p-6 text-center text-red-600 dark:border-white/10 sm:p-8">
            {error}
          </div>
        ) : items.length ? (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>

            <div className="flex items-center justify-center">
              {nextCursor ? (
                <Button
                  variant="secondary"
                  size="auto"
                  className="mt-4 min-h-[44px] rounded-full px-5 py-2.5 text-sm"
                  onClick={() => !loading && load(nextCursor)}
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Afficher plus'}
                </Button>
              ) : (
                <span className="mt-6 text-sm opacity-60">Fin des resultats</span>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-3xl border border-black/10 p-6 text-center dark:border-white/10 sm:p-8">
            <div className="text-lg font-medium">No results</div>
            <div className="mt-1 text-sm opacity-70">Try another query.</div>
          </div>
        )}
      </div>
    </main>
  );
}

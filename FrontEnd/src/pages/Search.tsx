// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import SectionHeader from '@/components/SectionHeader';
import ArticleCard from '@/components/articles/ArticleCard';
import type { Article } from '@/types/article';
import { API_BASE } from '@/config/api';



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
    if (!query) {
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

      const res = await fetch(`${API_BASE}/api/articles/search?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      // ✅ NORMALISATION -> correspond au type Article attendu par ArticleCard
      const page: Article[] = (Array.isArray(json.items) ? json.items : []).map((it: any) => ({
        id: it.id,
        title: it.title,
        excerpt: it.excerpt ?? it.summary ?? null,
        imageUrl: it.imageUrl ?? null,
        url: `/article/${it.slug || it.id}`,
        publishedAt: it.publishedAt ?? it.createdAt ?? new Date().toISOString(),
        category: it.category?.name ?? null,   // <- string | null
        tags: it.tags ?? [],
        views: typeof it.views === 'number' ? it.views : 0,
      }));

      setItems(prev => (cursor ? [...prev, ...page] : page));
      setNextCursor(json.nextCursor ?? null);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load results');
      if (!cursor) setItems([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  }, [q]);

  // recharge quand la query change
React.useEffect(() => {
  // Lance la recherche quand l’URL (q) change
  load(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [q]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 space-y-8">
      <header className="space-y-2">
        <nav className="text-sm opacity-70">
          <Link to="/actuality" className="hover:underline">Actuality</Link>
          <span className="mx-2">/</span><span>Search</span>
        </nav>
        <SectionHeader title="Search" />
        <input
  value={query}
  onChange={(e) => setQuery(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === 'Enter') {
      const v = query.trim();
      navigate(`/actuality/search?q=${encodeURIComponent(v)}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }}
  placeholder="Search…"
  className="mt-2 w-full max-w-3xl rounded-xl border border-black/10 px-3 py-2 dark:border-white/10"
/>

      </header>

      {!query ? (
        <div className="rounded-2xl border border-black/10 p-6 text-center dark:border-white/10">
          <div className="text-lg font-medium">Type something to search.</div>
          <div className="mt-1 text-sm opacity-70">Use the search bar on the Actuality page.</div>
        </div>
      ) : !initialLoaded && loading ? (
        <div className="text-center opacity-70">Loading…</div>
      ) : error ? (
        <div className="rounded-2xl border border-black/10 p-6 text-center text-red-600 dark:border-white/10">
          {error}
        </div>
      ) : items.length ? (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(a => <ArticleCard key={a.id} article={a} />)}
          </div>
          <div className="flex items-center justify-center">
            {nextCursor ? (
              <button
                onClick={() => !loading && load(nextCursor)}
                disabled={loading}
                className="mt-6 rounded-full border px-4 py-2 text-sm hover:bg-black/5 disabled:opacity-60 dark:border-white/10"
              >
                {loading ? 'Loading…' : 'Afficher plus'}
              </button>
            ) : (
              <span className="mt-6 text-sm opacity-60">Fin des résultats</span>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-black/10 p-6 text-center dark:border-white/10">
          <div className="text-lg font-medium">No results</div>
          <div className="mt-1 text-sm opacity-70">Try another query.</div>
        </div>
      )}
    </main>
  );
}
// FIN BLOC

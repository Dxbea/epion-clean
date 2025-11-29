import React from 'react';
import { Link } from 'react-router-dom';
import SectionHeader from '@/components/SectionHeader';
import ArticleCard from '@/components/articles/ArticleCard';
import type { Article } from '@/types/article';
import { API_BASE } from '@/config/api';
import { useSavedArticles } from '@/hooks/useSavedArticles'; // ✅


export default function FavoritesPage() {
  const { ids: savedIds } = useSavedArticles(); // ✅ on “écoute” les favoris
  const [items, setItems] = React.useState<Article[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (cursor?: string | null) => {
    try {
      setLoading(true);
      const p = new URLSearchParams({ take: '24' });
      if (cursor) p.set('cursor', cursor);
      const r = await fetch(`${API_BASE}/api/favorites?${p.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const page: Article[] = (Array.isArray(j.items) ? j.items : []).map((it: any) => ({
        id: it.id, title: it.title, excerpt: it.excerpt ?? null,
        imageUrl: it.imageUrl ?? null,
        url: `/article/${it.slug || it.id}`,
        publishedAt: it.publishedAt ?? new Date().toISOString(),
        category: it.category ?? null, tags: it.tags ?? [], views: it.views ?? 0,
      }));
      setItems(prev => cursor ? [...prev, ...page] : page);
      setNextCursor(j.nextCursor ?? null);
      setError(null);
    } catch (e:any) {
      setError(e.message || 'Failed to load favorites');
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(null); }, [load]);
  React.useEffect(() => {
    setItems(prev => prev.filter(a => savedIds.includes(a.id)));
  }, [savedIds]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 space-y-8">
      <nav className="text-sm opacity-70">
        <Link to="/actuality" className="hover:underline">Actuality</Link>
        <span className="mx-2">/</span><span>Favorites</span>
      </nav>
      <SectionHeader title="Your favorites" />

      {error ? (
        <div className="rounded-2xl border border-black/10 p-6 text-center text-red-600 dark:border-white/10">{error}</div>
      ) : loading && !items.length ? (
        <div className="text-center opacity-70">Loading…</div>
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
          No favorites yet.
        </div>
      )}
    </main>
  );
}

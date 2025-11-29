// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import React from 'react';
import { useParams, Link } from 'react-router-dom';
import ArticleCard from '@/components/articles/ArticleCard';
import type { Article } from '@/types/article';
import SectionHeader from '@/components/SectionHeader';
import { API_BASE } from '@/config/api';

function labelFromSlug(slug: string){
  const pretty = slug.replace(/-/g,' ');
  return pretty.slice(0,1).toUpperCase()+pretty.slice(1);
}

export default function CategoryPage(){
  const { slug = '' } = useParams();

  const [items, setItems] = React.useState<Article[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [initialLoaded, setInitialLoaded] = React.useState(false);

  const label = labelFromSlug(slug);

  const load = React.useCallback(async (cursor?: string | null) => {
    try {
      if (!cursor) setLoading(true);
      const qs = new URLSearchParams();
      qs.set('take', '24');
      if (cursor) qs.set('cursor', cursor);
      const res = await fetch(`${API_BASE}/api/categories/${slug}/articles?` + qs.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const page: Article[] = (Array.isArray(json.items) ? json.items : []);
      setItems(prev => cursor ? [...prev, ...page] : page);
      setNextCursor(json.nextCursor ?? null);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
      if (!cursor) setItems([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  }, [slug]);

  React.useEffect(() => {
    // reset et 1er chargement à chaque changement de slug
    setItems([]);
    setNextCursor(null);
    setInitialLoaded(false);
    load(null);
  }, [slug, load]);

  const onLoadMore = React.useCallback(() => {
    if (nextCursor && !loading) load(nextCursor);
  }, [nextCursor, loading, load]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 space-y-8">
      <header className="space-y-2">
        <nav className="text-sm opacity-70">
          <Link to="/actuality" className="hover:underline">Actuality</Link>
          <span className="mx-2">/</span><span>{label}</span>
        </nav>
        <SectionHeader title={label} />
      </header>

      {/* état de chargement initial */}
      {!initialLoaded && loading ? (
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
                onClick={onLoadMore}
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
          <div className="text-lg font-medium">Aucun article trouvé</div>
          <div className="mt-1 text-sm opacity-70">
            Essaie une autre catégorie ou <Link to="/actuality" className="underline">retourne aux articles</Link>.
          </div>
        </div>
      )}
    </main>
  );
}
// FIN BLOC

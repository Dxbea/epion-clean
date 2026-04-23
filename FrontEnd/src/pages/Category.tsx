import React from 'react';
import { Link, useParams } from 'react-router-dom';

import ArticleCard from '@/components/articles/ArticleCard';
import SectionHeader from '@/components/SectionHeader';
import { Button } from '@/components/ui';
import { API_BASE } from '@/config/api';
import type { Article } from '@/types/article';

function labelFromSlug(slug: string) {
  const pretty = slug.replace(/-/g, ' ');
  return pretty.slice(0, 1).toUpperCase() + pretty.slice(1);
}

export default function CategoryPage() {
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

      const params = new URLSearchParams();
      params.set('take', '24');
      if (cursor) params.set('cursor', cursor);

      const response = await fetch(`${API_BASE}/api/categories/${slug}/articles?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const json = await response.json();
      const page: Article[] = Array.isArray(json.items) ? json.items : [];

      setItems((prev) => (cursor ? [...prev, ...page] : page));
      setNextCursor(json.nextCursor ?? null);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
      if (!cursor) setItems([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  }, [slug]);

  React.useEffect(() => {
    setItems([]);
    setNextCursor(null);
    setInitialLoaded(false);
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
          <span>{label}</span>
        </nav>

        <SectionHeader title={label} />
      </header>

      <div className="mt-8 space-y-8">
        {!initialLoaded && loading ? (
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
            <div className="text-lg font-medium">Aucun article trouve</div>
            <div className="mt-1 text-sm opacity-70">
              Essaie une autre categorie ou <Link to="/news" className="underline">retourne aux articles</Link>.
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

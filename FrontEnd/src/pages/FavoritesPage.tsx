import * as React from 'react';
import { Link } from 'react-router-dom';

import ArticleCard from '@/components/articles/ArticleCard';
import SectionHeader from '@/components/SectionHeader';
import { API_BASE } from '@/config/api';

export default function FavoritesPage() {
  const [items, setItems] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE}/api/favorites?take=24`, {
          credentials: 'include',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const json = await response.json();
        if (!alive) return;

        setItems(json.items || []);
        setError(null);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || 'Failed to load');
        setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <nav className="text-sm opacity-70">
        <Link to="/news" className="hover:underline">
          news
        </Link>
        <span className="mx-2">/</span>
        <span>Saved</span>
      </nav>

      <SectionHeader title="Saved articles" />

      {loading ? (
        <div className="opacity-70">Loading...</div>
      ) : error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/40 dark:bg-red-950/40">
          {error}
        </div>
      ) : items.length ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-black/10 p-6 text-center dark:border-white/10 sm:p-8">
          <div className="text-lg font-medium">No saved article.</div>
          <div className="mt-1 text-sm opacity-70">Save an article from the news page.</div>
        </div>
      )}
    </main>
  );
}

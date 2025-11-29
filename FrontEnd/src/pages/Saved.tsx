// src/pages/Saved.tsx
import * as React from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '@/config/api';
import ArticleCard from '@/components/articles/ArticleCard';

export default function SavedPage() {
  const [items, setItems] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API_BASE}/api/favorites?take=24`, {
          credentials: 'include',
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (!alive) return;
        setItems(j.items || []);
        setError(null);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || 'Failed to load');
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
    <main className="mx-auto w-full max-w-6xl px-4 py-10 space-y-8">
      <nav className="text-sm opacity-70">
        <Link to="/actuality" className="hover:underline">
          Actuality
        </Link>
        <span className="mx-2">/</span>
        <span>Saved</span>
      </nav>

      <h1 className="text-xl font-semibold tracking-tight">Saved articles</h1>

      {loading ? (
        <div className="opacity-70">Loading…</div>
      ) : error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/40 dark:bg-red-950/40">
          {error}
        </div>
      ) : items.length ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-black/10 p-6 text-center dark:border-white/10">
          <div className="text-lg font-medium">No saved article.</div>
          <div className="mt-1 text-sm opacity-70">
            Save an article from the actuality page.
          </div>
        </div>
      )}
    </main>
  );
}

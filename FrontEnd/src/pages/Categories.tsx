// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import React from 'react';
import { Link } from 'react-router-dom';
import SectionHeader from '@/components/SectionHeader';
import { slugify } from '@/utils/slug';
import { API_BASE } from '@/config/api';

type CatRow = { id: string; name: string; slug: string; articleCount?: number };

export default function CategoriesIndex() {
  const [cats, setCats] = React.useState<Array<{ name: string; slug: string; count: number }>>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/categories`);
        if (!res.ok) throw new Error('bad status');
        const json = await res.json();
        const rows: CatRow[] = Array.isArray(json.items) ? json.items : [];
        const list = rows
          .map(r => ({
            name: r.name,
            slug: r.slug || slugify(r.name),
            count: r.articleCount ?? 0, // ⬅️ utilise le bon champ
          }))
          .sort((a, b) => b.count - a.count);
        if (alive) setCats(list);
      } catch {
        if (alive) setCats([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 space-y-6">
      <header className="space-y-2">
        <SectionHeader title="Browse by category" />
        <p className="max-w-2xl text-black/80 dark:text-white/80">
          Pick a category to explore recent articles.
        </p>
      </header>

      {loading ? (
        <div className="text-center opacity-70">Loading…</div>
      ) : cats.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cats.map(({ name, slug, count }) => (
            <li key={slug}>
              <Link
                to={`/actuality/${slug}`} // ⬅️ route correcte
                className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg-neutral-900"
              >
                <span>{name}</span>
                <span className="opacity-60">{count}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-black/10 p-6 text-center dark:border-white/10">
          No categories yet.
        </div>
      )}
    </main>
  );
}
// FIN BLOC

import React from 'react';
import { Link } from 'react-router-dom';

import SectionHeader from '@/components/SectionHeader';
import { API_BASE } from '@/config/api';
import { slugify } from '@/utils/slug';

type CatRow = { id: string; name: string; slug: string; articleCount?: number };

export default function CategoriesIndex() {
  const [cats, setCats] = React.useState<Array<{ name: string; slug: string; count: number }>>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/categories`);
        if (!response.ok) throw new Error('bad status');

        const json = await response.json();
        const rows: CatRow[] = Array.isArray(json.items) ? json.items : [];
        const list = rows
          .map((row) => ({
            name: row.name,
            slug: row.slug || slugify(row.name),
            count: row.articleCount ?? 0,
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
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header className="space-y-4">
        <SectionHeader title="Browse by category" />
        <p className="max-w-2xl text-base leading-relaxed text-black/80 dark:text-white/80 sm:text-lg">
          Pick a category to explore recent articles.
        </p>
      </header>

      {loading ? (
        <div className="text-center opacity-70">Loading...</div>
      ) : cats.length ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cats.map(({ name, slug, count }) => (
            <li key={slug}>
              <Link
                to={`/news/${slug}`}
                className="flex min-h-[44px] items-center justify-between gap-3 rounded-2xl border border-black/10 px-4 py-3 text-sm transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-neutral-900"
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

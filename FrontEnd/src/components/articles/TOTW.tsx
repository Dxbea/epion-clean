import React from 'react';
import { API_BASE } from '@/config/api';
import type { Article } from '@/types/article';
import ArticleCard from '@/components/articles/ArticleCard';
import { Link } from 'react-router-dom';

export default function TopOfWeekRow() {
  const [items, setItems] = React.useState<Article[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // on peut en charger plus côté API, on en affichera 3
        const r = await fetch(`${API_BASE}/api/articles/top?period=7d&take=12`);
        const j = await r.json();
        if (alive) setItems(Array.isArray(j.items) ? j.items : []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading || items.length === 0) return null;

  const visible = items.slice(0, 3);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Top of the week</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs opacity-60">Last 7 days</span>
          <Link
            to="/actuality/top"   // page “browse” (à ajouter plus tard si tu veux)
            className="rounded-full border px-3 py-1 text-sm hover:bg-black/5 dark:border-white/10"
          >
            Browse Top of the week
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(a => <ArticleCard key={a.id} article={a} />)}
      </div>
    </section>
  );
}

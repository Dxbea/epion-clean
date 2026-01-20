import React from 'react';
import { api } from '@/config/api';
import type { Article } from '@/types/article';
import ArticleCard from '@/components/articles/ArticleCard';
import { Link } from 'react-router-dom';
import SectionHeader from '@/components/SectionHeader';

export default function TopOfWeekRow() {
  const [items, setItems] = React.useState<Article[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await api<{ items: Article[] }>('/api/articles/top?period=7d&take=12');
        if (alive) setItems(Array.isArray(j.items) ? j.items : []);
      } catch (err) {
        console.error("Failed to fetch TOTW", err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading || items.length === 0) return null;

  const visible = items.slice(0, 3);

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Top of the week"
        showBar={true}
        right={
          <div className="flex items-center gap-3">
            <span className="text-xs opacity-60">Last 7 days</span>
            <Link
              to="/actuality/top"
              className="rounded-full border px-3 py-1 text-sm hover:bg-black/5 dark:border-white/10"
            >
              Browse Top of the week
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(a => <ArticleCard key={a.id} article={a} />)}
      </div>
    </section>
  );
}

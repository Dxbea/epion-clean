// FrontEnd/src/hooks/useArticles.ts
import React from 'react';
import { API_BASE } from '@/config/api';
import type { Article } from '@/types/article';
export type { Article } from '@/types/article';



export function useArticles() {
  const [articles, setArticles] = React.useState<Article[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<unknown>(null);

  React.useEffect(() => {
    let abort = false;

    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/api/articles`);
        if (!res.ok) throw new Error('Failed to load articles');
        const json = await res.json();

        const normalized: Article[] = (Array.isArray(json?.items) ? json.items : []).map((it: any) => ({
  id: it.id,
  title: it.title,
  excerpt: it.excerpt ?? it.summary ?? null,
  imageUrl: it.imageUrl ?? null,                    // requis mais peut être null
  url: `/article/${it.slug || it.id}`,
  publishedAt: it.publishedAt ?? it.createdAt ?? new Date().toISOString(),
  category: it.category?.name ?? null,              // optionnel + nullable
  tags: it.tags ?? [],
  views: typeof it.views === 'number' ? it.views : 0,
}));

        if (!abort) setArticles(normalized);
      } catch (e) {
        if (!abort) setError(e);
      } finally {
        if (!abort) setLoading(false);
      }
    })();

    return () => { abort = true; };
  }, []);

  return { articles, loading, error };
}

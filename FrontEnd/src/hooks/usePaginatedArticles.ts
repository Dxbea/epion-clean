// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import * as React from 'react';
import { API_BASE } from '@/config/api';
import type { Article } from '@/types/article';
export type { Article } from '@/types/article';

type ApiItem = any;

function mapItem(it: ApiItem): Article {
  return {
    id: it.id,
    title: it.title,
    excerpt: it.excerpt ?? it.summary ?? null,
    imageUrl: it.imageUrl ?? null,
    url: `/article/${it.slug || it.id}`,
    publishedAt: it.publishedAt ?? it.createdAt ?? new Date().toISOString(),
    category: it.category?.name ?? null,
    tags: it.tags ?? [],
    views: typeof it.views === 'number' ? it.views : 0,
  };
}

export function usePaginatedArticles(params?: { take?: number; status?: 'PUBLISHED' | 'ALL' }) {
  const [items, setItems] = React.useState<Article[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const take = Math.min(params?.take ?? 12, 50);
  const status = params?.status ?? 'PUBLISHED';

  const load = React.useCallback(async (cursor?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set('take', String(take));
      if (status === 'ALL') qs.set('status', 'all');
      if (cursor) qs.set('cursor', cursor);
      const res = await fetch(`${API_BASE}/api/articles?${qs.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const mapped: Article[] = (Array.isArray(json.items) ? json.items : []).map(mapItem);
      setItems(prev => cursor ? [...prev, ...mapped] : mapped);
      setNextCursor(json.nextCursor ?? null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [take, status]);

  // 1er chargement
  React.useEffect(() => { load(null); }, [load]);

  const loadMore = React.useCallback(() => {
    if (nextCursor && !loading) load(nextCursor);
  }, [nextCursor, loading, load]);

  return { items, loading, error, loadMore, hasMore: Boolean(nextCursor) };
}
// FIN BLOC

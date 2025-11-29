// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import * as React from 'react';
import { API_BASE } from '@/config/api';

export type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  articleCount: number;
};

export function useCategories() {
  const [items, setItems] = React.useState<CategoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/api/categories`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const list: CategoryItem[] = Array.isArray(json?.items) ? json.items : [];
        if (alive) setItems(list);
      } catch (e: any) {
        if (alive) setError(e?.message || 'Failed to load categories');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return { items, loading, error };
}
// FIN BLOC

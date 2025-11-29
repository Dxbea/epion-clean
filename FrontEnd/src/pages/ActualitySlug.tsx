// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import React from 'react';
import { useParams } from 'react-router-dom';
import Category from './Category';
import Article from './Article';
import { API_BASE } from '@/config/api';

type Mode = 'loading' | 'article' | 'category' | 'notfound';

export default function ActualitySlug() {
  const { slug = '' } = useParams();
  const [mode, setMode] = React.useState<Mode>('loading');

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // 1) On essaie d'abord: est-ce un article ?
        const r = await fetch(`${API_BASE}/api/articles/slug/${slug}`);
        if (!alive) return;
        if (r.ok) {
          setMode('article');
          return;
        }
        if (r.status !== 404) {
          setMode('notfound');
          return;
        }

        // 2) Sinon on vérifie si c'est une catégorie connue
        const rc = await fetch(`${API_BASE}/api/categories`);
        const jc = await rc.json().catch(() => ({}));
        const slugs: string[] = Array.isArray(jc?.items) ? jc.items.map((c: any) => c.slug) : [];
        setMode(slugs.includes(slug) ? 'category' : 'notfound');
      } catch {
        if (alive) setMode('notfound');
      }
    })();

    return () => {
      alive = false;
    };
  }, [slug]);

  if (mode === 'loading') {
    return <main className="mx-auto w-full max-w-7xl px-4 py-10">Loading…</main>;
  }

  if (mode === 'article') return <Article />;
  if (mode === 'category') return <Category />;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10">
      <div className="rounded-2xl border border-black/10 p-6 text-center dark:border-white/10">
        <div className="text-lg font-medium">Not found</div>
        <div className="mt-1 text-sm opacity-70">This article or category does not exist.</div>
      </div>
    </main>
  );
}
// FIN BLOC

import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SectionHeader from '@/components/SectionHeader';
import ArticleCard from '@/components/articles/ArticleCard';
import { API_BASE } from '@/config/api';
import type { Article } from '@/types/article';

const TABS = ['ALL', 'DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
type Tab = typeof TABS[number];

export default function MyArticlesPage() {
  const [params, setParams] = useSearchParams();

  const tab = (params.get('status')?.toUpperCase() as Tab) || 'ALL';
  const qParam = (params.get('q') || '').trim();

  const [items, setItems] = React.useState<
    (Article & { slug?: string | null; status?: string | null })[]
  >([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [stats, setStats] = React.useState<{
    total: number;
    draft: number;
    published: number;
    archived: number;
  } | null>(null);

  // fetch stats une seule fois
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/me/articles/stats`, {
          credentials: 'include',
        });
        if (!r.ok) return;
        const j = await r.json();
        if (!alive) return;
        setStats({
          total: j.total ?? 0,
          draft: j.draft ?? 0,
          published: j.published ?? 0,
          archived: j.archived ?? 0,
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const load = React.useCallback(
    async (cursor?: string | null) => {
      try {
        if (!cursor) setLoading(true);

        const qp = new URLSearchParams();
        qp.set('status', tab); // le back interprète 'ALL' comme pas de filtre
        if (qParam) qp.set('q', qParam);
        qp.set('take', '24');
        if (cursor) qp.set('cursor', cursor);

        const res = await fetch(
          `${API_BASE}/api/me/articles?${qp.toString()}`,
          { credentials: 'include' }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        const page: any[] = Array.isArray(json.items) ? json.items : [];

        setItems((prev) => (cursor ? [...prev, ...page] : page));
        setNextCursor(json.nextCursor ?? null);
        setError(null);
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
        if (!cursor) {
          setItems([]);
          setNextCursor(null);
        }
      } finally {
        setLoading(false);
      }
    },
    [tab, qParam]
  );

  // reload quand l’onglet ou la query change
  React.useEffect(() => {
    load(null);
  }, [load]);

  function setTab(t: Tab) {
    const p = new URLSearchParams(params);
    if (t === 'ALL') p.delete('status');
    else p.set('status', t);
    setParams(p, { replace: true });
  }

  function setQuery(v: string) {
    const p = new URLSearchParams(params);
    if (v.trim()) p.set('q', v);
    else p.delete('q');
    setParams(p, { replace: true });
  }

  // ref vers l’input de recherche pour récupérer sa valeur quand on clique la loupe
  const searchRef = React.useRef<HTMLInputElement | null>(null);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 space-y-8">
      {/* breadcrumb */}
      <nav className="text-sm opacity-70">
        <Link to="/actuality" className="hover:underline">
          Actuality
        </Link>
        <span className="mx-2">/</span>
        <span>My articles</span>
      </nav>

      <SectionHeader title="My articles" />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Tabs status */}
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-3 py-1 text-sm dark:border-white/10 ${
              tab === t
                ? 'bg-black text-white dark:bg-white dark:text-black'
                : ''
            }`}
          >
            {t === 'ALL' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase()}
            {stats && t === 'ALL'
              ? ` (${stats.total})`
              : stats && t === 'DRAFT'
              ? ` (${stats.draft})`
              : stats && t === 'PUBLISHED'
              ? ` (${stats.published})`
              : stats && t === 'ARCHIVED'
              ? ` (${stats.archived})`
              : ''}
          </button>
        ))}

        {/* Search + New article */}
        <div className="ml-auto flex w-full items-center gap-3 sm:w-auto">
          {/* champ recherche */}
          <div className="relative w-full max-w-full sm:w-[38rem]">
            <input
              ref={searchRef}
              defaultValue={qParam}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const value = (e.target as HTMLInputElement).value;
                  setQuery(value);
                }
              }}
              placeholder="Search in my articles…"
              className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 pr-14 text-sm dark:border-white/10 dark:bg-neutral-950"
            />
            {/* bouton loupe */}
            <button
              type="button"
              aria-label="Search"
              title="Search"
              className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black text-white dark:bg-white dark:text-black"
              onMouseDown={(e) => e.preventDefault()} // ne pas blur l’input
              onClick={() => {
                const value = searchRef.current?.value || '';
                setQuery(value);
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                className="opacity-95"
              >
                <circle
                  cx="11"
                  cy="11"
                  r="7"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M20 20L16.65 16.65"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* bouton create */}
          <Link
            to="/actuality/create"
            className="inline-flex h-12 items-center rounded-2xl bg-black px-5 text-sm text-white dark:bg-white dark:text-black"
          >
            New article
          </Link>
        </div>
      </div>

      {/* Liste / contenu */}
      {loading && !items.length ? (
        <div className="opacity-70">Loading…</div>
      ) : error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/40 dark:bg-red-950/40">
          {error}
        </div>
      ) : items.length ? (
        <>
          {/* grille d’articles */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => {
            // on reconstruit l’URL d’édition à partir du slug si dispo, sinon l’id
            const editUrl = `/account/articles/${encodeURIComponent(
              a.slug || a.id
            )}/edit`;

            return (
              <Link
                key={a.id}
                to={editUrl}
                className="block focus:outline-none focus:ring-2 focus:ring-[#4290D3] rounded-2xl"
              >
                <ArticleCard article={a as Article} />
              </Link>
            );
          })}
        </div>


          {/* pagination */}
          <div className="flex justify-center">
            {nextCursor ? (
              <button
                onClick={() => load(nextCursor)}
                className="mt-6 rounded-full border px-4 py-2 text-sm hover:bg-black/5 dark:border-white/10"
              >
                Afficher plus
              </button>
            ) : (
              <span className="mt-6 text-sm opacity-60">Fin de liste</span>
            )}
          </div>
        </>
      ) : (
        // état vide
        <div className="rounded-2xl border border-black/10 p-6 text-center dark:border-white/10">
          <div className="text-lg font-medium">Aucun article</div>
          <div className="mt-1 text-sm opacity-70">
            Crée ton premier article.
          </div>
          <Link
            to="/actuality/create"
            className="mt-4 inline-block rounded-full bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
          >
            Create an article
          </Link>
        </div>
      )}
    </main>
  );
}

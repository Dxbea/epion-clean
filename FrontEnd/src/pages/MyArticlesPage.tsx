import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import ArticleCard from '@/components/articles/ArticleCard';
import SectionHeader from '@/components/SectionHeader';
import { Button } from '@/components/ui';
import { API_BASE } from '@/config/api';
import type { Article } from '@/types/article';

const TABS = ['ALL', 'DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
type Tab = typeof TABS[number];

export default function MyArticlesPage() {
  const [params, setParams] = useSearchParams();

  const tab = (params.get('status')?.toUpperCase() as Tab) || 'ALL';
  const qParam = (params.get('q') || '').trim();

  const [items, setItems] = React.useState<(Article & { slug?: string | null; status?: string | null })[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [stats, setStats] = React.useState<{
    total: number;
    draft: number;
    published: number;
    archived: number;
  } | null>(null);

  const searchRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/me/articles/stats`, {
          credentials: 'include',
        });
        if (!response.ok) return;

        const json = await response.json();
        if (!alive) return;

        setStats({
          total: json.total ?? 0,
          draft: json.draft ?? 0,
          published: json.published ?? 0,
          archived: json.archived ?? 0,
        });
      } catch {
        // Ignore the stats panel if unavailable.
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const load = React.useCallback(async (cursor?: string | null) => {
    try {
      if (!cursor) setLoading(true);

      const queryParams = new URLSearchParams();
      queryParams.set('status', tab);
      if (qParam) queryParams.set('q', qParam);
      queryParams.set('take', '24');
      if (cursor) queryParams.set('cursor', cursor);

      const response = await fetch(`${API_BASE}/api/me/articles?${queryParams.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const json = await response.json();
      const page: any[] = Array.isArray(json.items) ? json.items : [];

      setItems((prev) => (cursor ? [...prev, ...page] : page));
      setNextCursor(json.nextCursor ?? null);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
      if (!cursor) {
        setItems([]);
        setNextCursor(null);
      }
    } finally {
      setLoading(false);
    }
  }, [qParam, tab]);

  React.useEffect(() => {
    load(null);
  }, [load]);

  function setTab(nextTab: Tab) {
    const next = new URLSearchParams(params);
    if (nextTab === 'ALL') next.delete('status');
    else next.set('status', nextTab);
    setParams(next, { replace: true });
  }

  function setQuery(value: string) {
    const next = new URLSearchParams(params);
    if (value.trim()) next.set('q', value.trim());
    else next.delete('q');
    setParams(next, { replace: true });
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <nav className="text-sm opacity-70">
        <Link to="/news" className="hover:underline">
          news
        </Link>
        <span className="mx-2">/</span>
        <span>My articles</span>
      </nav>

      <SectionHeader title="My articles" className="mt-4" />

      <div className="mt-8 flex flex-col gap-4">
        <div className="thin-scroll -mx-1 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-2 px-1">
            {TABS.map((item) => (
              <Button
                key={item}
                variant={tab === item ? 'secondary' : 'ghost'}
                size="auto"
                className="min-h-[44px] rounded-full px-4 py-2 text-sm"
                aria-pressed={tab === item}
                onClick={() => setTab(item)}
              >
                {item === 'ALL' ? 'All' : item.charAt(0) + item.slice(1).toLowerCase()}
                {stats && item === 'ALL'
                  ? ` (${stats.total})`
                  : stats && item === 'DRAFT'
                    ? ` (${stats.draft})`
                    : stats && item === 'PUBLISHED'
                      ? ` (${stats.published})`
                      : stats && item === 'ARCHIVED'
                        ? ` (${stats.archived})`
                        : ''}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-[38rem]">
            <input
              ref={searchRef}
              defaultValue={qParam}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setQuery((event.target as HTMLInputElement).value);
                }
              }}
              placeholder="Search in my articles..."
              className="form-input h-10 rounded-2xl pr-14 text-sm sm:h-12"
            />

            <Button
              type="button"
              variant="primary"
              size="icon"
              aria-label="Search"
              title="Search"
              className="absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full sm:h-10 sm:w-10"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setQuery(searchRef.current?.value || '')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="opacity-95">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </Button>
          </div>

          <Button
            as={Link}
            to="/create"
            variant="primary"
            size="auto"
            className="min-h-[44px] w-full justify-center rounded-2xl px-5 py-3 text-sm lg:w-auto"
          >
            New article
          </Button>
        </div>
      </div>

      <div className="mt-8">
        {loading && !items.length ? (
          <div className="opacity-70">Loading...</div>
        ) : error ? (
          <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/40 dark:bg-red-950/40">
            {error}
          </div>
        ) : items.length ? (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((article) => {
                const editUrl = `/account/articles/${encodeURIComponent(article.slug || article.id)}/edit`;

                return (
                  <Link
                    key={article.id}
                    to={editUrl}
                    className="block rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#4290D3]"
                  >
                    <ArticleCard article={article as Article} />
                  </Link>
                );
              })}
            </div>

            <div className="mt-8 flex justify-center">
              {nextCursor ? (
                <Button
                  variant="secondary"
                  size="auto"
                  className="min-h-[44px] rounded-full px-5 py-2.5 text-sm"
                  onClick={() => load(nextCursor)}
                >
                  Afficher plus
                </Button>
              ) : (
                <span className="text-sm opacity-60">Fin de liste</span>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-3xl border border-black/10 p-6 text-center dark:border-white/10">
            <div className="text-lg font-medium">Aucun article</div>
            <div className="mt-1 text-sm opacity-70">Cree ton premier article.</div>
            <Button
              as={Link}
              to="/create"
              variant="primary"
              size="auto"
              className="mt-4 min-h-[44px] rounded-full px-5 py-2.5 text-sm"
            >
              Create an article
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}

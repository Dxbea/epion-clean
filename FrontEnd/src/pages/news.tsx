import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

import ArticleSection from '@/components/articles/ArticleSection';
import HeroArticle from '@/components/articles/HeroArticle';
import TopOfWeekRow from '@/components/articles/TOTW';
import SectionHeader from '@/components/SectionHeader';
import { Button } from '@/components/ui';
import { api } from '@/config/api';
import { useMe } from '@/contexts/MeContext';
import { usePaginatedArticles } from '@/hooks/usePaginatedArticles';
import { useAuthRequired } from '@/hooks/useAuthRequired';
import { useI18n } from '@/i18n/I18nContext';
import type { Article } from '@/types/article';

const FALLBACK: Article[] = [
  {
    id: '1',
    title: 'Startups raise...',
    imageUrl: '/img/a1.jpg',
    url: 'https://example.com/1',
    publishedAt: new Date().toISOString(),
    category: 'Economy',
    views: 300,
    excerpt: '',
  },
  {
    id: '2',
    title: 'Energy prices fall',
    imageUrl: '/img/a2.jpg',
    url: 'https://example.com/2',
    publishedAt: new Date().toISOString(),
    category: 'Economy',
    views: 80,
    excerpt: '',
  },
  {
    id: '3',
    title: 'Eurozone PMI slips',
    imageUrl: '/img/a3.jpg',
    url: 'https://example.com/3',
    publishedAt: new Date().toISOString(),
    category: 'Economy',
    views: 260,
    excerpt: '',
  },
  {
    id: '4',
    title: 'UK condemns Hong Kong...',
    imageUrl: '/img/a4.jpg',
    url: 'https://example.com/4',
    publishedAt: new Date().toISOString(),
    category: 'World Conflict',
    views: 120,
    excerpt: '',
  },
  {
    id: '5',
    title: 'Thai & Cambodian...',
    imageUrl: '/img/a5.jpg',
    url: 'https://example.com/5',
    publishedAt: new Date().toISOString(),
    category: 'World Conflict',
    views: 150,
    excerpt: '',
  },
  {
    id: '6',
    title: 'School leavers joining...',
    imageUrl: '/img/a6.jpg',
    url: 'https://example.com/6',
    publishedAt: new Date().toISOString(),
    category: 'World Conflict',
    views: 90,
    excerpt: '',
  },
  {
    id: '7',
    title: 'Tonight as Arsenal...',
    imageUrl: '/img/a7.jpg',
    url: 'https://example.com/7',
    publishedAt: new Date().toISOString(),
    category: 'Sport',
    views: 520,
    excerpt: '',
  },
  {
    id: '8',
    title: 'Popcar set for Tour...',
    imageUrl: '/img/a8.jpg',
    url: 'https://example.com/8',
    publishedAt: new Date().toISOString(),
    category: 'Sport',
    views: 410,
    excerpt: '',
  },
  {
    id: '9',
    title: 'Unforios Lions...',
    imageUrl: '/img/a9.jpg',
    url: 'https://example.com/9',
    publishedAt: new Date().toISOString(),
    category: 'Sport',
    views: 380,
    excerpt: '',
  },
  {
    id: '10',
    title: 'Insurance giant...',
    imageUrl: '/img/a10.jpg',
    url: 'https://example.com/10',
    publishedAt: new Date().toISOString(),
    category: 'Tech',
    views: 260,
    excerpt: '',
  },
  {
    id: '11',
    title: 'Opticians split...',
    imageUrl: '/img/a11.jpg',
    url: 'https://example.com/11',
    publishedAt: new Date().toISOString(),
    category: 'Tech',
    views: 190,
    excerpt: '',
  },
  {
    id: '12',
    title: 'Video game creation...',
    imageUrl: '/img/a12.jpg',
    url: 'https://example.com/12',
    publishedAt: new Date().toISOString(),
    category: 'Tech',
    views: 130,
    excerpt: '',
  },
];

function groupBy<T, K extends string | number>(arr: T[], key: (x: T) => K) {
  return arr.reduce((acc, item) => {
    const k = key(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {} as Record<K, T[]>);
}

const since24h = (iso: string) => Date.now() - new Date(iso).getTime() <= 24 * 3600 * 1000;

export default function News() {
  const navigate = useNavigate();
  const { me } = useMe();
  const { t } = useI18n();
  const { requireAuth } = useAuthRequired();
  const { items, hasMore, loadMore } = usePaginatedArticles({ take: 24 });

  const [followingArticles, setFollowingArticles] = React.useState<Article[]>([]);
  const [apiHero, setApiHero] = React.useState<Article | null>(null);

  const articles = items.length ? items : FALLBACK;

  const memoHero = React.useMemo(() => {
    if (!articles.length) return null;

    const last24 = [...articles]
      .filter((article) => since24h(article.publishedAt))
      .sort((a, b) => (b.views || 0) - (a.views || 0))[0];

    return last24 || [...articles].sort((a, b) => (b.views || 0) - (a.views || 0))[0];
  }, [articles]);

  const hero = apiHero || memoHero;

  const byCategory = React.useMemo(() => {
    const valid = articles.filter((article) => {
      const name = (article.category ?? '').trim();
      return name && name.toLowerCase() !== 'null';
    });

    return groupBy(valid, (article) => article.category!);
  }, [articles]);

  const popularCategories = React.useMemo(() => {
    return Object.entries(byCategory)
      .map(([name, categoryArticles]) => ({
        name,
        totalViews: categoryArticles.reduce((sum, article) => sum + (article.views ?? 0), 0),
        newest: Math.max(...categoryArticles.map((article) => +new Date(article.publishedAt))),
      }))
      .sort((a, b) => {
        if (b.totalViews !== a.totalViews) return b.totalViews - a.totalViews;
        if (b.newest !== a.newest) return b.newest - a.newest;
        return Math.random() - 0.5;
      })
      .slice(0, 4)
      .map((row) => row.name);
  }, [byCategory]);

  const categorySections = React.useMemo(() => {
    return popularCategories.map((name) => ({
      title: name,
      category: name,
      articles: [...byCategory[name]].sort(
        (a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt)
      ),
    }));
  }, [popularCategories, byCategory]);

  const discoveryRows = React.useMemo(() => {
    if (!articles.length) return [[], []] as [Article[], Article[]];

    const sortedByViewsAsc = [...articles].sort((a, b) => (a.views || 0) - (b.views || 0));
    const poolSize = Math.max(6, Math.ceil(sortedByViewsAsc.length * 0.1));
    const pool = sortedByViewsAsc.slice(0, poolSize);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);

    const fillRow = (count: number, taken: Article[]) => {
      const remaining = sortedByViewsAsc.filter((article) => !taken.includes(article));
      return taken.concat(remaining.slice(0, Math.max(0, count - taken.length)));
    };

    const row1 = fillRow(3, shuffled.slice(0, 3));
    const row2 = fillRow(3, shuffled.slice(3, 6));

    return [row1.slice(0, 3), row2.slice(0, 3)] as [Article[], Article[]];
  }, [articles]);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const response = await api<{ items: Article[] }>('/api/articles/top?period=all&take=1');
        if (alive) setApiHero((response.items?.[0] as Article) || null);
      } catch {
        // Keep the memoized hero fallback.
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    if (!me) return;

    let alive = true;

    (async () => {
      try {
        const response = await api<{ items: Article[] }>('/api/articles/following');
        if (alive) setFollowingArticles(Array.isArray(response.items) ? response.items : []);
      } catch (error) {
        console.error('Failed to fetch following feed', error);
      }
    })();

    return () => {
      alive = false;
    };
  }, [me]);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header className="space-y-6">
        <div className="space-y-3">
          <h1 className="font-serif text-4xl font-medium tracking-tight sm:text-5xl">
            {t('news_title')}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-black/80 dark:text-white/80 sm:text-lg">
            {t('news_lead')}
          </p>
        </div>

        <div>
          <Button
            as={Link}
            to="/create"
            variant="primary"
            size="auto"
            className="min-h-[44px] rounded-full px-6 py-3 text-sm sm:text-base"
            onClick={(event) => {
              if (!requireAuth('Connectez-vous pour utiliser cette fonctionnalite.')) {
                event.preventDefault();
              }
            }}
          >
            {t('news_ask_create')}
          </Button>
        </div>
      </header>

      <section className="space-y-6">
        <SectionHeader title={t('news_highlight')} />
        <HeroArticle article={hero} />
      </section>

      <TopOfWeekRow />

      {me && (
        followingArticles.length > 0 ? (
          <ArticleSection
            title={t('news_following')}
            articles={followingArticles.slice(0, 4)}
          />
        ) : (
          <section className="rounded-3xl border border-black/5 bg-black/[0.02] p-6 text-center dark:border-white/5 dark:bg-white/[0.02] sm:p-8">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {t('news_no_following')}
            </p>
          </section>
        )
      )}

      <section className="space-y-10">
        {categorySections.map((section) => (
          <ArticleSection
            key={section.title}
            title={section.title}
            category={section.category}
            articles={section.articles}
          />
        ))}
      </section>

      <section className="space-y-6">
        <SectionHeader title={t('news_discovery')} />
        <ArticleSection title="" articles={discoveryRows[0]} showHeader={false} />
        <ArticleSection title="" articles={discoveryRows[1]} showHeader={false} />

        <div className="flex items-center justify-center">
          {hasMore ? (
            <Button
              variant="secondary"
              size="auto"
              className="mt-2 min-h-[44px] rounded-full px-5 py-2.5 text-sm"
              onClick={(event) => {
                if (!requireAuth("Connectez-vous pour charger plus d'articles.")) {
                  event.preventDefault();
                  return;
                }

                loadMore();
              }}
            >
              {t('news_load_more')}
            </Button>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader title={t('news_search_explore')} />
        <div className="flex flex-col items-stretch gap-4 rounded-3xl border border-black/10 p-6 dark:border-white/10 sm:p-8">
          <input
            type="search"
            placeholder={t('news_search_placeholder')}
            className="form-input h-11 max-w-2xl sm:h-12"
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;

              if (!requireAuth('Connectez-vous pour faire une recherche.')) {
                event.preventDefault();
                return;
              }

              const query = (event.target as HTMLInputElement).value.trim();
              if (query) navigate(`/news/search?q=${encodeURIComponent(query)}`);
            }}
          />

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Button
              as={Link}
              to="/news/categories"
              variant="secondary"
              size="auto"
              className="min-h-[44px] rounded-full px-5 py-2.5 text-sm"
              onClick={(event) => {
                if (!requireAuth('Connectez-vous pour explorer les categories.')) {
                  event.preventDefault();
                }
              }}
            >
              {t('news_search_categories')}
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

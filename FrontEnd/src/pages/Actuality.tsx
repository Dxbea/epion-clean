// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import React from 'react';
import HeroArticle from '@/components/articles/HeroArticle';
import ArticleSection from '@/components/articles/ArticleSection';
import SectionHeader from '@/components/SectionHeader';
import type { Article } from '@/types/article';
import { usePaginatedArticles } from '@/hooks/usePaginatedArticles';
import TopOfWeekRow from '@/components/articles/TOTW';
import { API_BASE } from '@/config/api';
import { useLocation } from 'react-router-dom';




// -------- Mock/fallback (sert si l’API ne renvoie rien) --------
const FALLBACK: Article[] = [
  { id:'1',  title:'Startups raise...',            imageUrl:'/img/a1.jpg',  url:'https://example.com/1',  publishedAt:new Date().toISOString(), category:'Economy',        views:300 },
  { id:'2',  title:'Energy prices fall',           imageUrl:'/img/a2.jpg',  url:'https://example.com/2',  publishedAt:new Date().toISOString(), category:'Economy',        views:80  },
  { id:'3',  title:'Eurozone PMI slips',           imageUrl:'/img/a3.jpg',  url:'https://example.com/3',  publishedAt:new Date().toISOString(), category:'Economy',        views:260 },
  { id:'4',  title:'UK condemns Hong Kong...',     imageUrl:'/img/a4.jpg',  url:'https://example.com/4',  publishedAt:new Date().toISOString(), category:'World Conflict', views:120 },
  { id:'5',  title:'Thai & Cambodian...',          imageUrl:'/img/a5.jpg',  url:'https://example.com/5',  publishedAt:new Date().toISOString(), category:'World Conflict', views:150 },
  { id:'6',  title:'School leavers joining...',    imageUrl:'/img/a6.jpg',  url:'https://example.com/6',  publishedAt:new Date().toISOString(), category:'World Conflict', views:90  },
  { id:'7',  title:'Tonight as Arsenal...',        imageUrl:'/img/a7.jpg',  url:'https://example.com/7',  publishedAt:new Date().toISOString(), category:'Sport',          views:520 },
  { id:'8',  title:'Popcar set for Tour...',       imageUrl:'/img/a8.jpg',  url:'https://example.com/8',  publishedAt:new Date().toISOString(), category:'Sport',          views:410 },
  { id:'9',  title:'Unforios Lions...',            imageUrl:'/img/a9.jpg',  url:'https://example.com/9',  publishedAt:new Date().toISOString(), category:'Sport',          views:380 },
  { id:'10', title:'Insurance giant...',           imageUrl:'/img/a10.jpg', url:'https://example.com/10', publishedAt:new Date().toISOString(), category:'Tech',           views:260 },
  { id:'11', title:'Opticians split...',           imageUrl:'/img/a11.jpg', url:'https://example.com/11', publishedAt:new Date().toISOString(), category:'Tech',           views:190 },
  { id:'12', title:'Video game creation...',       imageUrl:'/img/a12.jpg', url:'https://example.com/12', publishedAt:new Date().toISOString(), category:'Tech',           views:130 },
];

// -------- utils --------
function groupBy<T, K extends string | number>(arr: T[], key: (x:T)=>K){
  return arr.reduce((acc, it) => {
    const k = key(it);
    (acc[k] ||= []).push(it);
    return acc;
  }, {} as Record<K, T[]>);
}
const since24h = (iso: string) => Date.now() - new Date(iso).getTime() <= 24*3600*1000;

export default function Actuality(){
  // 🔗 Récupère les articles paginés depuis l’API
  const { items, hasMore, loadMore } = usePaginatedArticles({ take: 24 });

  // Fallback si l’API est vide / down
  const articles: Article[] = items.length ? items : FALLBACK;

  // HERO = le plus vu des dernières 24h sinon le plus vu global
  const [hero, setHero] = React.useState<Article | null>(null);
  React.useMemo(() => {
    const last24 = [...articles]
      .filter(a => since24h(a.publishedAt))
      .sort((a,b)=>(b.views||0)-(a.views||0))[0];
    setHero(last24 || [...articles].sort((a,b)=>(b.views||0)-(a.views||0))[0]);
  }, [articles]);

  // -------- sections par catégorie (top 4 + tie-breaker aléatoire) --------
  const byCat = React.useMemo(() => {
    const valid = articles.filter(a => {
      const name = (a.category ?? '').trim();
      return name && name.toLowerCase() !== 'null';
    });
    return groupBy(valid, a => a.category!);
  }, [articles]);

  const popularCats = React.useMemo(() => {
    const rows = Object.entries(byCat).map(([name, arr]) => {
      const totalViews = arr.reduce((s, a) => s + (a.views ?? 0), 0);
      const newest = Math.max(...arr.map(a => +new Date(a.publishedAt)));
      return { name, totalViews, newest };
    });

    return rows
      .sort((a, b) => {
        if (b.totalViews !== a.totalViews) return b.totalViews - a.totalViews;
        if (b.newest !== a.newest) return b.newest - a.newest;
        return Math.random() - 0.5;
      })
      .slice(0, 4)
      .map(r => r.name);
  }, [byCat]);

  const catSections = React.useMemo(() => {
    return popularCats.map(name => ({
      title: name,
      category: name,
      articles: [...byCat[name]].sort(
        (a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt)
      ),
    }));
  }, [popularCats, byCat]);

  // Discovery = 2 lignes * 3 cartes minimum, même si le pool 10% est trop petit
  const discoveryRows = React.useMemo(() => {
    if (!articles.length) return [[], []] as [Article[], Article[]];

    const sortedByViewsAsc = [...articles].sort((a,b)=>(a.views||0)-(b.views||0));
    const poolSize = Math.max(6, Math.ceil(sortedByViewsAsc.length * 0.10));
    const pool = sortedByViewsAsc.slice(0, poolSize);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);

    const need = (n:number, taken:Article[]) => {
      const rest = sortedByViewsAsc.filter(a => !taken.includes(a));
      return taken.concat(rest.slice(0, Math.max(0, n - taken.length)));
    };

    const row1 = need(3, shuffled.slice(0, 3));
    const row2Start = shuffled.slice(3, 6);
    const row2 = need(3, row2Start);

    return [row1.slice(0,3), row2.slice(0,3)] as [Article[], Article[]];
  }, [articles]);


  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/articles/top?period=all&take=1`);
        const j = await r.json();
        if (alive) setHero((j.items?.[0] as Article) || null);
      } catch {}
    })();
    return () => { alive = false; };
  }, []);




  


  

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 space-y-10">
      {/* Header simple */}
      <header>
        <h1 className="text-3xl font-semibold">Actuality</h1>
        <p className="mt-2 max-w-2xl text-black/80 dark:text-white/80">
          Here is the place you will find daily news on the world, you can browse, and ask AI to resume, explain, or create.
        </p>
        <div className="mt-4">
          <a
            href="/create"
            className="rounded-xl bg-black px-4 py-2 text-white hover:opacity-90 dark:bg-white dark:text-black"
          >
            Ask AI to create an article
          </a>
        </div>
      </header>

      {/* Hero */}
      <SectionHeader title="Today’s highlight" />
      <HeroArticle article={hero} />
      
      {/* TOTW */}
      <TopOfWeekRow />

      {/* Catégories populaires */}
      <section className="space-y-10">
        {catSections.map(sec => (
          <ArticleSection
            key={sec.title}
            title={sec.title}
            category={sec.category}
            articles={sec.articles}
          />
        ))}
      </section>

      {/* Discovery : 2 lignes, 3 cartes par ligne */}
      <section className="space-y-6">
        <SectionHeader title="Discovery" />
        <ArticleSection title="" articles={discoveryRows[0]} showHeader={false} />
        <ArticleSection title="" articles={discoveryRows[1]} showHeader={false} />

        {/* Load more — charge la page suivante de l’API si disponible */}
        <div className="flex items-center justify-center">
          {hasMore ? (
            <button
              onClick={loadMore}
              className="mt-4 rounded-full border px-4 py-2 text-sm hover:bg-black/5 dark:border-white/10"
            >
              Load more
            </button>
          ) : null}
        </div>
      </section>

      {/* Search & Explore */}
      <section className="mt-8 space-y-3">
        <SectionHeader title="Search & explore" />
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/10">
          <input
            type="search"
            placeholder="Search for an article…"
            className="w-full max-w-2xl rounded-xl border border-black/10 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#4290D3]
                       dark:border-white/10 dark:bg-neutral-950"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const q = (e.target as HTMLInputElement).value.trim();
                if (q) window.location.href = `/actuality/search?q=${encodeURIComponent(q)}`;
              }
            }}
          />
          <div className="flex items-center gap-2">
            <a
              href="/actuality/categories"
              className="rounded-xl border px-4 py-2 text-sm hover:bg-black/5 dark:border-white/10"
            >
              Find articles by category
            </a>
            <a
              href="/actuality/favorites"
              className="rounded-xl border px-4 py-2 text-sm hover:bg-black/5 dark:border-white/10"
            >
              Favorites
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
// FIN BLOC

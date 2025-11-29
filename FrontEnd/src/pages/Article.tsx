// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import React from 'react';
import { Link, useParams } from 'react-router-dom';
import SectionHeader from '@/components/SectionHeader';
import ArticleCard from '@/components/articles/ArticleCard';
import { API_BASE } from '@/config/api';
import SaveButton from '@/components/ui/SaveButton';
import { useMe } from '@/contexts/MeContext';
import LikeButton from '@/components/ui/LikeButton';
import CommentsBlock from '@/components/comments/CommentsBlock';
import type { Article as CardArticle } from '@/types/article';

type LoadedArticle = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  imageUrl: string | null;
  publishedAt: string;
  category: { id: string; slug: string; name: string } | null;
  author: { id: string; email: string; name: string | null } | null;
};

export default function Article() {
  const { slug = '' } = useParams();
  const { me } = useMe();

  const [article, setArticle] = React.useState<LoadedArticle | null>(null);
  const [related, setRelated] = React.useState<CardArticle[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [viewsAll, setViewsAll] = React.useState<number | null>(null);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const editMenuRef = React.useRef<HTMLDivElement | null>(null);



  // ----------------------------------------
  // Sécurité : referme le menu "Edit" au clic extérieur ou Esc
  // ----------------------------------------
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!editMenuRef.current) return;
      if (!editMenuRef.current.contains(e.target as Node)) {
        setIsEditOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsEditOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // ----------------------------------------
  // Charger l'article
  // ----------------------------------------
  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/articles/slug/${encodeURIComponent(slug)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!alive) return;

        setArticle({
          id: data.id,
          slug: data.slug,
          title: data.title,
          excerpt: data.excerpt ?? null,
          content: data.content ?? null,
          imageUrl: data.imageUrl ?? null,
          publishedAt: data.publishedAt ?? new Date().toISOString(),
          category: data.category,
          author: data.author,
        });
      } catch (e: any) {
        if (alive) {
          setError(e?.message || 'Failed to load article');
          setArticle(null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  // ----------------------------------------
  // Enregistrer une vue (POST /view)
  // ----------------------------------------
  React.useEffect(() => {
    if (!article?.id) return;
    const key = `viewed:${article.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');

    fetch(`${API_BASE}/api/articles/${article.id}/view`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
  }, [article?.id]);

  // ----------------------------------------
  // Charger les stats (viewsAll)
  // ----------------------------------------
  React.useEffect(() => {
    if (!article?.id) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/articles/${article.id}/stats`);
        if (!res.ok) return;
        const j = await res.json();
        if (alive) setViewsAll(j.viewsAll ?? 0);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [article?.id]);

  // ----------------------------------------
  // Charger les articles "related"
  // ----------------------------------------
  React.useEffect(() => {
    if (!article?.category?.name) return;
    let alive = true;
    (async () => {
      try {
        const params = new URLSearchParams({ take: '24' });
        const res = await fetch(`${API_BASE}/api/articles?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        const items: CardArticle[] = (Array.isArray(json.items) ? json.items : []).map((it: any) => ({
          id: it.id,
          title: it.title,
          excerpt: it.summary ?? it.excerpt ?? null,
          imageUrl: it.imageUrl ?? null,
          url: `/article/${it.slug || it.id}`,
          publishedAt: it.publishedAt ?? it.createdAt ?? new Date().toISOString(),
          category: it.category?.name ?? null,
          tags: it.tags ?? [],
          views: typeof it.views === 'number' ? it.views : 0,
        }));

        const sameCat = items
          .filter((it) => (it.category ?? '').toLowerCase() === article.category!.name.toLowerCase())
          .filter((it) => it.id !== article.id)
          .slice(0, 6);

        if (alive) setRelated(sameCat);
      } catch {
        if (alive) setRelated([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [article?.category?.name, article?.id]);

  // ----------------------------------------
  // Déterminer si le user est l'auteur
  // ----------------------------------------
  const isAuthor =
    !!(me && article?.author) &&
    (me.id === article.author.id || me.email?.toLowerCase() === article.author.email?.toLowerCase());

  // ----------------------------------------
  // rendu principal
  // ----------------------------------------

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <div className="text-center opacity-70">Loading…</div>
      </main>
    );
  }

  if (error || !article) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <div className="rounded-2xl border border-black/10 p-6 text-center dark:border-white/10">
          <div className="text-lg font-medium">Not found</div>
          <div className="mt-1 text-sm opacity-70">
            {error === 'HTTP 404' ? 'This article does not exist.' : 'This article or category does not exist.'}
          </div>
        </div>
      </main>
    );
  }

  const { title, content, excerpt, publishedAt, imageUrl, category, author } = article;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 space-y-8">
      {/* Breadcrumb */}
      <nav className="text-sm opacity-70">
        <Link to="/actuality" className="hover:underline">
          Actuality
        </Link>
        {category?.name && (
          <>
            <span className="mx-2">/</span>
            <Link to={`/actuality/${category.slug}`} className="hover:underline">
              {category.name}
            </Link>
          </>
        )}
      </nav>

      {/* Title + Save/Like/Edit */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader title={title} />
        <div className="flex items-center gap-3">
                    {/* Save */}
          <SaveButton
            articleId={article.id}
            className="inline-flex h-9 items-center justify-center rounded-full border px-4 text-sm shadow-sm hover:bg-black/5 dark:border-white/10"
          />


          {/* Like */}
          <LikeButton articleId={article.id} />

          {/* Edit (dropdown) */}
          {isAuthor && (
            <div className="relative" ref={editMenuRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={isEditOpen}
                onClick={() => setIsEditOpen((o) => !o)}
                className="inline-flex h-9 items-center justify-center rounded-full border px-4 text-sm shadow-sm hover:bg-black/5 dark:border-white/10"
              >
                Edit
                <svg className="ml-1 h-4 w-4 opacity-70" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {isEditOpen && (
                <div
                  role="menu"
                  aria-label="Edit menu"
                  className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-2xl border bg-white shadow-lg ring-1 ring-black/5 dark:border-white/10 dark:bg-neutral-950"
                >
                  <Link
                    to={`/actuality/article/${article.slug}/edit`}
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={() => setIsEditOpen(false)}
                  >
                    Edit article
                  </Link>

                  <button
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={() => {
                      navigator.clipboard?.writeText(window.location.href).catch(() => {});
                      setIsEditOpen(false);
                    }}
                  >
                    Copy link
                  </button>

                  <div className="my-1 h-px bg-black/5 dark:bg-white/10" />

                  <button
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                    onClick={async () => {
                      setIsEditOpen(false);
                      if (!confirm('Delete this article?')) return;
                      await fetch(`${API_BASE}/api/articles/${article.id}`, { method: 'DELETE', credentials: 'include' });
                      window.location.href = '/actuality';
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Meta */}
      <div className="text-sm opacity-70">
        {category?.name ?? '—'} • {new Date(publishedAt).toLocaleDateString()} •{' '}
        {author?.name ?? author?.email ?? 'Demo User'}
        {typeof viewsAll === 'number' && <> • {Intl.NumberFormat().format(viewsAll)} views</>}
      </div>

      {/* Illustration */}
      {imageUrl && (
        <img
          src={imageUrl}
          alt={title}
          className="mt-2 w-full rounded-2xl border border-black/10 object-cover dark:border-white/10"
          loading="lazy"
          decoding="async"
        />
      )}

                  {/* Content – rendu en texte, sans innerHTML pour éviter tout XSS */}
      <article className="prose max-w-none dark:prose-invert whitespace-pre-line">
        {content ? (
          content
        ) : excerpt ? (
          excerpt
        ) : (
          '—'
        )}
      </article>



      {/* Comments */}
      <CommentsBlock articleId={article.id} />

      {/* Related */}
      {related.length > 0 && (
        <section className="space-y-4">
          <SectionHeader title="Related" />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
// FIN BLOC


// DEBUT BLOC (remplace tout le fichier)
import React from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import SectionHeader from '@/components/SectionHeader';
import { API_BASE } from '@/config/api';
import ReactMarkdown from 'react-markdown';
import { useMe } from '@/contexts/MeContext';
import { useDirtyGuard } from '@/hooks/useDirtyGuard';
import { withCsrf } from '@/lib/csrf';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';

const stripTags = (s: string) => s.replace(/<[^>]*>/g, '');
const forbidHtml = (s: string): boolean => /<|>/.test(s);

const STOCK_IMAGES: Record<string, string[]> = {
  tech: [
    'https://picsum.photos/id/180/1200/675',
    'https://picsum.photos/id/1015/1200/675',
    'https://picsum.photos/id/1044/1200/675',
  ],
  science: [
    'https://picsum.photos/id/1039/1200/675',
    'https://picsum.photos/id/1022/1200/675',
    'https://picsum.photos/id/1056/1200/675',
  ],
  world: [
    'https://picsum.photos/id/1016/1200/675',
    'https://picsum.photos/id/1018/1200/675',
    'https://picsum.photos/id/1031/1200/675',
  ],
  news: [
    'https://picsum.photos/id/1003/1200/675',
    'https://picsum.photos/id/1005/1200/675',
    'https://picsum.photos/id/1006/1200/675',
  ],
};

type ImageMode = 'url' | 'stock' | 'auto';

type Category = { id: string; name: string; slug: string };

type LoadedArticle = {
  id: string;
  slug: string | null;
  title: string;
  summary: string | null;
  content: string | null;
  imageUrl: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  category: { id: string; name: string; slug: string } | null;
  author: { id: string; email: string; name: string | null } | null;
};

export default function EditArticlePage() {
  const { idOrSlug = '' } = useParams();
  const navigate = useNavigate();

  const { me, loading: meLoading } = useMe();
  const { requireAuth } = useAuthPrompt();
  const emailNotVerified = !!me && !me.emailVerifiedAt;

  // UI
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [forbidden, setForbidden] = React.useState(false);

  // article
  const [articleId, setArticleId] = React.useState('');
  const [articleSlug, setArticleSlug] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState('');
  const [summary, setSummary] = React.useState('');
  const [content, setContent] = React.useState('');
  const [status, setStatus] = React.useState<'DRAFT' | 'PUBLISHED' | 'ARCHIVED'>('DRAFT');
  const [authorId, setAuthorId] = React.useState<string | null>(null);

  // image
  const [imageMode, setImageMode] = React.useState<ImageMode>('auto');
  const [imageUrl, setImageUrl] = React.useState('');
  const [pickedStock, setPickedStock] = React.useState<string | null>(null);

  // catégories
  const [cats, setCats] = React.useState<Category[]>([]);
  const [categoryId, setCategoryId] = React.useState<string | ''>('');

  // panneau IA
  const [ask, setAsk] = React.useState('');
  const [askLoading, setAskLoading] = React.useState(false);

  // markdown
  const [preview, setPreview] = React.useState(false);

  // dirty
  const [dirty, setDirty] = React.useState(false);
  const [autoSaving, setAutoSaving] = React.useState(false);
  useDirtyGuard(dirty);

  // pop-up email non vérifié
  React.useEffect(() => {
  if (!meLoading && emailNotVerified) {
    requireAuth({
      message:
        'You need to verify your email address before editing articles. Go to Settings → Account to resend the verification link.',
      redirectTo: '/settings#account',
    });
  }
}, [meLoading, emailNotVerified, requireAuth]);


  // 1. charger les catégories
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/categories`);
        const j = await r.json();
        if (!alive) return;
        const list: Category[] = Array.isArray(j.items)
          ? j.items.map((c: any) => ({ id: c.id, name: c.name, slug: c.slug }))
          : [];
        setCats(list);
      } catch {
        if (alive) setCats([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 2. charger l’article (slug -> id)
  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // 1) essai par slug
        let res = await fetch(
          `${API_BASE}/api/articles/slug/${encodeURIComponent(idOrSlug)}`,
          { credentials: 'include' },
        );

        // 2) si 404 → essai par id
        if (res.status === 404) {
          res = await fetch(
            `${API_BASE}/api/articles/${encodeURIComponent(idOrSlug)}`,
            { credentials: 'include' },
          );
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const a: LoadedArticle = await res.json();
        if (!alive) return;

        setArticleId(a.id);
        setArticleSlug(a.slug ?? null);
        setTitle(a.title || '');
        setSummary(a.summary ?? '');
        setContent(a.content ?? '');
        setStatus(a.status ?? 'DRAFT');
        setAuthorId(a.author?.id ?? null);
        setCategoryId(a.category?.id ?? '');

        if (a.imageUrl) {
          setImageMode('url');
          setImageUrl(a.imageUrl);
          setPickedStock(null);
        } else {
          setImageMode('auto');
          setImageUrl('');
          setPickedStock(null);
        }

        setDirty(false);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || 'Failed to load article');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [idOrSlug]);

  // 3. vérifier droit d’édition (uniquement si email vérifié)
  React.useEffect(() => {
    if (meLoading) return;
    if (!me || !authorId) {
      setForbidden(false);
      return;
    }
    if (emailNotVerified) {
      // l’écran sera de toute façon bloqué plus bas
      setForbidden(true);
      return;
    }
    setForbidden(me.id !== authorId);
  }, [meLoading, me, authorId, emailNotVerified]);

  // helpers image
  const cat = React.useMemo(
    () => cats.find((c) => c.id === categoryId) || null,
    [cats, categoryId],
  );
  const catKey = (cat?.slug || cat?.name || 'news').toLowerCase();
  const stockList = STOCK_IMAGES[catKey] || STOCK_IMAGES.news;

  const previewSrc =
    imageMode === 'url'
      ? imageUrl.trim() || ''
      : imageMode === 'stock'
      ? pickedStock || ''
      : '';

  // 4. submit principal
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!articleId) return;

    if (!me) {
      requireAuth({
        message: 'You need an account to edit articles.',
        redirectTo: '/settings#account',
      });
      return;
    }

    if (emailNotVerified) {
  requireAuth({
    kind: 'verify_email',
    message:
      'You need to verify your email address before editing articles. Go to Settings → Account to resend the verification link.',
    redirectTo: '/settings#account',
  });
  return;
}


    // 🔒 Anti-XSS
    if (forbidHtml(title) || forbidHtml(summary) || forbidHtml(content)) {
      setError('HTML tags are not allowed.');
      return;
    }

    if (forbidden) return;

    try {
      setLoading(true);
      setError(null);
      setDirty(false);

      let finalImageUrl: string | null = null;
      if (imageMode === 'url' && imageUrl.trim()) finalImageUrl = imageUrl.trim();
      if (imageMode === 'stock' && pickedStock) finalImageUrl = pickedStock;
      if (imageMode === 'auto') finalImageUrl = null;

      const res = await fetch(
        `${API_BASE}/api/articles/${articleId}`,
        await withCsrf({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            summary: summary.trim() || null,
            content: content.trim() || null,
            imageUrl: finalImageUrl,
            categoryId: categoryId || null,
            status,
          }),
        }),
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json(); // { id, slug }

      if (status === 'PUBLISHED') {
        navigate(`/article/${j.slug || j.id}`);
      } else {
        setArticleSlug(j.slug ?? null);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  // 5. delete
  async function handleDelete() {
    if (!articleId) return;
    if (forbidden) return;

    if (!me) {
      requireAuth({
        message: 'You need an account to edit articles.',
        redirectTo: '/settings#account',
      });
      return;
    }
    if (emailNotVerified) {
  requireAuth({
    kind: 'verify_email',
    message:
      'You need to verify your email address before editing articles. Go to Settings → Account to resend the verification link.',
    redirectTo: '/settings#account',
  });
  return;
}


    if (!window.confirm('Delete this article?')) return;
    try {
      setLoading(true);
      const r = await fetch(
        `${API_BASE}/api/articles/${articleId}`,
        await withCsrf({ method: 'DELETE' }),
      );

      if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`);
      navigate('/account/articles');
    } catch (e: any) {
      setError(e?.message || 'Failed to delete');
    } finally {
      setLoading(false);
    }
  }

  // 6. autosave toutes les 10s
  React.useEffect(() => {
    if (!articleId || forbidden || emailNotVerified || !me) return;
    const timer = setInterval(async () => {
      if (!dirty || autoSaving) return;
      try {
        setAutoSaving(true);
        let draftImageUrl: string | null = null;
        if (imageMode === 'url' && imageUrl.trim()) draftImageUrl = imageUrl.trim();
        else if (imageMode === 'stock' && pickedStock) draftImageUrl = pickedStock;
        else draftImageUrl = null;

        await fetch(
          `${API_BASE}/api/articles/${articleId}`,
          await withCsrf({
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: title.trim(),
              summary: summary.trim() || null,
              content: content.trim() || null,
              imageUrl: draftImageUrl,
              categoryId: categoryId || null,
              status: 'DRAFT',
            }),
          }),
        );

        setDirty(false);
      } catch {
        /* silent */
      } finally {
        setAutoSaving(false);
      }
    }, 10_000);

    return () => clearInterval(timer);
  }, [
    articleId,
    forbidden,
    emailNotVerified,
    me,
    dirty,
    autoSaving,
    title,
    summary,
    content,
    imageMode,
    imageUrl,
    pickedStock,
    categoryId,
  ]);

  // 7. Ask Epion (simu)
  async function handleAsk() {
    if (!articleId || forbidden || emailNotVerified || !me) return;
    const prompt = ask.trim();
    if (!prompt) return;
    setAskLoading(true);
    try {
      setContent((c) => `> AI instruction: ${prompt}\n\n${c || ''}`);
      setDirty(true);
      setAsk('');
    } finally {
      setAskLoading(false);
    }
  }

  // 8. rendu : états particuliers
  if (loading && !articleId) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <p className="opacity-70">Loading…</p>
      </main>
    );
  }

  // pas connecté
  if (!me && !meLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 space-y-6">
        <nav className="text-sm opacity-70">
          <Link to="/actuality" className="hover:underline">
            Actuality
          </Link>
          <span className="mx-2">/</span>
          <span>Edit</span>
        </nav>

        <SectionHeader title="Edit article" />

        <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm shadow-sm dark:border-white/10 dark:bg-neutral-950">
          <p className="mb-3">You need an account to edit articles.</p>
          <div className="flex gap-3">
            <Link
              to="/settings#account"
              className="rounded-xl bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
            >
              Sign in / Create account
            </Link>
            <Link
              to={articleSlug ? `/article/${articleSlug}` : '/actuality'}
              className="rounded-xl border px-4 py-2 hover:bg-black/5 dark:border-white/10"
            >
              View article
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // email non vérifié
  if (emailNotVerified) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 space-y-6">
        <nav className="text-sm opacity-70">
          <Link to="/actuality" className="hover:underline">
            Actuality
          </Link>
          <span className="mx-2">/</span>
          <span>Edit</span>
        </nav>

        <SectionHeader title="Edit article" />

        <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm shadow-sm dark:border-white/10 dark:bg-neutral-950">
          <p className="mb-3">
            You need to verify your email address before editing articles.  
            Go to Settings → Account to resend the verification link.
          </p>
          <div className="flex gap-3">
            <Link
              to="/settings#account"
              className="rounded-xl bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
            >
              Go to account
            </Link>
            <Link
              to={articleSlug ? `/article/${articleSlug}` : '/actuality'}
              className="rounded-xl border px-4 py-2 hover:bg-black/5 dark:border-white/10"
            >
              View article
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!loading && forbidden) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 space-y-6">
        <nav className="text-sm opacity-70">
          <Link to="/actuality" className="hover:underline">
            Actuality
          </Link>
          <span className="mx-2">/</span>
          <span>Edit</span>
        </nav>

        <SectionHeader title="Edit article" />

        <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm shadow-sm dark:border-white/10 dark:bg-neutral-950">
          <p className="mb-3">You are not allowed to edit this article.</p>
          <div className="flex gap-3">
            <Link
              to={articleSlug ? `/article/${articleSlug}` : '/actuality'}
              className="rounded-xl bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
            >
              View article
            </Link>
            <Link
              to="/account/articles"
              className="rounded-xl border px-4 py-2 hover:bg-black/5 dark:border-white/10"
            >
              Back to my articles
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 space-y-8">
      {/* breadcrumb */}
      <nav className="text-sm opacity-70">
        <Link to="/actuality" className="hover:underline">
          Actuality
        </Link>
        <span className="mx-2">/</span>
        <span>Edit</span>
      </nav>

      <SectionHeader title="Edit article" />

      {/* top bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-black/5 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-neutral-950/40">
        <div className="text-sm opacity-70">
          {dirty
            ? 'Unsaved changes'
            : autoSaving
            ? 'Saving draft…'
            : 'Up to date'}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {articleSlug && (
            <Link
              to={`/article/${articleSlug}`}
              className="inline-flex h-9 items-center justify-center rounded-full border px-4 text-sm hover:bg-black/5 dark:border-white/10"
            >
              View article
            </Link>
          )}

          <button
            type="button"
            onClick={() => {
              setStatus('DRAFT');
              document.getElementById('edit-article-form')?.dispatchEvent(
                new Event('submit', { cancelable: true, bubbles: true }),
              );
            }}
            disabled={loading || !title.trim() || forbidden}
            className="h-9 rounded-full border px-4 text-sm hover:bg-black/5 disabled:opacity-60 dark:border-white/10"
          >
            Save draft
          </button>

          <button
            type="button"
            onClick={() => {
              setStatus('PUBLISHED');
              document.getElementById('edit-article-form')?.dispatchEvent(
                new Event('submit', { cancelable: true, bubbles: true }),
              );
            }}
            disabled={loading || !title.trim() || forbidden}
            className="h-9 rounded-full bg-black px-4 text-sm text-white disabled:opacity-60 dark:bg:white dark:text-black"
          >
            {status === 'PUBLISHED' ? 'Publish this version' : 'Publish'}
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={loading || forbidden}
            className="h-9 rounded-full border border-red-400 px-4 text-sm text-red-600 hover:bg-red-50 dark:border-red-500/50 dark:text-red-300 dark:hover:bg-red-900/10"
          >
            Delete
          </button>
        </div>
      </div>

      {/* erreurs */}
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/40 dark:bg-red-950/40">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_360px]">
        {/* gauche */}
        <div className="space-y-6">
          <form id="edit-article-form" onSubmit={handleSubmit} className="space-y-6">
            {/* bloc contenu */}
            <div className="rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-neutral-950/40">
              <label className="mb-1 block text-sm opacity-70">Title *</label>
              <input
                value={title}
                readOnly
                aria-readonly="true"
                className="form-input bg-neutral-100/60 dark:bg-neutral-900/60 cursor-not-allowed"
                title="This field is controlled by Epion. Use “Ask Epion to edit”."
              />
              <p className="mt-1 text-xs opacity-70">
                This field is controlled by Epion. Use “Ask Epion to edit” to change the title.
              </p>

              <label className="mb-1 mt-4 block text-sm opacity-70">Summary</label>
              <textarea
                value={summary}
                readOnly
                aria-readonly="true"
                rows={3}
                className="form-textarea bg-neutral-100/60 dark:bg-neutral-900/60 cursor-not-allowed"
                title="This field is controlled by Epion. Use “Ask Epion to edit”."
              />
              <p className="mt-1 text-xs opacity-70">
                This field is controlled by Epion. Ask Epion to rewrite it.
              </p>

              <div className="mt-4 flex items-center gap-2">
                <span className="text-sm opacity-70">Content</span>
                <button
                  type="button"
                  onClick={() => setPreview(false)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    !preview
                      ? 'bg-neutral-200 text-black dark:bg-neutral-800 dark:text-white'
                      : 'bg-neutral-100 text-black dark:bg-neutral-900'
                  }`}
                  title="This content can only be changed via “Ask Epion to edit”."
                >
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => setPreview(true)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    preview
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'bg-black/5 dark:bg-white/10'
                  }`}
                >
                  Preview
                </button>
              </div>

              {!preview ? (
                <textarea
                  value={content}
                  readOnly
                  aria-readonly="true"
                  rows={10}
                  className="form-textarea font-mono bg-neutral-100/60 dark:bg-neutral-900/60 cursor-not-allowed"
                  title="This field is controlled by Epion. Use “Ask Epion to edit”."
                />
              ) : (
                <div className="prose mt-2 max-w-none rounded-xl border border-black/10 p-4 dark:border-white/10 dark:prose-invert">
                  <ReactMarkdown>{content || '*Nothing to preview…*'}</ReactMarkdown>
                </div>
              )}

              <p className="mt-1 text-xs opacity-70">
                This field is controlled by Epion. Ask Epion to modify or regenerate it.
              </p>
            </div>

            {/* bloc metadata */}
            <div className="rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-neutral-950/40">
              <h2 className="text-sm font-semibold tracking-tight">Metadata</h2>

              <label className="mt-4 mb-1 block text-sm opacity-70">Status</label>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as any);
                  setDirty(true);
                }}
                className="form-select"
                disabled={forbidden}
              >
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </select>

              <label className="mt-4 mb-1 block text-sm opacity-70">Category</label>
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setDirty(true);
                }}
                className="form-select"
                disabled={forbidden}
              >
                <option value="">— None —</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <label className="mt-4 mb-2 block text-sm font-medium">Cover image</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setImageMode('url')}
                  disabled={forbidden}
                  className={`rounded-full border px-3 py-1 text-sm dark:border-white/10 ${
                    imageMode === 'url'
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : ''
                  } ${forbidden ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  Paste URL
                </button>
                <button
                  type="button"
                  onClick={() => setImageMode('stock')}
                  disabled={forbidden}
                  className={`rounded-full border px-3 py-1 text-sm dark:border-white/10 ${
                    imageMode === 'stock'
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : ''
                  } ${forbidden ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  Pick from library
                </button>
                <button
                  type="button"
                  onClick={() => setImageMode('auto')}
                  disabled={forbidden}
                  className={`rounded-full border px-3 py-1 text-sm dark:border-white/10 ${
                    imageMode === 'auto'
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : ''
                  } ${forbidden ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  Auto
                </button>
              </div>

              {imageMode === 'url' && (
                <input
                  value={imageUrl}
                  onChange={(e) => {
                    setImageUrl(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="https://your-cdn.com/cover.jpg"
                  className="mt-2 form-input"
                  disabled={forbidden}
                />
              )}

              {imageMode === 'stock' && (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {stockList.map((src) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => {
                        setPickedStock(src);
                        setDirty(true);
                      }}
                      disabled={forbidden}
                      className={`relative overflow-hidden rounded-xl border dark:border-white/10 ${
                        pickedStock === src ? 'ring-2 ring-[#4290D3]' : ''
                      } ${forbidden ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <img src={src} alt="Stock" className="h-24 w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {previewSrc && (
                <div className="mt-3 overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
                  <img src={previewSrc} alt="Preview" className="h-40 w-full object-cover" />
                </div>
              )}

              <div className="mt-4">
                <button
                  type="submit"
                  className="rounded-xl bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
                  disabled={loading || forbidden}
                >
                  Save metadata
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* droite */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-neutral-950/40">
            <h3 className="text-sm font-semibold">Ask Epion to edit</h3>
            <p className="mt-1 text-xs opacity-70">
              Exemples : “raccourcis le titre”, “passe le ton en explicatif”, “ajoute un paragraphe à la fin”.
            </p>
            <textarea
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded-xl border border-black/10 bg-white/0 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4290D3] dark:border-white/10 dark:bg-neutral-950"
              placeholder="Tell Epion what to change…"
              disabled={forbidden}
            />
            <button
              type="button"
              onClick={handleAsk}
              disabled={askLoading || !ask.trim() || forbidden}
              className="mt-3 h-9 rounded-full bg-neutral-900 px-4 text-sm text-white disabled:opacity-60 dark:bg-white dark:text-black"
            >
              {askLoading ? 'Applying…' : 'Apply change'}
            </button>
          </div>

          {articleSlug && (
            <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm dark:border-white/10 dark:bg-neutral-950/40">
              <Link
                to={`/article/${articleSlug}`}
                className="inline-flex h-9 items-center justify-center rounded-full border px-4 text-sm hover:bg-black/5 dark:border-white/10"
              >
                View article
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
// FIN BLOC

// DEBUT BLOC (remplace tout le fichier)
import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import SectionHeader from '@/components/SectionHeader';
import { API_BASE } from '@/config/api';
import { useMe } from '@/contexts/MeContext';
import { withCsrf } from '@/lib/csrf';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';

// Anti-XSS rapide
const stripTags = (s: string) => s.replace(/<[^>]*>/g, '');

// Empêche HTML dans les champs
const forbidHtml = (s: string): boolean => /<|>/.test(s);

const MAX_PROMPT_CHARS = 2000;

// bibliothèque d’images de secours
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

type ImageMode = 'auto' | 'url' | 'stock';
type Category = { id: string; name: string; slug: string };

export default function CreateArticlePage() {
  const navigate = useNavigate();
  const { me, loading: meLoading } = useMe();
  const { requireAuth } = useAuthPrompt();

  // 1) ce que l’utilisateur veut que l’IA écrive
  const [prompt, setPrompt] = React.useState('');
  const [tone, setTone] = React.useState<'neutral' | 'explainer' | 'short' | 'long'>('neutral');
  const [language, setLanguage] = React.useState<'fr' | 'en'>('fr');

  // 2) métadonnées
  const [cats, setCats] = React.useState<Category[]>([]);
  const [categoryId, setCategoryId] = React.useState<string | ''>('');

  // 3) image
  const [imageMode, setImageMode] = React.useState<ImageMode>('auto');
  const [imageUrl, setImageUrl] = React.useState('');
  const [pickedStock, setPickedStock] = React.useState<string | null>(null);

  // ui
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const emailNotVerified = !!me && !me.emailVerifiedAt;

  // charger catégories
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/categories`);
        if (!r.ok) throw new Error();
        const j = await r.json();
        const list: Category[] = (j.items || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
        }));
        if (alive) setCats(list);
      } catch {
        if (alive) setCats([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

 React.useEffect(() => {
  if (!meLoading && emailNotVerified) {
    requireAuth({
      kind: 'verify_email',
      message:
        'You need to verify your email address before creating articles. Go to Settings → Account to resend the verification link.',
      redirectTo: '/settings#account',
    });
  }
}, [meLoading, emailNotVerified, requireAuth]);


  // image de la catégorie
  const cat = React.useMemo(
    () => cats.find((c) => c.id === categoryId) || null,
    [cats, categoryId],
  );
  const catKey = (cat?.slug || cat?.name || 'news').toLowerCase();
  const stockList = STOCK_IMAGES[catKey] || STOCK_IMAGES.news;

  const previewSrc =
    imageMode === 'url'
      ? imageUrl.trim()
      : imageMode === 'stock'
      ? pickedStock || ''
      : '';

  const promptTooLong = prompt.length > MAX_PROMPT_CHARS;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!me) {
      requireAuth({
        message: 'You need an account to create articles.',
        redirectTo: '/settings#account',
      });
      return;
    }

    if (emailNotVerified) {
  requireAuth({
    kind: 'verify_email',
    message:
      'You need to verify your email address before creating articles. Go to Settings → Account to resend the verification link.',
    redirectTo: '/settings#account',
  });
  return;
}


    if (!prompt.trim()) return;

    // 🔒 XSS
    if (forbidHtml(prompt)) {
      setError('HTML tags are not allowed in the prompt.');
      return;
    }

    if (promptTooLong) {
      setError(`Le prompt est trop long (${prompt.length} / ${MAX_PROMPT_CHARS} caractères).`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // on ne publie PAS → on crée un DRAFT
      let finalImageUrl: string | null = null;
      if (imageMode === 'url' && imageUrl.trim()) finalImageUrl = imageUrl.trim();
      if (imageMode === 'stock' && pickedStock) finalImageUrl = pickedStock;
      // auto → null

      // on stocke le prompt + les préférences dans le contenu
      const payload = {
        title: 'Draft (to generate)',
        summary: `Prompt: ${prompt.trim()}`,
        content: [
          `## Generation request`,
          `language: ${language}`,
          `tone: ${tone}`,
          '',
          prompt.trim(),
        ].join('\n'),
        imageUrl: finalImageUrl,
        status: 'DRAFT',
        categoryId: categoryId || undefined,
      };

      const res = await fetch(
        `${API_BASE}/api/articles`,
        await withCsrf({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      );

      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || `HTTP ${res.status}`);
      }

      const json = await res.json(); // { id, slug }
      const id = json.id as string;
      navigate(`/account/articles/${id}/edit`);
    } catch (err: any) {
      setError(err?.message || 'Unable to create draft');
    } finally {
      setSubmitting(false);
    }
  }

  // garde pour invités
  if (meLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <p className="opacity-70 text-sm">Loading…</p>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 space-y-6">
        <nav className="text-sm opacity-70">
          <Link to="/actuality" className="hover:underline">
            Actuality
          </Link>
          <span className="mx-2">/</span>
          <span>Create</span>
        </nav>

        <SectionHeader title="Create an article (AI-first)" />

        <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm shadow-sm dark:border-white/10 dark:bg-neutral-950">
          <p className="mb-3">You need an account to create articles with Epion.</p>
          <div className="flex gap-3">
            <Link
              to="/settings#account"
              className="rounded-xl bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
            >
              Sign in / Create account
            </Link>
            <Link
              to="/actuality"
              className="rounded-xl border px-4 py-2 hover:bg-black/5 dark:border-white/10"
            >
              Back to Actuality
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (emailNotVerified) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 space-y-6">
        <nav className="text-sm opacity-70">
          <Link to="/actuality" className="hover:underline">
            Actuality
          </Link>
          <span className="mx-2">/</span>
          <span>Create</span>
        </nav>

        <SectionHeader title="Create an article (AI-first)" />

        <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm shadow-sm dark:border-white/10 dark:bg-neutral-950">
          <p className="mb-3">
            You need to verify your email address before creating articles.  
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
              to="/actuality"
              className="rounded-xl border px-4 py-2 hover:bg-black/5 dark:border-white/10"
            >
              Back to Actuality
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 space-y-8">
      <nav className="text-sm opacity-70">
        <Link to="/actuality" className="hover:underline">
          Actuality
        </Link>
        <span className="mx-2">/</span>
        <span>Create</span>
      </nav>

      <SectionHeader title="Create an article (AI-first)" />

      <form onSubmit={onSubmit} className="space-y-5">
        {error && (
          <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/40 dark:bg-red-950/40">
            {error}
          </div>
        )}

        {/* 1. prompt */}
        <div>
          <label className="mb-1 block text-sm opacity-70">
            What should Epion write? *
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            required
            placeholder="Ex: Fais-moi un article de 600 mots sur l’arrivée de la norme Euro 7 pour le grand public. Ajoute une section ‘Pourquoi ça compte ?’ et une ‘Ce qu’il faut surveiller’."
            className="form-textarea"
          />
          <div className="mt-1 flex items-center justify-between text-xs">
            <p className="opacity-60">
              Décris le résultat attendu. Tu pourras affiner sur l’écran suivant.
            </p>
            <p className={promptTooLong ? 'text-red-600 dark:text-red-400' : 'opacity-60'}>
              {prompt.length} / {MAX_PROMPT_CHARS}
            </p>
          </div>
        </div>

        {/* 2. réglages IA rapides */}
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="mb-1 block text-sm opacity-70">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as any)}
              className="form-select"
            >
              <option value="fr">French</option>
              <option value="en">English</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm opacity-70">Style</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as any)}
              className="form-select"
            >
              <option value="neutral">Neutral / reporter</option>
              <option value="explainer">Explainer / pédagogique</option>
              <option value="short">Short update</option>
              <option value="long">In-depth</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm opacity-70">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="form-select"
            >
              <option value="">— None —</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 3. options avancées (image) */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="text-sm underline-offset-2 hover:underline"
          >
            {showAdvanced ? 'Hide advanced options' : 'Show advanced options'}
          </button>
        </div>

        {showAdvanced && (
          <div className="space-y-3 rounded-2xl border border-black/10 p-4 dark:border-white/10">
            <label className="block text-sm font-medium">Cover image</label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setImageMode('auto')}
                className={`rounded-full border px-3 py-1 text-sm dark:border-white/10 ${
                  imageMode === 'auto'
                    ? 'bg-black text-white dark:bg-white dark:text-black'
                    : ''
                }`}
              >
                Auto
              </button>
              <button
                type="button"
                onClick={() => setImageMode('url')}
                className={`rounded-full border px-3 py-1 text-sm dark:border-white/10 ${
                  imageMode === 'url'
                    ? 'bg-black text-white dark:bg-white dark:text-black'
                    : ''
                }`}
              >
                Paste URL
              </button>
              <button
                type="button"
                onClick={() => setImageMode('stock')}
                className={`rounded-full border px-3 py-1 text-sm dark:border-white/10 ${
                  imageMode === 'stock'
                    ? 'bg-black text-white dark:bg:white dark:text-black'
                    : ''
                }`}
              >
                Pick from library
              </button>
            </div>

            {imageMode === 'url' && (
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://your-cdn.com/cover.jpg"
                className="form-input"
              />
            )}

            {imageMode === 'stock' && (
              <div className="grid grid-cols-3 gap-3">
                {stockList.map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setPickedStock(src)}
                    className={`relative overflow-hidden rounded-xl border dark:border-white/10 ${
                      pickedStock === src ? 'ring-2 ring-[#4290D3]' : ''
                    }`}
                  >
                    <img
                      src={src}
                      alt="Stock"
                      className="h-24 w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            {previewSrc && (
              <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
                <img src={previewSrc} alt="Preview" className="h-40 w-full object-cover" />
              </div>
            )}
          </div>
        )}

        {/* actions */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting || !prompt.trim() || promptTooLong}
            className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60 dark:bg-white dark:text-black"
          >
            {submitting ? 'Creating draft…' : 'Generate with AI'}
          </button>
          <Link
            to="/actuality"
            className="rounded-xl border px-4 py-2 text-sm hover:bg-black/5 dark:border-white/10"
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
// FIN BLOC

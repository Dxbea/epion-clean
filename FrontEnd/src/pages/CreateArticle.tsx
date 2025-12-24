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

import { STOCK_IMAGES } from '../lib/stockImages';
import EpionSelect from '@/components/ui/EpionSelect';

const MAX_PROMPT_CHARS = 2000;

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
        generationPrompt: prompt.trim(),
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <EpionSelect
            label="Language"
            value={language}
            onChange={(v) => setLanguage(v as any)}
            options={[
              { value: 'fr', label: 'French' },
              { value: 'en', label: 'English' },
            ]}
          />

          <EpionSelect
            label="Style"
            value={tone}
            onChange={(v) => setTone(v as any)}
            options={[
              { value: 'neutral', label: 'Neutral / reporter' },
              { value: 'explainer', label: 'Explainer / pédagogique' },
              { value: 'short', label: 'Short update' },
              { value: 'long', label: 'In-depth' },
            ]}
          />

          <EpionSelect
            label="Category"
            value={categoryId}
            onChange={(v) => setCategoryId(v)}
            placeholder="Select..."
            options={[
              { value: '', label: '— None —' },
              ...cats.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>

        {/* 3. options avancées (image) */}
        <div className="space-y-3 rounded-2xl border border-black/10 p-5 dark:border-white/10">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Cover image</label>
            {/* Segmented Control pour les modes */}
            <div className="flex rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
              {(['auto', 'url', 'stock'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setImageMode(m)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${imageMode === m
                    ? 'bg-white text-black shadow-sm dark:bg-neutral-600 dark:text-white'
                    : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                    }`}
                >
                  {m === 'auto' ? 'Auto' : m === 'url' ? 'URL' : 'Library'}
                </button>
              ))}
            </div>
          </div>

          {imageMode === 'url' && (
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              className="form-input w-full rounded-xl bg-transparent"
            />
          )}

          {imageMode === 'stock' && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stockList.map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setPickedStock(src)}
                  className={`group relative aspect-video overflow-hidden rounded-xl border-2 transition-all ${pickedStock === src
                    ? 'border-black ring-2 ring-black/20 dark:border-white dark:ring-white/20'
                    : 'border-transparent hover:border-black/10 dark:hover:border-white/10'
                    }`}
                >
                  <img
                    src={src}
                    alt="Stock"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  {pickedStock === src && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                      <div className="rounded-full bg-white p-1 text-black shadow-sm">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M5 13l4 4L19 7" /></svg>
                      </div>
                    </div>
                  )}
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

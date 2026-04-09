import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import SectionHeader from '@/components/SectionHeader';
import { API_BASE } from '@/config/api';
import { useMe } from '@/contexts/MeContext';
import { withCsrf } from '@/lib/csrf';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { generateArticleWithAI } from '@/api/articles';

// Anti-XSS rapide
const stripTags = (s: string) => s.replace(/<[^>]*>/g, '');

// Empêche HTML dans les champs
const forbidHtml = (s: string): boolean => /<|>/.test(s);

import EpionSelect from '@/components/ui/EpionSelect';

const MAX_PROMPT_CHARS = 2000;


type Category = { id: string; name: string; slug: string };

export default function CreateArticlePage() {
  const navigate = useNavigate();
  const { me, loading: meLoading } = useMe();
  const { requireAuth } = useAuthPrompt();

  // 1) ce que l’utilisateur veut que l’IA écrive
  const [prompt, setPrompt] = React.useState('');
  const [tone, setTone] = React.useState<'neutral' | 'explainer' | 'short' | 'indepth'>('neutral');
  const [language, setLanguage] = React.useState<'fr' | 'en'>('fr');

  // 2) métadonnées
  const [cats, setCats] = React.useState<Category[]>([]);
  const [categoryId, setCategoryId] = React.useState<string | ''>('');

  // ui
  const [isGenerating, setIsGenerating] = React.useState(false);
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


  const promptTooLong = prompt.length > MAX_PROMPT_CHARS;

  // Find selected category for the prompt context
  const cat = React.useMemo(
    () => cats.find((c) => c.id === categoryId) || null,
    [cats, categoryId],
  );

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

    setIsGenerating(true);
    setError(null);

    try {
      // Appel IA
      const result = await generateArticleWithAI({
        topic: prompt.trim(),
        language,
        style: tone,
        categoryId, // ⬅️ ID officiel pour la liaison BDD
        categoryName: cat ? cat.name : '', // ⬅️ Nom pour le prompt context IA
        generateImage: true
      });

      // Redirection vers l'édition
      // L'API renvoie { article: { id: ... }, message: ... }
      if (result.article && result.article.id) {
        navigate(`/account/articles/${result.article.id}/edit`);
      } else {
        throw new Error("Invalid response from server");
      }

    } catch (err: any) {
      setError(err?.message || 'Unable to generate article');
    } finally {
      setIsGenerating(false);
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
          <Link to="/news" className="hover:underline">
            news
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
              to="/news"
              className="rounded-xl border px-4 py-2 hover:bg-black/5 dark:border-white/10"
            >
              Back to news
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
          <Link to="/news" className="hover:underline">
            news
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
              to="/news"
              className="rounded-xl border px-4 py-2 hover:bg-black/5 dark:border-white/10"
            >
              Back to news
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 space-y-8">
      <nav className="text-sm opacity-70">
        <Link to="/news" className="hover:underline">
          news
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
              { value: 'short', label: 'Short / Brève' },
              { value: 'indepth', label: 'In-depth' },
            ]}
          />

          <EpionSelect
            label="Category *"
            value={categoryId}
            onChange={(v) => setCategoryId(v)}
            placeholder="Select..."
            options={[
              { value: '', label: '— None —' },
              ...cats.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>



        {/* actions */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isGenerating || !prompt.trim() || promptTooLong || !categoryId}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-white transition-all
              ${isGenerating || !prompt.trim() || promptTooLong || !categoryId
                ? 'bg-neutral-400 cursor-not-allowed opacity-60'
                : 'bg-black hover:opacity-90 dark:bg-white dark:text-black'
              }`}
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white dark:text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </>
            ) : (
              'Generate with AI'
            )}
          </button>
          <Link
            to="/news"
            className="rounded-xl border px-4 py-2 text-sm hover:bg-black/5 dark:border-white/10"
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}

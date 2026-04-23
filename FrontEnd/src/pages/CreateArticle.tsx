import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { generateArticleWithAI } from '@/api/articles';
import SectionHeader from '@/components/SectionHeader';
import EpionSelect from '@/components/ui/EpionSelect';
import { Button } from '@/components/ui';
import { API_BASE } from '@/config/api';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { useMe } from '@/contexts/MeContext';

const MAX_PROMPT_CHARS = 2000;

type Category = { id: string; name: string; slug: string };

const forbidHtml = (value: string): boolean => /<|>/.test(value);

export default function CreateArticlePage() {
  const navigate = useNavigate();
  const { me, loading: meLoading } = useMe();
  const { requireAuth } = useAuthPrompt();

  const [prompt, setPrompt] = React.useState('');
  const [tone, setTone] = React.useState<'neutral' | 'explainer' | 'short' | 'indepth'>('neutral');
  const [language, setLanguage] = React.useState<'fr' | 'en'>('fr');
  const [cats, setCats] = React.useState<Category[]>([]);
  const [categoryId, setCategoryId] = React.useState<string | ''>('');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const emailNotVerified = !!me && !me.emailVerifiedAt;
  const promptTooLong = prompt.length > MAX_PROMPT_CHARS;

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/categories`);
        if (!response.ok) throw new Error();
        const json = await response.json();
        const list: Category[] = (json.items || []).map((category: any) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
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
        message: 'You need to verify your email address before creating articles. Go to Settings -> Account to resend the verification link.',
        redirectTo: '/settings#account',
      });
    }
  }, [emailNotVerified, meLoading, requireAuth]);

  const selectedCategory = React.useMemo(
    () => cats.find((category) => category.id === categoryId) || null,
    [cats, categoryId]
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();

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
        message: 'You need to verify your email address before creating articles. Go to Settings -> Account to resend the verification link.',
        redirectTo: '/settings#account',
      });
      return;
    }

    if (!prompt.trim()) return;

    if (forbidHtml(prompt)) {
      setError('HTML tags are not allowed in the prompt.');
      return;
    }

    if (promptTooLong) {
      setError(`Le prompt est trop long (${prompt.length} / ${MAX_PROMPT_CHARS} caracteres).`);
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateArticleWithAI({
        topic: prompt.trim(),
        language,
        style: tone,
        categoryId,
        categoryName: selectedCategory ? selectedCategory.name : '',
        generateImage: true,
      });

      if (result.article && result.article.id) {
        navigate(`/account/articles/${result.article.id}/edit`);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to generate article');
    } finally {
      setIsGenerating(false);
    }
  }

  if (meLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-sm opacity-70">Loading...</p>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <nav className="text-sm opacity-70">
          <Link to="/news" className="hover:underline">
            news
          </Link>
          <span className="mx-2">/</span>
          <span>Create</span>
        </nav>

        <SectionHeader title="Create an article (AI-first)" className="mt-4" />

        <div className="mt-6 rounded-3xl border border-black/10 bg-[var(--bg)] p-5 text-sm shadow-soft dark:border-white/10 sm:p-6">
          <p className="mb-3">You need an account to create articles with Epion.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button as={Link} to="/settings#account" variant="primary" size="auto" className="min-h-[44px] rounded-full px-5 py-2.5">
              Sign in / Create account
            </Button>
            <Button as={Link} to="/news" variant="ghost" size="auto" className="min-h-[44px] rounded-full px-5 py-2.5">
              Back to news
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (emailNotVerified) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <nav className="text-sm opacity-70">
          <Link to="/news" className="hover:underline">
            news
          </Link>
          <span className="mx-2">/</span>
          <span>Create</span>
        </nav>

        <SectionHeader title="Create an article (AI-first)" className="mt-4" />

        <div className="mt-6 rounded-3xl border border-black/10 bg-[var(--bg)] p-5 text-sm shadow-soft dark:border-white/10 sm:p-6">
          <p className="mb-3">
            You need to verify your email address before creating articles. Go to Settings / Account to resend the verification link.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button as={Link} to="/settings#account" variant="primary" size="auto" className="min-h-[44px] rounded-full px-5 py-2.5">
              Go to account
            </Button>
            <Button as={Link} to="/news" variant="ghost" size="auto" className="min-h-[44px] rounded-full px-5 py-2.5">
              Back to news
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <nav className="text-sm opacity-70">
        <Link to="/news" className="hover:underline">
          news
        </Link>
        <span className="mx-2">/</span>
        <span>Create</span>
      </nav>

      <SectionHeader title="Create an article (AI-first)" className="mt-4" />

      <form onSubmit={onSubmit} className="mt-8 space-y-6">
        {error ? (
          <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/40 dark:bg-red-950/40">
            {error}
          </div>
        ) : null}

        <div>
          <label className="mb-1 block text-sm opacity-70">What should Epion write? *</label>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={5}
            required
            placeholder="Ex: Fais-moi un article de 600 mots sur l'arrivee de la norme Euro 7 pour le grand public. Ajoute une section 'Pourquoi ca compte ?' et une 'Ce qu'il faut surveiller'."
            className="form-textarea"
          />
          <div className="mt-1 flex items-center justify-between text-xs">
            <p className="opacity-60">
              Decris le resultat attendu. Tu pourras affiner sur l'ecran suivant.
            </p>
            <p className={promptTooLong ? 'text-red-600 dark:text-red-400' : 'opacity-60'}>
              {prompt.length} / {MAX_PROMPT_CHARS}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <EpionSelect
            label="Language"
            value={language}
            onChange={(value) => setLanguage(value as any)}
            options={[
              { value: 'fr', label: 'French' },
              { value: 'en', label: 'English' },
            ]}
          />

          <EpionSelect
            label="Style"
            value={tone}
            onChange={(value) => setTone(value as any)}
            options={[
              { value: 'neutral', label: 'Neutral / reporter' },
              { value: 'explainer', label: 'Explainer / pedagogique' },
              { value: 'short', label: 'Short / breve' },
              { value: 'indepth', label: 'In-depth' },
            ]}
          />

          <EpionSelect
            label="Category *"
            value={categoryId}
            onChange={(value) => setCategoryId(value)}
            placeholder="Select..."
            options={[
              { value: '', label: '-- None --' },
              ...cats.map((category) => ({ value: category.id, label: category.name })),
            ]}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="submit"
            variant="primary"
            size="auto"
            disabled={isGenerating || !prompt.trim() || promptTooLong || !categoryId}
            className="min-h-[48px] justify-center rounded-full px-6 py-3 text-sm sm:min-w-[12rem]"
          >
            {isGenerating ? (
              <>
                <svg className="-ml-1 mr-2 h-4 w-4 animate-spin text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating...
              </>
            ) : (
              'Generate with AI'
            )}
          </Button>

          <Button as={Link} to="/news" variant="ghost" size="auto" className="min-h-[44px] rounded-full px-5 py-2.5 text-sm">
            Cancel
          </Button>
        </div>
      </form>
    </main>
  );
}

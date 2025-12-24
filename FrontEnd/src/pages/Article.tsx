import React from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import SectionHeader from '@/components/SectionHeader';
import ArticleCard from '@/components/articles/ArticleCard';
import ArticleThumbnail from '@/components/articles/ArticleThumbnail';
import { API_BASE } from '@/config/api';
import SaveButton from '@/components/ui/SaveButton';
import { useMe } from '@/contexts/MeContext';
import LikeButton from '@/components/ui/LikeButton';
import CommentsDrawer from '@/components/articles/CommentsDrawer';
import ArticleToolbar from '@/components/articles/ArticleToolbar';
// import FactCheckCard from '@/components/articles/FactCheckCard'; // Deprecated
import VerificationBlock from '../components/chat/VerificationBlock';
import SummaryModal from '@/components/articles/SummaryModal';
import PromptTransparencyModal from '@/components/articles/PromptTransparencyModal';
import { useComments } from '@/hooks/useComments';
import Modal from '@/components/ui/Modal';
import SourceCard from '../components/chat/SourceCard';
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
  aiSummary: string | null;
  factCheckScore: number | null;
  factCheckData: any | null;
  generationPrompt: string | null;
};

export default function Article() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { me } = useMe();

  const [article, setArticle] = React.useState<LoadedArticle | null>(null);
  const [related, setRelated] = React.useState<CardArticle[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [viewsAll, setViewsAll] = React.useState<number | null>(null);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const editMenuRef = React.useRef<HTMLDivElement | null>(null);

  // AI Features State
  const [showSummary, setShowSummary] = React.useState(false);
  const [summaryText, setSummaryText] = React.useState('');
  const [summaryLoading, setSummaryLoading] = React.useState(false);
  const [showFactCheck, setShowFactCheck] = React.useState(false);
  const [showPrompt, setShowPrompt] = React.useState(false);
  const [isHighlighting, setIsHighlighting] = React.useState(false);
  const [activeModal, setActiveModal] = React.useState<'sources' | 'reliability' | null>(null);
  const [focusedSourceId, setFocusedSourceId] = React.useState<number | null>(null);
  const [factCheckResult, setFactCheckResult] = React.useState<any | null>(null);
  const [factCheckLoading, setFactCheckLoading] = React.useState(false);

  // Initialize state from article when loaded
  React.useEffect(() => {
    if (article) {
      if (article.aiSummary) setSummaryText(article.aiSummary);
      if (article.factCheckData) setFactCheckResult(article.factCheckData);
    }
  }, [article]);

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
          aiSummary: data.aiSummary ?? null,
          factCheckScore: data.factCheckScore ?? null,
          factCheckData: data.factCheckData ?? null,
          generationPrompt: data.generationPrompt ?? null,
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
    }).catch(() => { });
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
  // Hooks pour commentaires (lifted state)
  // ----------------------------------------
  const commentsApi = useComments(article?.id);
  const [isCommentsOpen, setIsCommentsOpen] = React.useState(false);

  // ----------------------------------------
  // Déterminer si le user est l'auteur
  // ----------------------------------------
  const isAuthor =
    !!(me && article?.author) &&
    (me.id === article.author.id || me.email?.toLowerCase() === article.author.email?.toLowerCase());

  // ----------------------------------------
  // AI Handlers
  // ----------------------------------------
  const handleSummarize = async () => {
    setShowSummary(true);
    if (!summaryText && article?.id) {
      setSummaryLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/ai/summarize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articleId: article.id }),
          credentials: 'include'
        });
        const data = await res.json();
        if (data.summary) {
          setSummaryText(data.summary);
        }
      } catch (err) {
        console.error(err);
        setSummaryText("Failed to generate summary.");
      } finally {
        setSummaryLoading(false);
      }
    }
  };

  const handleFactCheck = async () => {
    setShowFactCheck(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (!factCheckResult && article?.id) {
      setFactCheckLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/ai/fact-check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articleId: article.id }),
          credentials: 'include'
        });
        const data = await res.json();
        if (data.analysis) {
          setFactCheckResult(data.analysis);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setFactCheckLoading(false);
      }
    }
  };

  const handleChat = () => {
    // Troncature intelligente à ~10k caractères pour éviter l'overflow
    const safeContent = (article?.content || '').substring(0, 10000);

    navigate('/chat', {
      state: {
        initialContext: `Contexte : L'utilisateur lit l'article intitulé "${article?.title}".\nContenu : ${safeContent}...`,
        attachedSource: {
          title: article?.title,
          id: article?.id,
          type: 'article'
        }
      }
    });
  };

  const handleShowPrompt = () => {
    setShowPrompt(true);
  };

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


  console.log('FactCheck State:', showFactCheck);

  const factData = factCheckResult;

  // Derive sources from AI data or empty
  const sources = factData?.sources || [];




  return (
    <>
      <main className="mx-auto w-full max-w-4xl px-4 py-10 space-y-8 pb-32">
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
                        navigator.clipboard?.writeText(window.location.href).catch(() => { });
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
        <ArticleThumbnail
          imageUrl={imageUrl}
          category={category?.name}
          title={title}
          className="mt-2 w-full rounded-2xl border border-black/10 object-cover dark:border-white/10 aspect-video"
        />

        {/* Content – rendu en texte, sans innerHTML pour éviter tout XSS */}
        {/* Content – rendu en texte, sans innerHTML pour éviter tout XSS */}
        {showFactCheck && (
          <div className="animate-in slide-in-from-top-4 duration-500 fade-in">
            {factCheckLoading ? (
              <div className="p-4 rounded-2xl border border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5 mb-6 animate-pulse">
                Analyzing article reliability...
              </div>
            ) : factData ? (
              <div className="rounded-2xl border border-black/10 bg-white px-5 py-4 dark:border-white/10 dark:bg-neutral-900 shadow-sm">
                <VerificationBlock
                  score={factData.factScore || 0}
                  sources={factData.sources || []}
                  isHighlighting={isHighlighting}
                  onToggleHighlight={() => setIsHighlighting(!isHighlighting)}
                  onShowSources={() => setActiveModal('sources')}
                  onShowScoreDetails={() => setActiveModal('reliability')}
                />
                <div className="mt-4 whitespace-pre-wrap break-words text-gray-800 dark:text-gray-100 leading-7 text-[15px]">
                  {factData.analysis || "No analysis available."}
                </div>
              </div>
            ) : null}
          </div>
        )}

        <article className="prose max-w-none dark:prose-invert whitespace-pre-line">
          {content ? (
            content
          ) : excerpt ? (
            excerpt
          ) : (
            '—'
          )}
        </article>

        {/* Related */}
        {related.length > 0 && (
          <section className="space-y-4 pt-10 border-t border-black/5 dark:border-white/5">
            <SectionHeader title="Related articles" />
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {related.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Toolbar & Drawer */}
      <ArticleToolbar
        onOpenComments={() => setIsCommentsOpen(true)}
        commentCount={commentsApi.items.length}
        onSummarize={handleSummarize}
        onChat={handleChat}
        onFactCheck={handleFactCheck}
        onShowPrompt={handleShowPrompt}
      />

      <CommentsDrawer
        articleId={article.id}
        isOpen={isCommentsOpen}
        onClose={() => setIsCommentsOpen(false)}
        {...commentsApi}
      />

      <SummaryModal
        isOpen={showSummary}
        onClose={() => setShowSummary(false)}
        summaryText={summaryText}
        loading={summaryLoading}
      />

      <PromptTransparencyModal
        isOpen={showPrompt}
        onClose={() => setShowPrompt(false)}
        promptText={article?.generationPrompt || ''}
      />

      {/* Modal Transparence (Copied from ChatMessage) */}
      <Modal
        isOpen={!!activeModal}
        onClose={() => {
          setActiveModal(null);
          setFocusedSourceId(null);
        }}
        title={activeModal === 'sources' ? "Sources utilisées" : "Détail du Score de Fiabilité"}
        size="large"
      >
        <div className="text-sm text-black/70 dark:text-white/70 h-full">
          {activeModal === 'sources' ? (
            <div className="flex flex-col space-y-3 h-full overflow-y-auto pr-2 pb-4">
              {(factData?.sources || []).map((s: any, index: number) => (
                <div key={s.id || index}>
                  <SourceCard source={s} isFocused={s.id === focusedSourceId} />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6 max-w-2xl mx-auto py-4">
              {/* Score Global */}
              <div className="flex flex-col items-center justify-center p-8 border-b border-gray-100 dark:border-neutral-800 mb-8">
                <div className="font-serif text-2xl font-normal text-gray-900 dark:text-white mb-2">Score de Fiabilité Global</div>
                <div className="font-serif text-6xl text-[#0D9488] dark:text-teal-400">
                  {factData?.factScore || 0}
                  <span className="text-2xl text-gray-400 dark:text-gray-500 align-top ml-1">%</span>
                </div>
              </div>

              {/* Liste des Jauges de Confiance (Design Épuré) */}
              <div className="space-y-6 mt-8">
                {(() => {
                  const safeBreakdown = factData?.scoreBreakdown || [];

                  const getGradientStyle = (score: number) => {
                    let gradient = '';
                    let textColor = '';
                    if (score < 40) { // Zone Rouge (Alerte -> Orange)
                      gradient = 'linear-gradient(90deg, #D16D64 0%, #EF8E38 100%)';
                      textColor = '#D16D64'; // Rouge Alerte
                    } else if (score < 70) { // Zone Jaune (Orange -> Jaune Incertitude)
                      gradient = 'linear-gradient(90deg, #EF8E38 0%, #E2C45E 100%)';
                      textColor = '#E2C45E'; // Jaune Incertitude
                    } else { // Zone Teal (Menthe Douce -> Teal Profond)
                      gradient = 'linear-gradient(90deg, #B0F2BC 0%, #2C98A0 100%)';
                      textColor = '#2C98A0'; // Teal Profond
                    }
                    return { gradient, textColor };
                  };

                  return safeBreakdown.map((item) => {
                    const { gradient, textColor } = getGradientStyle(item.score);
                    return (
                      <div key={item.id} className="border-b border-gray-100 pb-4 last:border-0 dark:border-white/5">
                        {/* Ligne 1 : Label + Score */}
                        <div className="flex justify-between items-end mb-2">
                          <span className="font-serif text-lg text-gray-900 dark:text-white">{item.label}</span>
                          <span className="font-medium" style={{ color: textColor }}>{item.score}/100</span>
                        </div>
                        {/* Ligne 2 : Barre de progression */}
                        <div className="w-full h-2 bg-gray-100 rounded-full mb-2 overflow-hidden dark:bg-white/10">
                          <div
                            className="h-full rounded-full transition-all duration-700 ease-in-out"
                            style={{
                              width: `${item.score}%`,
                              backgroundImage: gradient
                            }}
                          />
                        </div>
                        {/* Ligne 3 : Description */}
                        <p className="text-sm text-gray-400 font-light italic dark:text-gray-500">{item.description}</p>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}


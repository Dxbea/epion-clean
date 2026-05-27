import React from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import SectionHeader from '@/components/SectionHeader';
import ArticleCard from '@/components/articles/ArticleCard';
import ArticleThumbnail from '@/components/articles/ArticleThumbnail';
import { API_BASE } from '@/config/api';
import { useMe } from '@/contexts/MeContext';
import CommentsDrawer from '@/components/articles/CommentsDrawer';
import ArticleActionBar from '@/components/articles/ArticleActionBar';
import TrustHeader from '@/components/shared/TrustHeader';
import { GlobalTrustScoreModal } from '@/components/chat/trust-score-ui/GlobalTrustScoreModal';
import { useComments } from '@/hooks/useComments';
import Modal from '@/components/ui/Modal';
import SourceCard from '../components/chat/SourceCard';
import MarkdownRenderer from '@/components/shared/MarkdownRenderer';
import type { Article as CardArticle } from '@/types/article';
import { normalizeSourceForUi, parsePotentialSources } from '@/lib/source-ui';
import { deriveSupportLevelFromScore } from '@/lib/score-labels';

type LoadedArticle = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  imageUrl: string | null;
  publishedAt: string;
  category: { id: string; slug: string; name: string } | null;
  author: { id: string; email: string; name: string | null; username: string | null; avatarUrl: string | null; } | null;
  aiSummary: string | null;
  factCheckScore: number | null;
  factCheckData: any | null;
  sources?: any; // Added for compatibility check
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
  const [factCheckError, setFactCheckError] = React.useState<string | null>(null);
  const [isHighlightActive, setIsHighlightActive] = React.useState(false);
  const factCheckPollRef = React.useRef<number | null>(null);
  const factCheckPollInFlightRef = React.useRef(false);

  const clearFactCheckPolling = React.useCallback(() => {
    if (factCheckPollRef.current !== null) {
      window.clearInterval(factCheckPollRef.current);
      factCheckPollRef.current = null;
    }
    factCheckPollInFlightRef.current = false;
  }, []);

  const topLevelTransparencyData = React.useMemo(() => {
    if (!article) return null;

    // 1. Parse sources from backend payload
    const parsedData = parsePotentialSources(article.sources || article.factCheckData || []);

    // 2. Normalize for UI display (no score recalculation)
    const normalized = parsedData.map((s: any) =>
      normalizeSourceForUi(s, 'Source analysée par Epion.')
    );

    // 3. Read scores from backend payload (backend is source of truth)
    const storedFactData = article.factCheckData && !Array.isArray(article.factCheckData) ? article.factCheckData : null;

    // Score: v1 payload → legacy payload → DB field
    const factScore = typeof storedFactData?.score === 'number'
      ? storedFactData.score
      : typeof storedFactData?.factScore === 'number'
        ? storedFactData.factScore
        : typeof article.factCheckScore === 'number'
          ? article.factCheckScore
          : null;

    // Source mean: read from calculation, no recalculation
    const rawSourceScore = typeof storedFactData?.calculation?.sourcesMean === 'number'
      ? storedFactData.calculation.sourcesMean
      : typeof storedFactData?.sourcesMean === 'number'
        ? storedFactData.sourcesMean
        : 0;

    // Content score (liveScore / contentScore)
    const outputScore = typeof storedFactData?.calculation?.contentScore === 'number'
      ? storedFactData.calculation.contentScore
      : typeof storedFactData?.calculation?.liveScore === 'number'
        ? storedFactData.calculation.liveScore
        : typeof storedFactData?.liveScore === 'number'
          ? storedFactData.liveScore
          : 0;

    // Support level: read from payload or derive from score (fallback)
    const supportLevel = storedFactData?.supportLevel || deriveSupportLevelFromScore(factScore);

    // Status: read from article field (DB is source of truth)
    const factCheckStatus = (article as any).factCheckStatus || storedFactData?.status || null;

    return {
      factScore,
      rawSourceScore,
      outputScore,
      supportLevel,
      factCheckStatus,
      sources: normalized,
      liveAnalysis: storedFactData?.liveAnalysis || null,
    };
  }, [article]); // Safe dependency (article is state)

  const storeFactCheckResult = React.useCallback((result: any, score?: number | null) => {
    setFactCheckResult(result);
    setFactCheckError(null);
    setFactCheckLoading(false);
    setArticle(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        factCheckData: result,
        factCheckScore: typeof score === 'number'
          ? score
          : typeof result?.factScore === 'number'
            ? result.factScore
            : prev.factCheckScore,
      };
    });
  }, []);

  const factCheckSummary = React.useMemo(() => {
    if (!factCheckResult || typeof factCheckResult !== 'object' || Array.isArray(factCheckResult)) {
      return null;
    }

    const liveAnalysis = factCheckResult.liveAnalysis || null;
    const pillarScores = liveAnalysis?.pillarScores || null;
    const sourceCount = Array.isArray(factCheckResult.sources) ? factCheckResult.sources.length : 0;

    return {
      factScore: typeof factCheckResult.factScore === 'number'
        ? factCheckResult.factScore
        : article?.factCheckScore ?? null,
      contentIntent: liveAnalysis?.contentIntent || null,
      sourceCount,
      pillarScores,
    };
  }, [factCheckResult, article?.factCheckScore]);

  // Initialize state from article when loaded
  React.useEffect(() => {
    if (article) {
      if (article.aiSummary) setSummaryText(article.aiSummary);
      if (article.factCheckData) {
        setFactCheckResult(article.factCheckData);
        setFactCheckError(null);
        setFactCheckLoading(false);
        clearFactCheckPolling();
      }
    }
  }, [article, clearFactCheckPolling]);

  React.useEffect(() => {
    return () => {
      clearFactCheckPolling();
    };
  }, [clearFactCheckPolling]);

  React.useEffect(() => {
    clearFactCheckPolling();
    setFactCheckResult(null);
    setFactCheckError(null);
    setFactCheckLoading(false);
    setShowFactCheck(false);
  }, [slug, clearFactCheckPolling]);

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
  // ----------------------------------------
  // Charger l'article (et Polling Intelligent)
  // ----------------------------------------
  const fetchArticle = React.useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch(`${API_BASE}/api/articles/slug/${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setArticle({
        // Optimisation : Si les données n'ont pas changé (deep check simplifié), ne pas update
        // Mais ici on veut surtout mettre à jour les TrustScores
        
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
          sources: data.sources ?? undefined,
          generationPrompt: data.generationPrompt ?? null,

      });
    } catch (e: any) {
      if (!silent) {
        setError(e?.message || 'Failed to load article');
        setArticle(null);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [slug]);

  // Initial Load
  React.useEffect(() => {
    fetchArticle(false);
  }, [fetchArticle]);

  // Polling Intelligent : Si des sources sont "PENDING", on rafraîchit
  const isPending = React.useMemo(() => {
    const sources = topLevelTransparencyData?.sources || [];
    // On considère "Pending" si une source a un trustScore null OU un type 'PENDING'
    return sources.some((s: any) => s.trustScore === null || s.type === 'PENDING');
  }, [topLevelTransparencyData]);

  React.useEffect(() => {
    if (!isPending) return;

    const interval = setInterval(() => {
      fetchArticle(true);
    }, 3000);

    return () => clearInterval(interval);
  }, [isPending, fetchArticle]);

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

    if (factCheckResult || !article?.id) {
      return;
    }

    setFactCheckError(null);
    setFactCheckLoading(true);
    clearFactCheckPolling();

    try {
      const res = await fetch(`${API_BASE}/api/ai/fact-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: article.id }),
        credentials: 'include'
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.message || 'Fact-check failed');
      }

      if (data.cached && data.analysis) {
        storeFactCheckResult(data.analysis);
        return;
      }

      if (data.status === 'processing' && data.jobId) {
        const jobId = String(data.jobId);
        let shouldStartPolling = true;

        const pollJob = async () => {
          if (factCheckPollInFlightRef.current) return;
          factCheckPollInFlightRef.current = true;

          try {
            const pollRes = await fetch(`${API_BASE}/api/ai/fact-check/${jobId}`, {
              credentials: 'include'
            });
            const pollData = await pollRes.json().catch(() => ({}));

            if (!pollRes.ok) {
              throw new Error(pollData?.error || pollData?.message || 'Fact-check polling failed');
            }

            if (pollData.status === 'completed') {
              shouldStartPolling = false;
              clearFactCheckPolling();
              storeFactCheckResult(pollData.result, pollData.score ?? null);
              fetchArticle(true).catch(() => { });
              return;
            }

            if (pollData.status === 'failed') {
              shouldStartPolling = false;
              clearFactCheckPolling();
              setFactCheckLoading(false);
              setFactCheckError(pollData.error || 'Fact-check failed');
            }
          } catch (err: any) {
            shouldStartPolling = false;
            clearFactCheckPolling();
            setFactCheckLoading(false);
            setFactCheckError(err?.message || 'Fact-check polling failed');
          } finally {
            factCheckPollInFlightRef.current = false;
          }
        };

        await pollJob();

        if (shouldStartPolling && !factCheckPollRef.current) {
          factCheckPollRef.current = window.setInterval(() => {
            pollJob().catch(() => { });
          }, 2500);
        }
        return;
      }

      throw new Error('Unexpected fact-check response');
    } catch (err: any) {
      console.error(err);
      setFactCheckError(err?.message || 'Fact-check failed');
      setFactCheckLoading(false);
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
          slug: article?.slug,
          type: 'article'
        }
      }
    });
  };

  const handleShowPrompt = () => {
    setShowPrompt(true);
  };

  const handleSourceClick = (id: number) => {
    setFocusedSourceId(id);
    setActiveModal('sources');
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
  const transparencyData = topLevelTransparencyData;
  const displayScore = transparencyData?.factScore || 0;
  const normalizedSources = transparencyData?.sources || [];

  return (
    <>
      <main className="mx-auto w-full max-w-4xl px-4 py-10 space-y-8 pb-32">
        {/* Breadcrumb */}
        <nav className="text-sm opacity-70">
          <Link to="/news" className="hover:underline">
            news
          </Link>
          {category?.name && (
            <>
              <span className="mx-2">/</span>
              <Link to={`/news/${category.slug}`} className="hover:underline">
                {category.name}
              </Link>
            </>
          )}
        </nav>

        {/* Title + Save/Like/Edit */}
        {/* Title + Actions */}
        <header className="space-y-4">
          <SectionHeader title={title} />
        </header>

        {/* Meta (Maintenant sous le Trust Header, remis ici plus tard) */}

        {/* Illustration */}
        <ArticleThumbnail
          imageUrl={imageUrl}
          category={category?.name}
          title={title}
          className="mt-2 w-full rounded-2xl border border-black/10 object-cover dark:border-white/10 aspect-video"
        />

        {/* Trust Header (Always Visible) */}
        <div className="mt-4 rounded-2xl border border-black/10 bg-white px-5 py-3 dark:border-white/10 dark:bg-neutral-900 shadow-sm relative overflow-hidden">
          {isPending && (
            <div className="absolute top-0 left-0 w-full h-1 bg-gray-100 dark:bg-white/5">
              <div className="h-full bg-blue-500/50 animate-progress-indeterminate"></div>
            </div>
          )}
          <TrustHeader
            score={displayScore}
            sources={normalizedSources}
            onShowSources={() => setActiveModal('sources')}
            onShowScoreDetails={() => setActiveModal('reliability')}
          />
        </div>

        {/* Méta infos */}
        <div className="mt-4 flex flex-wrap items-center justify-start gap-1.5 text-sm text-black/70 dark:text-white/70">
          {category?.name && <span>{category?.name}</span>}
          <span className="opacity-50">•</span>
          <span>{new Date(publishedAt).toLocaleDateString()}</span>
          {typeof viewsAll === 'number' && (
            <>
              <span className="opacity-50">•</span>
              <span>{Intl.NumberFormat().format(viewsAll)} views</span>
            </>
          )}

          {/* Author */}
          {author && (
            <>
              <span className="opacity-50">•</span>
              <Link to={`/u/${author.username || author.id}`} className="hover:underline hover:text-black dark:hover:text-white transition-colors">
                {author.name || author.username || 'Unknown'}
              </Link>
            </>
          )}

          {/* Edit (dropdown inline) */}
          {isAuthor && (
            <>
              <span className="opacity-50">•</span>
              <div className="relative" ref={editMenuRef}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isEditOpen}
                  onClick={() => setIsEditOpen((o) => !o)}
                  className="inline-flex items-center hover:text-black dark:hover:text-white transition-colors"
                >
                  Edit
                  <svg className="ml-1 h-3.5 w-3.5 opacity-70" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" />
                  </svg>
                </button>

                {isEditOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 mt-2 w-48 overflow-hidden rounded-2xl border bg-white shadow-lg ring-1 ring-black/5 dark:border-white/10 dark:bg-neutral-950 z-50 text-black dark:text-white"
                  >
                    <Link
                      to={`/news/article/${article.slug}/edit`}
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
                        navigate('/news');
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Content – rendu en texte, sans innerHTML pour éviter tout XSS */}
        {showFactCheck && (
          <div className="animate-in slide-in-from-top-4 duration-500 fade-in">
            {factCheckLoading ? (
              <div className="p-4 rounded-2xl border border-black/10 bg-black/5 dark:border-white/5 mb-6 animate-pulse">
                Analyzing article reliability...
              </div>
            ) : factCheckError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300 shadow-sm mt-4">
                {factCheckError}
              </div>
            ) : factCheckSummary ? (
              <div className="rounded-2xl border border-black/10 bg-white px-5 py-4 dark:border-white/10 dark:bg-neutral-900 shadow-sm mt-4">
                <div className="space-y-4 text-gray-800 dark:text-gray-100">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {typeof factCheckSummary.factScore === 'number' && (
                      <span className="rounded-full bg-black/5 px-3 py-1 font-medium dark:bg-white/10">
                        Score: {factCheckSummary.factScore}%
                      </span>
                    )}
                    {factCheckSummary.contentIntent && (
                      <span className="rounded-full bg-black/5 px-3 py-1 font-medium dark:bg-white/10">
                        Intent: {factCheckSummary.contentIntent}
                      </span>
                    )}
                    <span className="rounded-full bg-black/5 px-3 py-1 font-medium dark:bg-white/10">
                      Sources: {factCheckSummary.sourceCount}
                    </span>
                  </div>

                  {factCheckSummary.pillarScores ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {Object.entries(factCheckSummary.pillarScores).map(([pillar, value]: [string, any]) => (
                        <div
                          key={pillar}
                          className="rounded-xl border border-black/10 bg-black/5 p-3 dark:border-white/10 dark:bg-white/5"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold capitalize">{pillar}</span>
                            <span className="text-sm font-medium">{value?.score ?? 0}/100</span>
                          </div>
                          {value?.reasoning && (
                            <p className="mt-2 text-sm leading-6 text-black/70 dark:text-white/70">
                              {value.reasoning}
                            </p>
                          )}
                          {value?.quote && (
                            <p className="mt-2 text-xs italic text-black/60 dark:text-white/60">
                              "{value.quote}"
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm leading-6 text-black/70 dark:text-white/70">
                      Fact-check complete. The trust panel above has been refreshed with the latest source analysis.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}

        <article className="mt-8">
          {content ? (
            <MarkdownRenderer
              content={content}
              isHighlightActive={isHighlightActive}
              sources={normalizedSources}
              onSourceClick={handleSourceClick}
            />
          ) : excerpt ? (
            <MarkdownRenderer
              content={excerpt}
              className="text-lg opacity-80"
              isHighlightActive={isHighlightActive}
              sources={normalizedSources}
              onSourceClick={handleSourceClick}
            />
          ) : (
            <p className="opacity-50 italic">No content available.</p>
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

      {/* Action Bar & Drawer */}
      <ArticleActionBar
        articleId={article.id}
        onOpenComments={() => setIsCommentsOpen(true)}
        commentCount={commentsApi.items.length}
        onSummarize={handleSummarize}
        onChat={handleChat}
        onFactCheck={handleFactCheck}
        onShowPrompt={handleShowPrompt}
        summaryText={summaryText}
        summaryLoading={summaryLoading}
        promptText={article?.generationPrompt || ''}
        isHighlightActive={isHighlightActive}
        onHighlightClick={() => {
            setIsHighlightActive(!isHighlightActive);
        }}
      />

      <CommentsDrawer
        articleId={article.id}
        isOpen={isCommentsOpen}
        onClose={() => setIsCommentsOpen(false)}
        {...commentsApi}
      />

      <Modal
        isOpen={activeModal === 'sources'}
        onClose={() => {
          setActiveModal(null);
          setFocusedSourceId(null);
        }}
        title="Sources utilisées"
        size="large"
      >
        <div className="text-sm text-black/70 dark:text-white/70 h-full">
          <div className="flex flex-col space-y-3 h-full overflow-y-auto pr-2 pb-4">
            {normalizedSources.map((s: any, index: number) => (
              <div key={s.id || index}>
                <SourceCard source={s} isFocused={s.id === focusedSourceId} />
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Modal Score de Confiance (Détail) */}
      {activeModal === 'reliability' && (
        <GlobalTrustScoreModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          data={{
            sources: normalizedSources,
            globalScore: topLevelTransparencyData?.factScore || 0,
            sourceScore: topLevelTransparencyData?.rawSourceScore || 0,
            aiScore: topLevelTransparencyData?.outputScore || 0,
            liveAnalysis: topLevelTransparencyData?.liveAnalysis || null
          }}
        />
      )}

    </>
  );
}

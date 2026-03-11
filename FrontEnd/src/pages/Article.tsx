import React from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import SectionHeader from '@/components/SectionHeader';
import ArticleCard from '@/components/articles/ArticleCard';
import ArticleThumbnail from '@/components/articles/ArticleThumbnail';
import { API_BASE } from '@/config/api';
import SaveButton from '@/components/ui/SaveButton';
import { useMe } from '@/contexts/MeContext';
import ReactionButtons from '@/components/ui/ReactionButtons';
import CommentsDrawer from '@/components/articles/CommentsDrawer';
import ArticleActionBar from '@/components/articles/ArticleActionBar';
import ArticleAuthorPill from '@/components/articles/ArticleAuthorPill';
// import FactCheckCard from '@/components/articles/FactCheckCard'; // Deprecated
// import VerificationBlock from '../components/chat/VerificationBlock';
import TrustHeader from '@/components/shared/TrustHeader';
// import MarkdownRenderer from '@/components/shared/MarkdownRenderer'; // On inline la logique pour garantir la feature
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// import { TrustScoreModal } from '@/components/chat/TrustScoreModal';
import { GlobalTrustScoreModal } from '@/components/chat/trust-score-ui/GlobalTrustScoreModal';
import { useComments } from '@/hooks/useComments';
import Modal from '@/components/ui/Modal';
import SourceCard from '../components/chat/SourceCard';
import MarkdownRenderer from '@/components/shared/MarkdownRenderer';
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
  const [isHighlightActive, setIsHighlightActive] = React.useState(false);

  // --- TOP LEVEL LOGIC: Source Parsing & Scoring ---
  // Must be here to avoid "Rendered more hooks" errors (cannot be after early returns)
  const topLevelTransparencyData = React.useMemo(() => {
    if (!article) return null;

    // 1. STRATÉGIE DE RÉCUPÉRATION
    let potentialSources = article.sources || article.factCheckData || [];
    if (potentialSources && !Array.isArray(potentialSources) && typeof potentialSources === 'object') {
      if (potentialSources.sources) potentialSources = potentialSources.sources;
    }

    // 2. PARSING
    let parsedData: any[] = [];
    try {
      if (Array.isArray(potentialSources)) {
        parsedData = potentialSources;
      } else if (typeof potentialSources === 'string') {
        if (potentialSources.trim() === "[]") parsedData = [];
        else parsedData = JSON.parse(potentialSources);
      }
    } catch { parsedData = []; }

    // 3. NORMALISATION
    const normalized = parsedData.map((s: any) => {
      const domainVal = s.domain || s.name || (s.url ? new URL(s.url).hostname : "Source inconnue");
      const valCheck = (typeof s.trustScore === 'number') ? s.trustScore : s.score;
      const scoreVal = (valCheck === undefined || valCheck === null) ? null : valCheck;

      // Fallback: Generate explanation if missing (Legacy Data Support)
      const hasExplanation = s.explanation || s.metadata?.explanation;
      const finalExplanation = hasExplanation || {
        formula: "70% Base de données + 30% Analyse Live",
        sources: ["Audit Epion (Legacy)"],
        livePenalties: [],
        pillarWeights: { transparency: "20%", editorial: "30%", semantic: "30%", pluralism: "20%" }
      };

      // 3.1 CALCUL HYBRIDE (70% Réputation + 30% Analyse Live)
      const metrics = s.metrics || s.metric || {};
      const analysisMean = Math.round(
        ((metrics.transparency || 50) +
          (metrics.editorial || 50) +
          (metrics.logic || metrics.pluralism || metrics.ux || 50)) / 4
      );

      const dbScore = s.metadata?.dbScore || s.dbScore || scoreVal;
      let finalScore = dbScore || analysisMean || 50;

      // Si on a les deux, on applique la pondération
      if (dbScore && analysisMean) {
        finalScore = Math.round((dbScore * 0.7) + (analysisMean * 0.3));
      }

      return {
        ...s,
        domain: domainVal,
        score: finalScore, // HYBRID SCORE
        url: s.url || s.link || "#",
        description: s.description || "Source analysée par Epion.",
        name: domainVal,
        trustScore: dbScore, // Keep raw V2 score for reference
        type: s.type || s.category || "GENERAL",
        category: s.category || s.type || "GENERAL",
        logo: s.logo || `https://www.google.com/s2/favicons?domain=${domainVal !== "Source inconnue" ? domainVal : 'example.com'}`,
        flags: s.flags || { isAdsTxtValid: true, isClickbait: false, isPlatform: false },
        dbScore: s.metadata?.dbScore || s.dbScore || undefined, // FIX: Pass V2 Score
        reliability: s.metadata?.reliability || s.reliability || undefined, // FIX: Pass Reliability
        biasScore: s.metadata?.biasScore || s.biasScore || undefined, // FIX: Pass Bias Score
        country: s.metadata?.country || s.country || "FR",
        politicalBias: s.metadata?.politicalBias || s.politicalBias || "UNKNOWN",
        metric: s.metrics || s.metric,
        explanation: finalExplanation
      };
    });

    // 4. SCORING (Chat Logic)
    const scores = normalized.map(s => (typeof s.score === 'number' ? s.score : 0));
    const avgSourceScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    // FIX: Use Real Global AI Score (Analysis/Summary) instead of hardcoded 90
    let aiScore = 90;
    if (article.factCheckData && !Array.isArray(article.factCheckData) && typeof article.factCheckData.factScore === 'number') {
      aiScore = article.factCheckData.factScore;
    } else if (typeof article.factCheckScore === 'number') {
      aiScore = article.factCheckScore;
    }
    const outputScore = aiScore;

    let finalFactScore = aiScore;
    if (scores.length > 0) {
      finalFactScore = Math.round((avgSourceScore * 0.75) + (outputScore * 0.25));
    }

    return {
      factScore: finalFactScore, // 80% (Weighted)
      rawSourceScore: avgSourceScore, // 77% (Raw)
      outputScore: outputScore,
      sources: normalized,
      liveAnalysis: article.factCheckData?.liveAnalysis || null
    };
  }, [article]); // Safe dependency (article is state)

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

      setArticle((prev) => {
        // Optimisation : Si les données n'ont pas changé (deep check simplifié), ne pas update
        // Mais ici on veut surtout mettre à jour les TrustScores
        return {
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
        };
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

    console.log("🔄 Smart Polling Active: Waiting for scores...");
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


  console.log('FactCheck State:', showFactCheck);

  const factData = factCheckResult;

  // --- DEBUG CRITIQUE ---
  console.log("📢 ARTICLE DATA RECEIVED:", article);
  console.log("Sources field:", article.sources);
  if (article.factCheckData && Array.isArray(article.factCheckData) && article.factCheckData.length > 0) {
    console.log("FactCheckData ITEM [0] STRINGIFIED:", JSON.stringify(article.factCheckData[0], null, 2));
  } else {
    console.log("FactCheckData field (raw):", article.factCheckData);
  }

  // LOGIC MOVED TO TOP LEVEL USEMEMO TO AVOID HOOK ERRORS
  const transparencyData = topLevelTransparencyData; // Will be defined above
  const displayScore = transparencyData?.factScore || 0;
  const normalizedSources = transparencyData?.sources || [];

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
        {/* Title + Actions */}
        <header className="space-y-4">
          <SectionHeader title={title} />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Author Pill */}
            <ArticleAuthorPill author={author} />

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
                          navigate('/actuality');
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Meta */}
        <div className="text-sm opacity-70">
          {category?.name ?? '—'} • {new Date(publishedAt).toLocaleDateString()}
          {typeof viewsAll === 'number' && <> • {Intl.NumberFormat().format(viewsAll)} views</>}
        </div>

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
          {/* CALCUL INLINE POUR FORCER LE 75/25 */}
          <TrustHeader
            score={displayScore}
            sources={normalizedSources}
            isHighlightActive={isHighlightActive}
            onHighlightClick={() => {
              console.log("🔦 TOGGLE HIGHLIGHT CLICKED! New State:", !isHighlightActive);
              setIsHighlightActive(!isHighlightActive);
            }}
            onShowSources={() => setActiveModal('sources')}
            onShowScoreDetails={() => setActiveModal('reliability')}
          />
        </div>

        {/* Content – rendu en texte, sans innerHTML pour éviter tout XSS */}
        {showFactCheck && (
          <div className="animate-in slide-in-from-top-4 duration-500 fade-in">
            {factCheckLoading ? (
              <div className="p-4 rounded-2xl border border-black/10 bg-black/5 dark:border-white/5 mb-6 animate-pulse">
                Analyzing article reliability...
              </div>
            ) : factData && factData.analysis ? (
              <div className="rounded-2xl border border-black/10 bg-white px-5 py-4 dark:border-white/10 dark:bg-neutral-900 shadow-sm mt-4">
                <div className="whitespace-pre-wrap break-words text-gray-800 dark:text-gray-100 leading-7 text-[15px]">
                  {factData.analysis}
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
      />

      <CommentsDrawer
        articleId={article.id}
        isOpen={isCommentsOpen}
        onClose={() => setIsCommentsOpen(false)}
        {...commentsApi}
      />

      {/* Modal Transparence (Copied from ChatMessage) */}
      {/* Modal Transparence (Copied from ChatMessage) */}
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

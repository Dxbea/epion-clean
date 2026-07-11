import React, { useState } from 'react';
import type { ChatMessage as Msg } from '@/types/chat';
import { Copy, Check, ThumbsUp, ThumbsDown, Bookmark, MoreHorizontal, Share2, Flag, FileText } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import SourceCard from './SourceCard';
import { GlobalTrustScoreModal } from './trust-score-ui/GlobalTrustScoreModal';
// import VerificationBlock from './VerificationBlock';
import TrustHeader from '@/components/shared/TrustHeader';
import ReactMarkdown from 'react-markdown';
import { normalizeSourceForUi } from '@/lib/source-ui';

export interface ScoreBreakdownItem {
  id: string;
  label: string;
  score: number;
  description: string;
}

export default function ChatMessage({ message }: { message: Msg }) {
  const isUser = message.role === 'user';
  const messageAttachments = Array.isArray((message as any).metadata?.attachments)
    ? (message as any).metadata.attachments
    : [];

  // États locaux
  const [activeModal, setActiveModal] = useState<'sources' | 'score' | null>(null);
  const [highlightEnabled, setHighlightEnabled] = useState(false);
  const [focusedSourceIds, setFocusedSourceIds] = useState<number[]>([]);

  // UX Interaction State: Focus before Action
  const [selectedCitationKey, setSelectedCitationKey] = useState<string | null>(null);

  // États Feedback & Actions
  const [hasCopied, setHasCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  // Parsing robuste avec useMemo — reads backend scores, NO recalculation
  const transparencyData = React.useMemo<{
    answer: string;
    sources: any[];
    factScore: number | null;
    rawSourceScore: number;
    scoreBreakdown?: ScoreBreakdownItem[];
    outputScore?: number;
    supportLevel?: string;
    liveAnalysis?: any | null;
  } | null>(() => {
    if (isUser) return null;

    let extractedSources: any[] = [];
    let extractedAnswer = message.content;
    const meta = (message as any).metadata;

    // Extract sources
    if (message.sources && Array.isArray(message.sources)) { extractedSources = message.sources; }

    // Fallback: parse from content JSON (legacy)
    if (extractedSources.length === 0) {
      try {
        const parsed = JSON.parse(message.content);
        if (parsed && typeof parsed === 'object') {
          if (parsed.answer) extractedAnswer = parsed.answer;
          if (Array.isArray(parsed.sources)) extractedSources = parsed.sources;
        }
      } catch { }
    }

    // Normalize sources for UI (no score recalculation)
    const contextualSources = extractedSources.map((source) =>
      normalizeSourceForUi(source, '')
    );

    // Read scores directly from backend AnswerScorePayload (v1 or legacy)
    const score = typeof meta?.score === 'number'
      ? meta.score
      : typeof meta?.factScore === 'number'
        ? meta.factScore
        : null;

    const rawSourceMean = typeof meta?.calculation?.sourcesMean === 'number'
      ? meta.calculation.sourcesMean
      : 0;

    const extractedOutputScore = typeof meta?.calculation?.outputScore === 'number'
      ? meta.calculation.outputScore
      : typeof meta?.outputAnalysis?.score === 'number'
        ? meta.outputAnalysis.score
        : 0;

    // Support level: read from payload or derive (fallback for legacy data)
    const supportLevel = meta?.supportLevel || null;

    const uniqueDomains = new Set(contextualSources.map((source) => source.domain)).size;
    const diversityScore = Math.min(100, Math.round((uniqueDomains / Math.max(1, 3)) * 100));

    const dynamicBreakdown: ScoreBreakdownItem[] = [
      { id: 'src', label: 'Qualité des Sources', score: rawSourceMean, description: 'Moyenne de réputation des domaines.' },
      { id: 'div', label: 'Diversité', score: diversityScore, description: `${uniqueDomains} sources uniques.` },
      { id: 'mdl', label: 'Fiabilité Modèle', score: extractedOutputScore, description: 'Score de confiance IA.' }
    ];

    return {
      answer: extractedAnswer,
      sources: contextualSources,
      factScore: score,
      rawSourceScore: rawSourceMean,
      scoreBreakdown: dynamicBreakdown,
      outputScore: extractedOutputScore,
      supportLevel,
      liveAnalysis: meta?.liveAnalysis || null
    };
  }, [message.content, message.sources, (message as any).metadata, isUser]);

  const content = transparencyData ? transparencyData.answer : message.content;

  const getSourceDetails = (id: number) => {
    const source = transparencyData?.sources.find((s: any) => s.id === id);
    return {
      name: source?.name || 'Source',
      domain: source?.domain || ''
    };
  };

  const handleSourceClick = (sourceIdOrIds: number | number[]) => {
    const ids = Array.isArray(sourceIdOrIds) ? sourceIdOrIds : [sourceIdOrIds];
    setFocusedSourceIds(ids);
    setActiveModal('sources');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  const handleCreateArticle = () => {};

  // --- LOGIQUE DE DETECTION ET RENDU ---

  // 1. Extraction des IDs : Scanne récursivement pour trouver tous les IDs de citations [1], [2]...
  const extractCitationIds = (children: React.ReactNode): number[] => {
    let ids: number[] = [];
    React.Children.forEach(children, (child) => {
      if (typeof child === 'string') {
        const matches = child.match(/\[(\d+(?:\s*,\s*\d+)*)\]/g);
        if (matches) {
          matches.forEach(m => {
            const inner = m.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/);
            if (inner) {
              inner[1].split(',').forEach(n => ids.push(parseInt(n.trim())));
            }
          });
        }
      } else if (React.isValidElement(child) && (child.props as any).children) {
        ids = ids.concat(extractCitationIds((child.props as any).children));
      }
    });
    return [...new Set(ids)]; // Unique IDs
  };

  // 2. Transformation Récursive : Remplace [1] par <sup> cliquable dans le texte
  const processChildrenForCitations = (children: React.ReactNode, isActive: boolean = false): React.ReactNode => {
    return React.Children.map(children, (child) => {
      // Cas Texte Brut : On injecte les badges
      if (typeof child === 'string') {
        // Regex avec capture
        const parts = child.split(/(\[\d+(?:\s*,\s*\d+)*\])/g);
        return parts.map((part, i) => {
          const match = part.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/);
          if (match) {
            const nums = match[1].split(',').map(n => n.trim());
            return (
              <sup key={i} className="inline-flex gap-0.5 ml-0.5 align-super cursor-pointer select-none">
                {nums.map((num, idx) => {
                  const idVal = parseInt(num);
                  return (
                    <span
                      key={idx}
                      onClick={(e) => { e.stopPropagation(); handleSourceClick(idVal); }}
                      className={`text-[9px] font-bold px-1 rounded-sm transition-colors ${isActive
                        ? 'bg-black text-[#00dc82]'
                        : 'text-[#00dc82] bg-[#00dc82]/10'
                        }`}
                      title={`Voir la source ${num}`}
                    >
                      {num}
                    </span>
                  )
                })}
              </sup>
            );
          }
          return part;
        });
      }

      // Cas Nœud React (ex: strong, em) : On descend récursivement sans toucher au nœud lui-même
      if (React.isValidElement(child)) {
        return React.cloneElement(child as React.ReactElement<any>, {
          children: processChildrenForCitations((child.props as any).children, isActive)
        });
      }

      return child;
    });
  };

  const markdownComponents: any = {
    // Paragraphes : Surlignage Bloc Interactif
    p: ({ children, ...props }: any) => {
      const citationIds = extractCitationIds(children);
      const isSourced = citationIds.length > 0;

      const citationKey = citationIds.sort().join(',');
      const isActive = selectedCitationKey === citationKey;

      const handleBlockClick = (e: React.MouseEvent) => {
        if (isSourced && highlightEnabled) {
          e.stopPropagation();
          if (isActive) {
            // 2nd Click: Expand to Side Panel
            handleSourceClick(citationIds);
          } else {
            // 1st Click: Focus (Show Inline Popover)
            setSelectedCitationKey(citationKey);
          }
        }
      };

      const highlightClasses = isSourced && highlightEnabled
        ? isActive
          ? 'bg-[#00dc82]/30 border-[#00dc82] ring-1 ring-[#00dc82] text-gray-900 dark:text-white' // Actif
          : 'bg-[#00dc82]/10 border-[#00dc82]/40 text-gray-900 dark:text-gray-100 hover:bg-[#00dc82]/20' // Repos
        : '';

      const wrapperClasses = isSourced && highlightEnabled
        ? `px-1 py-0.5 mx-0.5 rounded-[4px] box-decoration-clone cursor-pointer transition-all duration-200 border-b-2 ${highlightClasses}`
        : '';

      return (
        <p className="mb-2 leading-relaxed" {...props}>
          <span
            className={`relative inline ${wrapperClasses}`}
            onClick={handleBlockClick}
          >
            {processChildrenForCitations(children, isActive)}

            {/* LA BULLE (POPOVER) */}
            {isActive && isSourced && highlightEnabled && (
              <span
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[280px] z-50 animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Fond Noir Solide */}
                <span className="block bg-[#111111] text-white text-xs rounded-xl shadow-2xl border border-white/10 p-2">
                  <span className="flex flex-col gap-1">
                    {citationIds.map(id => (
                      <button
                        key={id}
                        onClick={() => handleSourceClick(id)}
                        className="flex items-center gap-3 hover:bg-white/10 p-2 rounded-lg transition-colors text-left group w-full"
                      >
                        {/* Badge ID (Même vert que le surlignage) */}
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#00dc82] text-[10px] text-black font-bold">
                          {id}
                        </span>
                        <span className="flex flex-col overflow-hidden">
                          <span className="truncate font-medium text-gray-100 text-[11px]">
                            {getSourceDetails(id).name}
                          </span>
                          <span className="text-[10px] text-gray-500 truncate">
                            {getSourceDetails(id).domain}
                          </span>
                        </span>
                      </button>
                    ))}
                  </span>
                  <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#111111] border-r border-b border-white/10 rotate-45"></span>
                </span>
              </span>
            )}
          </span>
        </p>
      );
    },
    // List Items : Surlignage Bloc Interactif
    li: ({ children, ...props }: any) => {
      const citationIds = extractCitationIds(children);
      const isSourced = citationIds.length > 0;

      const citationKey = citationIds.sort().join(',');
      const isActive = selectedCitationKey === citationKey;

      const handleBlockClick = (e: React.MouseEvent) => {
        if (isSourced && highlightEnabled) {
          e.stopPropagation();
          if (isActive) {
            handleSourceClick(citationIds);
          } else {
            setSelectedCitationKey(citationKey);
          }
        }
      };

      const highlightClasses = isSourced && highlightEnabled
        ? isActive
          ? 'bg-[#00dc82]/30 border-[#00dc82] ring-1 ring-[#00dc82] text-gray-900 dark:text-white' // Actif
          : 'bg-[#00dc82]/10 border-[#00dc82]/40 text-gray-900 dark:text-gray-100 hover:bg-[#00dc82]/20' // Repos
        : '';

      const wrapperClasses = isSourced && highlightEnabled
        ? `px-1 py-0.5 mx-0.5 rounded-[4px] box-decoration-clone cursor-pointer transition-all duration-200 border-b-2 ${highlightClasses}`
        : '';

      return (
        <li className="mb-1" {...props}>
          <span
            className={`relative inline ${wrapperClasses}`}
            onClick={handleBlockClick}
          >
            {processChildrenForCitations(children, isActive)}

            {/* LA BULLE (POPOVER) */}
            {isActive && isSourced && highlightEnabled && (
              <span
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[280px] z-50 animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="block bg-[#111111] text-white text-xs rounded-xl shadow-2xl border border-white/10 p-2">
                  <span className="flex flex-col gap-1">
                    {citationIds.map(id => (
                      <button
                        key={id}
                        onClick={() => handleSourceClick(id)}
                        className="flex items-center gap-3 hover:bg-white/10 p-2 rounded-lg transition-colors text-left group w-full"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#00dc82] text-[10px] text-black font-bold">
                          {id}
                        </span>
                        <span className="flex flex-col overflow-hidden">
                          <span className="truncate font-medium text-gray-100 text-[11px]">
                            {getSourceDetails(id).name}
                          </span>
                          <span className="text-[10px] text-gray-500 truncate">
                            {getSourceDetails(id).domain}
                          </span>
                        </span>
                      </button>
                    ))}
                  </span>
                  <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#111111] border-r border-b border-white/10 rotate-45"></span>
                </span>
              </span>
            )}
          </span>
        </li>
      );
    },
    a: ({ node, ...props }: any) => <a className="text-[#00dc82] hover:underline" {...props} />, // Also updated link color to match
    ul: ({ node, ...props }: any) => <ul className="list-disc pl-4 mb-4" {...props} />,
    ol: ({ node, ...props }: any) => <ol className="list-decimal pl-4 mb-4" {...props} />,
  };


  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} group mb-6`}>
      {isUser ? (
        <div className="max-w-[78%] rounded-2xl bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black break-words whitespace-pre-wrap">
          {messageAttachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {messageAttachments.map((attachment: any, index: number) => (
                <div
                  key={`${attachment.name || 'attachment'}-${index}`}
                  className="flex items-center gap-2 rounded-lg bg-white/10 px-2 py-1 dark:bg-black/10"
                >
                  {attachment.kind === 'image' && attachment.previewUrl ? (
                    <img
                      src={attachment.previewUrl}
                      alt={attachment.name || 'Image jointe'}
                      className="h-8 w-8 rounded object-cover"
                    />
                  ) : (
                    <FileText className="h-4 w-4 opacity-80" />
                  )}
                  <span className="max-w-[180px] truncate text-xs">
                    {attachment.name || 'Pièce jointe'}
                  </span>
                </div>
              ))}
            </div>
          )}
          {message.content}
        </div>
      ) : (
        <>
          <div className="w-full max-w-full lg:max-w-[85%] rounded-2xl border border-black/5 bg-white p-5 dark:border-white/10 dark:bg-white/5">
            {/* Header */}
            {transparencyData && (
              <TrustHeader
                score={transparencyData.factScore}
                supportLevel={transparencyData.supportLevel as any}
                sources={transparencyData.sources}
                isHighlightActive={highlightEnabled}
                onHighlightClick={() => {
                  setHighlightEnabled(!highlightEnabled);
                  setSelectedCitationKey(null); // Reset focus
                }}
                onShowSources={() => setActiveModal('sources')}
                onShowScoreDetails={() => setActiveModal('score')}
              />
            )}

            {/* Body */}
            <div className={`text-sm text-gray-900 dark:text-gray-200 ${transparencyData ? 'mt-4' : ''}`}>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown components={markdownComponents}>
                  {content}
                </ReactMarkdown>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-4 dark:border-white/5">
              <div className="flex items-center gap-1">
                <button onClick={handleCopy} className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-black/5 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white transition-colors" title="Copier">
                  {hasCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </button>
                <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-white/10"></div>
                <button onClick={() => setFeedback(feedback === 'up' ? null : 'up')} className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${feedback === 'up' ? 'text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-500/10' : 'text-gray-500 hover:bg-black/5 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white'}`}>
                  <ThumbsUp className={`h-4 w-4 ${feedback === 'up' ? 'fill-current' : ''}`} />
                </button>
                <button onClick={() => setFeedback(feedback === 'down' ? null : 'down')} className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${feedback === 'down' ? 'text-red-500 bg-red-50 dark:text-red-400 dark:bg-red-500/10' : 'text-gray-500 hover:bg-black/5 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white'}`}>
                  <ThumbsDown className={`h-4 w-4 ${feedback === 'down' ? 'fill-current' : ''}`} />
                </button>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <div className="relative">
                  {showOptions && (
                    <div className="fixed inset-0 z-10" onClick={() => setShowOptions(false)} />
                  )}
                  <button onClick={() => setShowOptions(!showOptions)} className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-black/5 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200 transition-colors" title="Plus d'options">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {showOptions && (
                    <div className="absolute bottom-full right-0 mb-2 w-48 overflow-hidden rounded-xl border border-black/5 bg-white p-1 shadow-xl dark:border-white/5 dark:bg-[#1A1A1A] z-20 animate-in fade-in zoom-in-95 duration-100">
                      <button onClick={() => { setIsBookmarked(!isBookmarked); setShowOptions(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/5 transition-colors">
                        <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-amber-500 text-amber-500' : 'text-gray-400'}`} />
                        <span className={isBookmarked ? 'text-amber-600 dark:text-amber-500' : ''}>{isBookmarked ? 'Sauvegardé' : 'Sauvegarder'}</span>
                      </button>
                      <button onClick={() => { setShowOptions(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/5 transition-colors">
                        <Share2 className="h-4 w-4 text-gray-400" />
                        <span>Partager</span>
                      </button>
                      <button onClick={() => { setShowOptions(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 transition-colors">
                        <Flag className="h-4 w-4" />
                        <span>Signaler</span>
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleCreateArticle}
                  className="flex items-center gap-2 rounded-lg border border-black/10 bg-black/5 px-3 py-1.5 text-xs font-medium text-gray-700 transition-all hover:bg-black/10 hover:text-black group dark:border-white/10 dark:bg-white/5 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <FileText className="w-3.5 h-3.5 text-gray-500 transition-colors group-hover:text-emerald-500 dark:text-neutral-400 dark:group-hover:text-emerald-400" />
                  <span>Transformer en Article</span>
                </button>
              </div>
            </div>
          </div>

          {transparencyData && (
            <>
              <Modal
                isOpen={activeModal === 'sources'}
                onClose={() => { setActiveModal(null); setFocusedSourceIds([]); }}
                title="Sources utilisées"
                size="large"
              >
                <div className="text-sm text-black/70 dark:text-white/70 h-full">
                  <div className="flex flex-col space-y-3 h-full overflow-y-auto w-full p-2 pb-4">
                    {transparencyData.sources.map((s: any, index: number) => {
                      const uiSource = {
                        ...s,
                        metrics: s.metrics || null,
                        flags: s.flags || null,
                        justification: s.justification || null,
                        category: s.type || s.category || undefined,
                        description: s.description || undefined,
                        criteria: s.criteria || []
                      };
                      return (
                        <div key={s.id || index}>
                          <SourceCard source={uiSource} isFocused={s.id && focusedSourceIds.includes(s.id)} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Modal>

              {activeModal === 'score' && (
                <GlobalTrustScoreModal
                  isOpen={true}
                  onClose={() => setActiveModal(null)}
                  data={{
                    sources: transparencyData.sources,
                    globalScore: transparencyData.factScore || 0,
                    sourceScore: transparencyData.rawSourceScore,
                    aiScore: transparencyData.outputScore || 0,
                    liveAnalysis: transparencyData.liveAnalysis || null
                  }}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

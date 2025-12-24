import React, { useState } from 'react';
import type { ChatMessage as Msg } from '@/types/chat';
import { Highlighter, ShieldCheck, Info, Copy, Check, ThumbsUp, ThumbsDown, Bookmark, PenTool, MoreHorizontal, Share2, Flag, FileText } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import SourceCard from './SourceCard';
import { TrustScoreModal } from './TrustScoreModal';
import VerificationBlock from './VerificationBlock';
import ReactMarkdown from 'react-markdown';
import { parseContentWithCitations, type TextSegment } from '@/lib/citation-parser';

export interface ScoreBreakdownItem {
  id: string;
  label: string;
  score: number;
  description: string;
}

interface Segment {
  text: string;
  sourceIds: number[];
}

export default function ChatMessage({ message }: { message: Msg }) {
  const isUser = message.role === 'user';

  // États locaux
  const [activeModal, setActiveModal] = useState<'sources' | 'score' | null>(null);
  const [highlightEnabled, setHighlightEnabled] = useState(false);
  const [focusedSourceId, setFocusedSourceId] = useState<number | null>(null);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);

  // États Feedback & Actions
  const [hasCopied, setHasCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  // Helper pour récupérer le domaine d'une source
  // Helper pour récupérer les détails d'une source
  const getSourceDetails = (sourceId: number) => {
    if (!transparencyData?.sources) return { name: 'Source inconnue', type: 'GENERAL', domain: '' };
    const source = transparencyData.sources[sourceId - 1];
    return {
      name: source?.name || source?.domain || 'Source web',
      type: source?.type || 'GENERAL',
      domain: source?.domain || '',
      score: source?.score || 50
    };
  };

  // Parsing robuste avec useMemo "Bulletproof"
  const transparencyData = React.useMemo<{
    answer: string;
    sources: any[];
    factScore: number | null;
    scoreBreakdown?: ScoreBreakdownItem[];
    segments?: Segment[];
  } | null>(() => {
    if (isUser) return null;

    // Stratégie "Best Effort" : On prend ce qu'il y a, où qu'il soit.
    let extractedSources: any[] = [];
    let extractedScore: number | null = null;
    let extractedAnswer = message.content;

    // 1. Priorité : Nouvel objet message (API v2)
    if (message.sources && Array.isArray(message.sources)) {
      extractedSources = message.sources;
    }

    // 2. Score : Metadata > Root > Null
    if ((message as any).metadata?.factScore) {
      extractedScore = (message as any).metadata.factScore;
    } else if ((message as any).score) {
      extractedScore = (message as any).score;
    }

    // 3. Fallback Legacy (Si content est JSON)
    if (extractedSources.length === 0) {
      try {
        const parsed = JSON.parse(message.content);
        if (parsed && typeof parsed === 'object') {
          if (parsed.answer) extractedAnswer = parsed.answer;
          if (Array.isArray(parsed.sources)) extractedSources = parsed.sources;
          if (typeof parsed.factScore === 'number') extractedScore = parsed.factScore;
        }
      } catch { /* Not JSON, raw text is kept */ }
    }

    // 4. Calcul Breakdown Dynamique
    const scores = extractedSources.map(s => s.score || 50);
    const avgSourceScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    // Diversité : Ratio domaines uniques / total citations (approx)
    // Ici extractedSources contient déjà les citations unifiées ou une liste. 
    // On va considérer le nombre de sources uniques.
    const uniqueDomains = new Set(extractedSources.map(s => s.domain)).size;
    const diversityScore = Math.min(100, Math.round((uniqueDomains / Math.max(1, 3)) * 100)); // Base 3 sources pour 100%

    const dynamicBreakdown: ScoreBreakdownItem[] = [
      { id: 'src', label: 'Qualité des Sources', score: avgSourceScore, description: 'Moyenne de réputation des domaines cités.' },
      { id: 'div', label: 'Diversité', score: diversityScore, description: `${uniqueDomains} sources uniques identifiées.` },
      { id: 'mdl', label: 'Fiabilité Modèle', score: 90, description: 'Score de confiance IA (Moteur Perplexity).' },
      { id: 'frs', label: 'Fraîcheur', score: 100, description: 'Données récupérées en temps réel.' }
    ];

    return {
      answer: extractedAnswer,
      sources: extractedSources,
      factScore: extractedScore,
      scoreBreakdown: dynamicBreakdown,
      segments: []
    };
  }, [message.content, message.sources, (message as any).metadata, isUser]);

  // Contenu à afficher (texte brut ou response parsée)
  const content = transparencyData ? transparencyData.answer : message.content;



  const handleSourceClick = (sourceIndex: number | null) => {
    if (!sourceIndex) return;
    setFocusedSourceId(sourceIndex);
    setActiveModal('sources');
  };

  const handleCopy = () => {
    const textToCopy = content;
    navigator.clipboard.writeText(textToCopy);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  const handleCreateArticle = () => {
    console.log("Conversion en article...");
  };



  // Safe Segments robustes avec le nouveau parser
  const safeSegments = React.useMemo(() => {
    // 1. Cas Message Mocké (si segments pré-existants)
    if (transparencyData && transparencyData.segments && transparencyData.segments.length > 0) {
      return transparencyData.segments.map((s: any) => ({
        text: s.text,
        citationIds: s.sourceIds ? s.sourceIds : (s.sourceId ? [s.sourceId] : [])
      }));
    }

    // 2. Cas Message Réel : Parsing du texte brut
    if (transparencyData && transparencyData.answer) {
      return parseContentWithCitations(transparencyData.answer);
    }

    // 3. Fallback
    return [{ text: message.content, citationIds: [] }];
  }, [transparencyData, message.content]);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} group mb-6`}>
      {isUser ? (
        <div
          className="
            max-w-[78%] rounded-2xl bg-black px-4 py-2 text-sm text-white
            dark:bg-white dark:text-black
            break-words whitespace-pre-wrap
          "
        >
          {message.content}
        </div>
      ) : (
        <>
          <div className="w-full max-w-[85%] rounded-2xl border border-black/5 bg-neutral-50 p-5 dark:border-white/10 dark:bg-white/5">

            {/* 1. Header (Optionnel) */}
            {transparencyData && (
              <VerificationBlock
                score={transparencyData.factScore}
                sources={transparencyData.sources}
                isHighlighting={highlightEnabled}
                onToggleHighlight={() => setHighlightEnabled(!highlightEnabled)}
                onShowSources={() => setActiveModal('sources')}
                onShowScoreDetails={() => setActiveModal('score')}
              />
            )}

            {/* 2. Body (Markdown / Surlignage) */}
            <div className={`text-sm leading-relaxed text-neutral-800 dark:text-neutral-200 ${transparencyData ? 'mt-4' : ''}`}>
              {transparencyData && highlightEnabled && safeSegments && safeSegments.length > 0 ? (
                // Mode Surlignage
                <div className="whitespace-pre-wrap leading-loose">
                  {safeSegments.map((segment: TextSegment, index: number) => {
                    const hasSources = segment.citationIds.length > 0;
                    const isActive = activeSegmentIndex === index;

                    return (
                      <span
                        key={index}
                        onClick={(e) => {
                          if (!hasSources) return;
                          e.stopPropagation(); // Empêcher la propagation si nécessaire
                          setActiveSegmentIndex(isActive ? null : index);
                        }}
                        className={
                          hasSources
                            ? `px-1.5 py-0.5 mx-1 rounded-md box-decoration-clone transition-all duration-200 cursor-pointer relative
                               ${isActive
                              ? 'bg-emerald-200 text-emerald-950 dark:bg-emerald-500/50 dark:text-white ring-2 ring-emerald-500/20'
                              : 'bg-emerald-100 text-emerald-950 hover:bg-emerald-300 dark:bg-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/50 dark:hover:text-white'
                            }`
                            : ""
                        }
                      >
                        {segment.text}
                        {hasSources && (
                          <span className={`inline-flex items-center gap-0.5 ml-0.5 align-super text-[10px] font-medium ${isActive ? 'opacity-100' : 'opacity-80'}`}>
                            {segment.citationIds.map(id => (
                              <span key={id} className={`px-1 rounded-sm ${isActive ? 'bg-black/10 dark:bg-black/20' : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'}`}>
                                {id}
                              </span>
                            ))}
                          </span>
                        )}

                        {/* Popover / Bulle */}
                        {isActive && (
                          <span
                            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[250px] z-50 animate-in fade-in zoom-in-95 duration-200"
                            onClick={(e) => e.stopPropagation()} // Empêcher de fermer en cliquant dans la bulle
                          >
                            <span className="block bg-neutral-900 text-white text-xs rounded-lg shadow-xl border border-white/10 p-3">
                              <span className="flex flex-col gap-2">
                                {segment.citationIds.map(id => (
                                  <button
                                    key={id}
                                    onClick={() => handleSourceClick(id)}
                                    className="flex items-center gap-2 hover:bg-white/10 p-1.5 rounded transition-colors text-left group"
                                  >
                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] text-emerald-400 font-medium group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                                      {id}
                                    </span>
                                    <span className="flex flex-col text-left max-w-[180px]">
                                      <span className="truncate font-medium text-gray-200 group-hover:text-white text-[11px]">
                                        {getSourceDetails(id).name}
                                      </span>
                                      <div className='flex items-center gap-1.5'>
                                        <span className="text-[9px] text-gray-500 group-hover:text-gray-400 truncate">
                                          {getSourceDetails(id).domain}
                                        </span>
                                        {/* Badge Type */}
                                        {(() => {
                                          const type = getSourceDetails(id).type;
                                          let badgeColor = "bg-neutral-800 text-gray-400";
                                          let label = "Web";

                                          if (type === 'MEDIA') { badgeColor = "bg-blue-900/30 text-blue-300 border border-blue-500/20"; label = "Média"; }
                                          if (type === 'GOVERNMENT') { badgeColor = "bg-purple-900/30 text-purple-300 border border-purple-500/20"; label = "Officiel"; }
                                          if (type === 'ACADEMIC') { badgeColor = "bg-indigo-900/30 text-indigo-300 border border-indigo-500/20"; label = "Académique"; }
                                          if (type === 'SOCIAL') { badgeColor = "bg-orange-900/30 text-orange-300 border border-orange-500/20"; label = "Social"; }

                                          return <span className={`text-[8px] px-1 py-0 rounded ${badgeColor}`}>{label}</span>
                                        })()}
                                      </div>
                                    </span>
                                  </button>
                                ))}
                              </span>
                              {/* Petite flèche CSS */}
                              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-neutral-900 border-r border-b border-white/10 rotate-45"></span>
                            </span>
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              ) : (
                // Mode Texte Normal
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown
                    components={{
                      p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                      a: ({ node, ...props }) => <a className="text-teal-600 dark:text-teal-400 hover:underline" {...props} />,
                      ul: ({ node, ...props }) => <ul className="list-disc pl-4" {...props} />,
                      ol: ({ node, ...props }) => <ol className="list-decimal pl-4" {...props} />,
                    }}
                  >
                    {content}
                  </ReactMarkdown>
                </div>
              )}
            </div>

            {/* 3. Footer (Actions) */}
            <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-4 dark:border-white/5">
              <div className="flex items-center gap-1">
                <button onClick={handleCopy} className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200 transition-colors" title="Copier">
                  {hasCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </button>
                <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-white/10"></div>
                <button onClick={() => setFeedback(feedback === 'up' ? null : 'up')} className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${feedback === 'up' ? 'text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-500/10' : 'text-gray-400 hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200'}`}>
                  <ThumbsUp className={`h-4 w-4 ${feedback === 'up' ? 'fill-current' : ''}`} />
                </button>
                <button onClick={() => setFeedback(feedback === 'down' ? null : 'down')} className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${feedback === 'down' ? 'text-red-500 bg-red-50 dark:text-red-400 dark:bg-red-500/10' : 'text-gray-400 hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200'}`}>
                  <ThumbsDown className={`h-4 w-4 ${feedback === 'down' ? 'fill-current' : ''}`} />
                </button>
              </div>

              <div className="ml-auto flex items-center gap-2">
                {/* Menu Options */}
                <div className="relative">
                  {showOptions && (
                    <div className="fixed inset-0 z-10" onClick={() => setShowOptions(false)} />
                  )}
                  <button onClick={() => setShowOptions(!showOptions)} className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200 transition-colors" title="Plus d'options">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {showOptions && (
                    <div className="absolute bottom-full right-0 mb-2 w-48 overflow-hidden rounded-xl border border-black/5 bg-white p-1 shadow-xl dark:border-white/5 dark:bg-[#1A1A1A] z-20 animate-in fade-in zoom-in-95 duration-100">
                      <button onClick={() => { setIsBookmarked(!isBookmarked); setShowOptions(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/5 transition-colors">
                        <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-amber-500 text-amber-500' : 'text-gray-400'}`} />
                        <span className={isBookmarked ? 'text-amber-600 dark:text-amber-500' : ''}>{isBookmarked ? 'Sauvegardé' : 'Sauvegarder'}</span>
                      </button>
                      <button onClick={() => { console.log('Partager'); setShowOptions(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/5 transition-colors">
                        <Share2 className="h-4 w-4 text-gray-400" />
                        <span>Partager</span>
                      </button>
                      <button onClick={() => { console.log('Signaler'); setShowOptions(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 transition-colors">
                        <Flag className="h-4 w-4" />
                        <span>Signaler</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Bouton Principal : Transformer en Article */}
                <button
                  onClick={handleCreateArticle}
                  className="flex items-center gap-2 rounded-lg border border-black/10 bg-black/5 px-3 py-1.5 text-xs font-medium text-neutral-700 transition-all hover:bg-black/10 hover:text-black group dark:border-white/10 dark:bg-white/5 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <FileText className="w-3.5 h-3.5 text-neutral-500 transition-colors group-hover:text-emerald-500 dark:text-neutral-400 dark:group-hover:text-emerald-400" />
                  <span>Transformer en Article</span>
                </button>
              </div>
            </div>
          </div>

          {/* Modal Transparence */}
          {transparencyData && (
            <>
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
                  {( // Sources List rendering unconditionaly inside Modal
                    <div className="flex flex-col space-y-3 h-full overflow-y-auto pr-2 pb-4">
                      {transparencyData.sources.map((s: any, index: number) => {
                        // Mapping Backend -> UI SourceCard
                        const uiSource = {
                          ...s,
                          // Force Explicit Mapping for V2 Data
                          metrics: s.metrics || null,
                          flags: s.flags || null,
                          justification: s.justification || null,

                          category: s.type || 'GENERAL',
                          // Description par défaut selon le type si absente
                          description: s.description || (s.type === 'MEDIA' ? 'Média de référence international.' :
                            s.type === 'GOVERNMENT' ? 'Source officielle gouvernementale.' :
                              s.type === 'ACADEMIC' ? 'Publication académique ou scientifique.' :
                                s.type === 'SOCIAL' ? 'Contenu issu des réseaux sociaux.' :
                                  'Source identifiée sur le web.'),
                          criteria: s.criteria || []
                        };
                        return (
                          <div key={s.id || index}>
                            <SourceCard source={uiSource} isFocused={s.id === focusedSourceId} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  < div style={{ display: 'none' }} className="space-y-6 max-w-2xl mx-auto py-4">
                    {/* Score Global */}
                    <div className="flex flex-col items-center justify-center p-8 border-b border-gray-100 dark:border-neutral-800 mb-8">
                      <div className="font-serif text-2xl font-normal text-gray-900 dark:text-white mb-2">Score de Fiabilité Global</div>
                      <div className="font-serif text-6xl text-[#0D9488] dark:text-teal-400">
                        {transparencyData.factScore}
                        <span className="text-2xl text-gray-400 dark:text-gray-500 align-top ml-1">%</span>
                      </div>
                    </div>

                    {/* Liste des Jauges de Confiance (Design Épuré) */}
                    <div className="space-y-6 mt-8">
                      {(() => {
                        const safeBreakdown = transparencyData.scoreBreakdown || [];

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

                </div>
              </Modal>

              {/* Nouveau Modal TrustScore V2 */}
              {activeModal === 'score' && (
                <TrustScoreModal
                  isOpen={true}
                  onClose={() => setActiveModal(null)}
                  trustData={{
                    globalScore: transparencyData.factScore || 50,
                    confidenceLevel: (transparencyData.sources[0]?.confidence as any) || 'LOW',
                    details: transparencyData.sources[0]?.metrics || { transparency: 0, editorial: 0, semantic: 0, ux: 0 },
                    flags: transparencyData.sources[0]?.flags || { isPlatform: false, hasFactCheckFailures: false, isAdsTxtValid: false },
                    metadata: {
                      name: "Analyse Agrégée",
                      justification: transparencyData.sources.map((s: any) => s.justification).filter(Boolean).join(' ') || "Analyse basée sur les sources citées.",
                      biasLevel: transparencyData.sources[0]?.biasLevel || 'UNKNOWN'
                    },
                    sourceCount: transparencyData.sources.length
                  }}
                />
              )}
            </>
          )}
        </>
      )}
    </div >
  );
}

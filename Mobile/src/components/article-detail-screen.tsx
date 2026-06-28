import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronLeft, Forward, Heart, Highlighter, MessageSquare, Info, Star, ThumbsUp, ThumbsDown, Repeat2, X } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { Fonts, FontSize, Radius, Spacing } from '@/constants/theme';
import {
  WEB_ORIGIN,
  fetchArticleComments,
  fetchArticleInteractions,
  fetchArticleReactions,
  fetchArticleStats,
  fetchFavoriteArticleIds,
  postArticleComment,
  submitArticleContribution,
  submitArticleOpinionPosition,
  recordArticleView,
  removeFavoriteArticle,
  saveFavoriteArticle,
  createChatSession,
  toggleArticleContributionValidation,
  toggleArticleReaction,
  toggleArticleRepost,
  updateContributionTree,
} from '@/lib/api';
import type {
  ArticleComment,
  ArticleContribution,
  ArticleContributionType,
  ArticleDetail,
  ArticleInteractions,
  ArticleInteractionsSortMode,
  ArticleReactionSummary,
  ArticleSource,
  ArticleValidationType,
} from '@/types/article';

// --- CONSTANTS ---

type ArticleDetailScreenProps = {
  loadArticle: () => Promise<ArticleDetail | null>;
  missingText?: string;
};

const EMPTY_REACTIONS: ArticleReactionSummary = {
  likes: 0,
  dislikes: 0,
  reposts: 0,
  userReaction: null,
  userReposted: false,
};
const POSITION_VALUES = [-1, -0.6, -0.2, 0.2, 0.6, 1];
const EMPTY_ADVANCED_INTERACTIONS: ArticleInteractions = {
  opinionQuestion: null,
  allowedPositions: POSITION_VALUES,
  currentUserOpinionPosition: null,
  hasInsufficientContext: false,
  canContribute: false,
  canValidateContributions: false,
  opinionDistribution: {
    counts: Object.fromEntries(POSITION_VALUES.map((position) => [String(position), 0])),
    total: 0,
    lacksContextCount: 0,
  },
  contributions: [],
};
const POSITION_LABELS: Record<string, string> = {
  '-1': 'Fortement A',
  '-0.6': 'Modérément A',
  '-0.2': 'Légèrement A',
  '0.2': 'Légèrement B',
  '0.6': 'Modérément B',
  '1': 'Fortement B',
};

const CONTRIBUTION_TYPES: Array<{
  type: ArticleContributionType;
  label: string;
  help: string;
  colors: { border: string; bg: string; text: string };
}> = [
  { type: 'SOURCE', label: 'Source', help: 'Ajouter une source vérifiable.', colors: { border: '#BFDBFE', bg: '#EFF6FF', text: '#1D4ED8' } },
  { type: 'NUANCE', label: 'Nuance', help: 'Ajouter du contexte ou une distinction.', colors: { border: '#FDE68A', bg: '#FFFBEB', text: '#92400E' } },
  { type: 'CONTRADICTION', label: 'Contradiction', help: 'Signaler un conflit avec un élément.', colors: { border: '#FECACA', bg: '#FEF2F2', text: '#B91C1C' } },
  { type: 'QUESTION', label: 'Question', help: 'Ouvrir un point précis à clarifier.', colors: { border: '#BAE6FD', bg: '#F0F9FF', text: '#0369A1' } },
  { type: 'CORRECTION', label: 'Correction', help: 'Proposer une correction factuelle.', colors: { border: '#A7F3D0', bg: '#ECFDF5', text: '#065F46' } },
];

const VALIDATION_TYPES: Array<{ type: ArticleValidationType; label: string }> = [
  { type: 'WELL_SOURCED', label: 'Bien sourcé' },
  { type: 'ADDS_NUANCE', label: 'Nuance' },
  { type: 'NEEDS_CHECK', label: 'À vérifier' },
];

const EPION_GREEN = '#00dc82';

// --- HELPERS ---

function formatDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function scoreStatusLabel(status?: string): string | undefined {
  if (!status || status === 'COMPLETED') return undefined;
  if (status === 'PENDING') return 'Analyse en attente';
  if (status === 'RUNNING') return 'Analyse en cours';
  if (status === 'FAILED') return 'Analyse indisponible';
  if (status === 'STALE') return 'Score basé sur une version précédente';
  return status;
}

function getScoreColor(score: number | undefined): string {
  if (score === undefined) return '#888888';
  if (score >= 80) return '#10B981';
  if (score >= 45) return '#EAB308';
  if (score >= 20) return '#F97316';
  return '#EF4444';
}

function getScoreLabel(score: number | undefined): string {
  if (score === undefined) return 'Non évalué';
  if (score >= 80) return 'Fiable';
  if (score >= 45) return 'Moyen';
  if (score >= 20) return 'Faible';
  return 'Critique';
}

function getSupportLabel(score: number | undefined): string {
  if (score === undefined) return 'Appui non évalué';
  if (score >= 90) return 'Très solide';
  if (score >= 70) return 'Solide';
  if (score >= 50) return 'À nuancer';
  if (score >= 30) return 'Fragile';
  return 'À vérifier';
}

function contributionAuthorLabel(contribution: ArticleContribution): string {
  return contribution.author?.name ?? contribution.author?.username ?? 'Contributeur Epion';
}

function getContributionTypeInfo(type: ArticleContributionType) {
  return CONTRIBUTION_TYPES.find((item) => item.type === type) ?? CONTRIBUTION_TYPES[1];
}

function validUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

const CITATION_RE = /\[\d+(?:,\s*\d+)*\]/;
const HIGHLIGHT_STYLE = { backgroundColor: '#00dc8230', borderLeftWidth: 3, borderLeftColor: '#00dc82', paddingLeft: 8, paddingVertical: 2, borderRadius: 4 } as const;

function renderMarkdownContent(body: string, textColor: string, headingColor: string, mutedColor: string, _borderColor: string, highlightSources?: boolean): React.ReactNode[] {
  const lines = body.split('\n');
  const elements: React.ReactNode[] = [];
  let blockquoteBuffer: string[] = [];
  let listBuffer: string[] = [];

  const flushBlockquote = () => {
    if (blockquoteBuffer.length === 0) return;
    elements.push(
      <View key={`bq-${elements.length}`} style={[ms.blockquote, { borderLeftColor: EPION_GREEN + '60' }]}>
        <Text style={[ms.blockquoteText, { color: mutedColor }]}>{blockquoteBuffer.join('\n')}</Text>
      </View>,
    );
    blockquoteBuffer = [];
  };

  const flushList = () => {
    if (listBuffer.length === 0) return;
    elements.push(
      <View key={`list-${elements.length}`} style={ms.list}>
        {listBuffer.map((item, i) => (
          <View key={i} style={ms.listItem}>
            <Text style={[ms.listBullet, { color: EPION_GREEN }]}>•</Text>
            <Text style={[ms.listItemText, { color: textColor }]}>{item}</Text>
          </View>
        ))}
      </View>,
    );
    listBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('> ')) {
      flushList();
      blockquoteBuffer.push(trimmed.slice(2));
      continue;
    }
    flushBlockquote();

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
      const content = trimmed.replace(/^[-*]\s|^\d+\.\s/, '');
      listBuffer.push(content);
      continue;
    }
    flushList();

    if (trimmed === '') {
      continue;
    }

    if (trimmed.startsWith('### ')) {
      elements.push(<Text key={`h3-${i}`} style={[ms.h3, { color: headingColor }]}>{trimmed.slice(4)}</Text>);
    } else if (trimmed.startsWith('## ')) {
      elements.push(<Text key={`h2-${i}`} style={[ms.h2, { color: headingColor, fontFamily: Fonts.display }]}>{trimmed.slice(3)}</Text>);
    } else if (trimmed.startsWith('# ')) {
      elements.push(<Text key={`h1-${i}`} style={[ms.h1, { color: headingColor, fontFamily: Fonts.display }]}>{trimmed.slice(2)}</Text>);
    } else {
      const cleaned = trimmed
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1');
      const hasCitation = CITATION_RE.test(trimmed);
      const hlStyle = highlightSources && hasCitation ? HIGHLIGHT_STYLE : null;
      elements.push(
        <View key={`pw-${i}`} style={hlStyle}>
          <Text style={[ms.paragraph, { color: textColor }]}>{cleaned}</Text>
        </View>,
      );
    }
  }
  flushBlockquote();
  flushList();
  return elements;
}

// --- MAIN COMPONENT ---

export function ArticleDetailScreenContent({ loadArticle, missingText = 'Aucun détail disponible pour cet article.' }: ArticleDetailScreenProps) {
  const router = useRouter();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [reactions, setReactions] = useState<ArticleReactionSummary>(EMPTY_REACTIONS);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [comments, setComments] = useState<ArticleComment[]>([]);
  const [commentsCursor, setCommentsCursor] = useState<string | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [interactionMessage, setInteractionMessage] = useState<string | null>(null);
  const [advancedInteractions, setAdvancedInteractions] = useState<ArticleInteractions | null>(null);
  const [advancedSort, setAdvancedSort] = useState<ArticleInteractionsSortMode>('top');
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [advancedError, setAdvancedError] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [lacksContext, setLacksContext] = useState(false);
  const [isSubmittingPosition, setIsSubmittingPosition] = useState(false);
  const [contributionType, setContributionType] = useState<ArticleContributionType>('NUANCE');
  const [contributionText, setContributionText] = useState('');
  const [contributionSourceUrl, setContributionSourceUrl] = useState('');
  const [contributionTargetId, setContributionTargetId] = useState<string | null>(null);
  const [isSubmittingContribution, setIsSubmittingContribution] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [toolbarPanel, setToolbarPanel] = useState<'interactions' | 'share' | 'info' | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [isHighlightActive, setIsHighlightActive] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // --- DATA LOADING ---

  const loadComments = useCallback(async (articleId: string, cursor?: string | null) => {
    setCommentsLoading(true);
    setCommentError(null);
    try {
      const page = await fetchArticleComments(articleId, cursor ?? null);
      setComments((current) => (cursor ? [...current, ...page.items] : page.items));
      setCommentsCursor(page.nextCursor);
    } catch {
      if (!cursor) setComments([]);
      setCommentError('Commentaires indisponibles pour le moment.');
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  const loadAdvancedInteractions = useCallback(async (targetArticle: ArticleDetail, sort: ArticleInteractionsSortMode = advancedSort) => {
    const articleSlug = targetArticle.slug ?? targetArticle.id;
    setAdvancedLoading(true);
    setAdvancedError(null);
    try {
      const data = await fetchArticleInteractions(articleSlug, sort);
      setAdvancedInteractions(data);
      setSelectedPosition(data.currentUserOpinionPosition?.selectedPosition ?? null);
      setLacksContext(data.currentUserOpinionPosition?.lacksContext ?? false);
    } catch {
      setAdvancedInteractions(null);
      setAdvancedError("Contributions et carte d'opinion indisponibles pour le moment.");
    } finally {
      setAdvancedLoading(false);
    }
  }, [advancedSort]);

  const hydrateInteractions = useCallback(
    async (nextArticle: ArticleDetail) => {
      setInteractionMessage(null);
      setReactionError(null);
      void fetchFavoriteArticleIds()
        .then((ids) => setIsSaved(ids.includes(nextArticle.id)))
        .catch(() => setIsSaved(false));
      void fetchArticleReactions(nextArticle.id)
        .then(setReactions)
        .catch(() => setReactionError('Réactions indisponibles pour le moment.'));
      void loadComments(nextArticle.id, null);
      void loadAdvancedInteractions(nextArticle);
    },
    [loadAdvancedInteractions, loadComments],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setComments([]);
    setCommentsCursor(null);
    setReactions(EMPTY_REACTIONS);
    setIsSaved(false);
    setAdvancedInteractions(null);
    setAdvancedError(null);
    try {
      const nextArticle = await loadArticle();
      setArticle(nextArticle);
      if (nextArticle?.id) {
        void recordArticleView(nextArticle.id);
        void fetchArticleStats(nextArticle.id).then((stats) => {
          if (typeof stats.viewsAll === 'number') {
            setArticle((current) => (current?.id === nextArticle.id ? { ...current, viewsAll: stats.viewsAll } : current));
          }
        });
        void hydrateInteractions(nextArticle);
      }
    } catch {
      setArticle(null);
      setError('Impossible de charger cet article pour le moment.');
    } finally {
      setIsLoading(false);
    }
  }, [hydrateInteractions, loadArticle]);

  useEffect(() => {
    void load();
  }, [load]);

  // --- DERIVED STATE ---

  const publishedAt = formatDate(article?.publishedAt);
  const statusLabel = scoreStatusLabel(article?.factCheckStatus);
  const shareUrl = useMemo(() => {
    if (!article) return WEB_ORIGIN;
    return `${WEB_ORIGIN}/article/${article.slug ?? article.id}`;
  }, [article]);

  const visibleAdvancedInteractions = advancedInteractions ?? (!advancedLoading ? EMPTY_ADVANCED_INTERACTIONS : null);
  const confirmedPosition = visibleAdvancedInteractions?.currentUserOpinionPosition ?? null;
  const canContribute = visibleAdvancedInteractions?.canContribute === true;
  const canValidate = visibleAdvancedInteractions?.canValidateContributions === true;
  const distribution = visibleAdvancedInteractions?.opinionDistribution;
  const maxOpinionCount = Math.max(1, ...POSITION_VALUES.map((pos) => distribution?.counts[String(pos)] ?? 0));

  // --- ACTIONS ---

  const toggleSave = useCallback(async () => {
    if (!article?.id || isSaving) return;
    const previous = isSaved;
    setIsSaving(true);
    setInteractionMessage(null);
    setIsSaved(!previous);
    try {
      if (previous) await removeFavoriteArticle(article.id);
      else await saveFavoriteArticle(article.id);
    } catch {
      setIsSaved(previous);
      setInteractionMessage('Connexion requise ou sauvegarde indisponible.');
    } finally {
      setIsSaving(false);
    }
  }, [article?.id, isSaved, isSaving]);

  const react = useCallback(
    async (type: 'LIKE' | 'DISLIKE') => {
      if (!article?.id) return;
      const previous = reactions;
      setReactionError(null);
      setReactions((current) => {
        const hadSame = current.userReaction === type;
        const hadOther = current.userReaction && current.userReaction !== type;
        return {
          ...current,
          userReaction: hadSame ? null : type,
          likes: type === 'LIKE' ? current.likes + (hadSame ? -1 : 1) : current.likes + (hadOther ? -1 : 0),
          dislikes: type === 'DISLIKE' ? current.dislikes + (hadSame ? -1 : 1) : current.dislikes + (hadOther ? -1 : 0),
        };
      });
      try {
        setReactions(await toggleArticleReaction(article.id, type));
      } catch {
        setReactions(previous);
        setReactionError('Connexion requise ou réaction indisponible.');
      }
    },
    [article?.id, reactions],
  );

  const submitComment = useCallback(async () => {
    if (!article?.id || !commentText.trim() || isPostingComment) return;
    setIsPostingComment(true);
    setCommentError(null);
    try {
      const created = await postArticleComment(article.id, commentText.trim());
      setComments((current) => [created, ...current]);
      setCommentText('');
    } catch {
      setCommentError('Connexion requise ou commentaire indisponible.');
    } finally {
      setIsPostingComment(false);
    }
  }, [article?.id, commentText, isPostingComment]);

  const confirmOpinionPosition = useCallback(async () => {
    if (!article || confirmedPosition || isSubmittingPosition) return;
    if (selectedPosition === null && !lacksContext) {
      setAdvancedError('Choisissez une position ou indiquez un manque de contexte.');
      return;
    }
    setIsSubmittingPosition(true);
    setAdvancedError(null);
    try {
      const result = await submitArticleOpinionPosition(article.slug ?? article.id, selectedPosition, lacksContext);
      setAdvancedInteractions((current) => current ? {
        ...current,
        currentUserOpinionPosition: result.position,
        canContribute: result.canContribute,
        canValidateContributions: result.canValidateContributions,
      } : current);
    } catch {
      setAdvancedError('Connexion requise ou position déjà confirmée.');
      void loadAdvancedInteractions(article);
    } finally {
      setIsSubmittingPosition(false);
    }
  }, [article, confirmedPosition, isSubmittingPosition, lacksContext, loadAdvancedInteractions, selectedPosition]);

  const submitContribution = useCallback(async () => {
    if (!article || isSubmittingContribution) return;
    const text = contributionText.trim();
    const sourceUrl = contributionSourceUrl.trim();
    const requiresSource = contributionType === 'SOURCE' || contributionTargetId !== null;
    if (requiresSource && !sourceUrl) {
      setAdvancedError('Une URL de source est requise pour ce type de contribution.');
      return;
    }
    if (contributionType !== 'SOURCE' && !text) {
      setAdvancedError('Écrivez une contribution avant de publier.');
      return;
    }
    if (sourceUrl && !validUrl(sourceUrl)) {
      setAdvancedError("L'URL doit commencer par http:// ou https://.");
      return;
    }
    setIsSubmittingContribution(true);
    setAdvancedError(null);
    try {
      const created = await submitArticleContribution(article.slug ?? article.id, contributionType, text || ' ', sourceUrl || undefined, contributionTargetId || undefined);
      setAdvancedInteractions((current) => {
        if (!current) return current;
        if (!created.targetContributionId) return { ...current, contributions: [created, ...current.contributions] };
        return {
          ...current,
          contributions: current.contributions.map((c) => c.id === created.targetContributionId ? { ...c, children: [...c.children, created] } : c),
        };
      });
      setContributionText('');
      setContributionSourceUrl('');
      setContributionTargetId(null);
      setContributionType('NUANCE');
    } catch {
      setAdvancedError("Connexion requise ou contribution refusée par l'API.");
    } finally {
      setIsSubmittingContribution(false);
    }
  }, [article, contributionSourceUrl, contributionTargetId, contributionText, contributionType, isSubmittingContribution]);

  const validateContribution = useCallback(async (contributionId: string, type: ArticleValidationType) => {
    if (!canValidate) {
      setAdvancedError('Confirmez une position avant de valider les contributions.');
      return;
    }
    const previous = advancedInteractions;
    setAdvancedError(null);
    setAdvancedInteractions((current) => current ? {
      ...current,
      contributions: updateContributionTree(current.contributions, contributionId, (c) => {
        const hadIt = c.currentUserValidations.includes(type);
        return {
          ...c,
          currentUserValidations: hadIt ? c.currentUserValidations.filter((v) => v !== type) : [...c.currentUserValidations, type],
          validationSummary: { ...c.validationSummary, [type]: Math.max(0, c.validationSummary[type] + (hadIt ? -1 : 1)) },
        };
      }),
    } : current);
    try {
      const result = await toggleArticleContributionValidation(contributionId, type);
      setAdvancedInteractions((current) => current ? {
        ...current,
        contributions: updateContributionTree(current.contributions, contributionId, (c) => ({
          ...c,
          validationSummary: result.validationSummary,
          currentUserValidations: result.action === 'ADDED'
            ? [...c.currentUserValidations.filter((v) => v !== type), type]
            : c.currentUserValidations.filter((v) => v !== type),
        })),
      } : current);
    } catch {
      setAdvancedInteractions(previous);
      setAdvancedError('Validation impossible: connexion requise ou contribution non éligible.');
    }
  }, [advancedInteractions, canValidate]);

  const changeAdvancedSort = useCallback((sort: ArticleInteractionsSortMode) => {
    setAdvancedSort(sort);
    if (article) void loadAdvancedInteractions(article, sort);
  }, [article, loadAdvancedInteractions]);

  const shareArticle = useCallback(async () => {
    if (!article) return;
    try {
      await Share.share({ title: article.title, message: `${article.title}\n${shareUrl}`, url: shareUrl });
    } catch {
      setInteractionMessage('Partage indisponible sur cet appareil.');
    }
  }, [article, shareUrl]);

  const openShareDestination = useCallback((url: string) => {
    void Linking.openURL(url);
  }, []);

  const copyShareUrl = useCallback(async () => {
    try {
      await Share.share({ message: shareUrl, url: shareUrl });
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    setTimeout(() => setCopyState('idle'), 1800);
  }, [shareUrl]);

  const toggleRepost = useCallback(async () => {
    if (!article?.id) return;
    const previous = reactions;
    const wasReposted = reactions.userReposted;
    setReactions((current) => ({
      ...current,
      userReposted: !wasReposted,
      reposts: wasReposted ? Math.max(0, current.reposts - 1) : current.reposts + 1,
    }));
    try {
      await toggleArticleRepost(article.id);
    } catch {
      setReactions(previous);
      setReactionError('Connexion requise ou repost indisponible.');
    }
  }, [article?.id, reactions]);

  const openChatWithArticle = useCallback(async () => {
    if (!article || isChatLoading) return;
    setIsChatLoading(true);
    try {
      const session = await createChatSession({ title: article.title, mode: 'balanced' });
      router.push({ pathname: '/chat/[id]', params: { id: session.id } });
    } catch {
      setInteractionMessage('Connexion requise pour le chat.');
    } finally {
      setIsChatLoading(false);
    }
  }, [article, isChatLoading, router]);

  // --- RENDER HELPERS ---

  const renderSource = (source: ArticleSource, index: number) => {
    const scoreColor = getScoreColor(source.trustScore);
    return (
      <Pressable
        key={source.id ?? source.url ?? `${source.domain}-${index}`}
        style={[s.sourceItem, { borderColor: colors.border, backgroundColor: colors.backgroundElevated }]}
        onPress={() => { if (source.url) void Linking.openURL(source.url); }}
      >
        <View style={s.sourceRow}>
          <View style={[s.sourceFavicon, { backgroundColor: colors.backgroundSubtle }]}>
            <Text style={[s.sourceFaviconText, { color: colors.textMuted }]}>{(source.name || source.domain || '?')[0].toUpperCase()}</Text>
          </View>
          <View style={s.sourceInfo}>
            <Text style={[s.sourceDomain, { color: colors.text }]} numberOfLines={1}>{source.name || source.domain}</Text>
            <Text style={[s.sourceDomainSub, { color: colors.textMuted }]} numberOfLines={1}>{source.domain}</Text>
          </View>
          {typeof source.trustScore === 'number' ? (
            <View style={[s.scorePill, { backgroundColor: scoreColor }]}>
              <Text style={s.scorePillText}>{source.trustScore}%</Text>
            </View>
          ) : null}
        </View>
        {source.description ? <Text style={[s.sourceDesc, { color: colors.textTertiary }]} numberOfLines={2}>{source.description}</Text> : null}
        {source.type ? <Text style={[s.sourceType, { color: colors.textMuted }]}>{source.type}</Text> : null}
      </Pressable>
    );
  };

  const renderContribution = (contribution: ArticleContribution) => {
    const typeInfo = getContributionTypeInfo(contribution.type);
    const positive = contribution.validationSummary.WELL_SOURCED + contribution.validationSummary.ADDS_NUANCE;
    const needsCheck = contribution.validationSummary.NEEDS_CHECK;
    const isContested = needsCheck >= 3 && needsCheck > positive;

    return (
      <View key={contribution.id} style={[s.contributionCard, { borderColor: isContested ? '#F59E0B80' : colors.border, backgroundColor: colors.backgroundElevated }]}>
        {/* Header */}
        <View style={s.contributionHeader}>
          <View style={[s.contributionAvatar, { backgroundColor: colors.backgroundSubtle }]}>
            <Text style={[s.contributionAvatarText, { color: colors.textTertiary }]}>{(contributionAuthorLabel(contribution))[0]?.toUpperCase()}</Text>
          </View>
          <View style={s.contributionMeta}>
            <Text style={[s.contributionAuthor, { color: colors.text }]}>{contributionAuthorLabel(contribution)}</Text>
            <View style={s.contributionTypeBadgeRow}>
              <View style={[s.typeBadgeInline, { backgroundColor: typeInfo.colors.bg, borderColor: typeInfo.colors.border }]}>
                <Text style={[s.typeBadgeInlineText, { color: typeInfo.colors.text }]}>{typeInfo.label}</Text>
              </View>
              {contribution.editCount > 0 ? <Text style={[s.contributionEdited, { color: colors.textMuted }]}>Modifié</Text> : null}
            </View>
          </View>
        </View>

        {/* Contested warning */}
        {isContested ? (
          <View style={[s.contestedBanner, { backgroundColor: '#FFFBEB', borderColor: '#F59E0B60' }]}>
            <Text style={s.contestedIcon}>⚠</Text>
            <Text style={s.contestedText}>Cette contribution nécessite une vérification selon la communauté.</Text>
          </View>
        ) : null}

        {/* Body */}
        {contribution.text.trim() ? (
          <Text style={[s.contributionBody, { color: colors.text }]}>{contribution.text}</Text>
        ) : (
          <Text style={[s.contributionBody, { color: colors.textMuted, fontStyle: 'italic' }]}>Source proposée sans commentaire.</Text>
        )}

        {/* Source link */}
        {contribution.sourceUrl ? (
          <Pressable style={[s.sourceLink, { borderColor: colors.border, backgroundColor: colors.backgroundSubtle }]} onPress={() => contribution.sourceUrl && void Linking.openURL(contribution.sourceUrl)}>
            <View style={[s.sourceLinkDot, { backgroundColor: typeInfo.colors.text }]} />
            <Text style={[s.sourceLinkText, { color: colors.text }]} numberOfLines={1}>{contribution.sourceUrl.replace(/^https?:\/\/(www\.)?/, '')}</Text>
            <Text style={[s.sourceLinkArrow, { color: colors.textMuted }]}>↗</Text>
          </Pressable>
        ) : null}

        {/* Validation buttons (only WELL_SOURCED + ADDS_NUANCE for main contributions) */}
        <View style={s.validationRow}>
          {VALIDATION_TYPES.filter((v) => v.type !== 'NEEDS_CHECK').map((v) => {
            const isActive = contribution.currentUserValidations.includes(v.type);
            const count = contribution.validationSummary[v.type];
            return (
              <Pressable
                key={v.type}
                style={[s.validationPill, {
                  borderColor: isActive ? `${EPION_GREEN}66` : colors.border,
                  backgroundColor: isActive ? `${EPION_GREEN}12` : 'transparent',
                }]}
                disabled={!canValidate}
                onPress={() => void validateContribution(contribution.id, v.type)}
              >
                <Text style={[s.validationPillText, { color: isActive ? '#065F46' : colors.textTertiary }]}>
                  {v.label}{count > 0 ? ` ${count}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Context reply */}
        {canValidate ? (
          <Pressable
            style={[s.contextReplyBtn, { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }]}
            onPress={() => { setContributionTargetId(contribution.id); setContributionType('CORRECTION'); setContributionText(''); setContributionSourceUrl(''); }}
          >
            <Text style={[s.contextReplyText, { color: '#92400E' }]}>＋ Ajouter un contexte</Text>
          </Pressable>
        ) : null}

        {/* Best community note (highest validation count, min 2 validations) */}
        {(() => {
          const bestNote = [...contribution.children]
            .filter((note) => {
              const total = note.validationSummary.WELL_SOURCED + note.validationSummary.ADDS_NUANCE + note.validationSummary.NEEDS_CHECK;
              return total >= 2;
            })
            .sort((a, b) => {
              const aTotal = a.validationSummary.WELL_SOURCED + a.validationSummary.ADDS_NUANCE;
              const bTotal = b.validationSummary.WELL_SOURCED + b.validationSummary.ADDS_NUANCE;
              return bTotal - aTotal;
            })[0] ?? null;
          if (!bestNote) return null;
          return (
            <View style={[s.childNote, { borderColor: '#BAE6FD', backgroundColor: '#F0F9FF' }]}>
              <Text style={s.childNoteLabel}>NOTE COMMUNAUTAIRE</Text>
              <Text style={[s.childNoteBody, { color: colors.text }]}>{bestNote.text}</Text>
              {bestNote.sourceUrl ? (
                <Pressable onPress={() => bestNote.sourceUrl && void Linking.openURL(bestNote.sourceUrl)}>
                  <Text style={s.childNoteLink}>{bestNote.sourceUrl.replace(/^https?:\/\/(www\.)?/, '')}</Text>
                </Pressable>
              ) : null}
              <View style={s.validationRow}>
                {VALIDATION_TYPES.map((v) => {
                  const isActive = bestNote.currentUserValidations.includes(v.type);
                  const count = bestNote.validationSummary[v.type];
                  return (
                    <Pressable
                      key={v.type}
                      style={[s.validationPill, {
                        borderColor: isActive ? '#7DD3FC' : '#BAE6FD',
                        backgroundColor: isActive ? '#E0F2FE' : 'transparent',
                      }]}
                      disabled={!canValidate}
                      onPress={() => void validateContribution(bestNote.id, v.type)}
                    >
                      <Text style={[s.validationPillText, { color: isActive ? '#0369A1' : '#0369A1' }]}>
                        {v.label}{count > 0 ? ` ${count}` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })()}
      </View>
    );
  };

  // --- MAIN RENDER ---

  return (
    <View style={[s.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[s.content, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={s.centerBox}>
            <ActivityIndicator size="large" color={colors.textMuted} />
            <Text style={[s.loadingText, { color: colors.textMuted }]}>Chargement...</Text>
          </View>
        ) : null}

        {!isLoading && error ? (
          <View style={[s.errorBox, { borderColor: colors.border, backgroundColor: colors.backgroundSubtle }]}>
            <Text style={[s.errorText, { color: colors.error }]}>{error}</Text>
            <Pressable style={[s.retryBtn, { backgroundColor: colors.primary }]} onPress={load}>
              <Text style={[s.retryBtnText, { color: colors.background }]}>Réessayer</Text>
            </Pressable>
          </View>
        ) : null}

        {!isLoading && !error && !article ? (
          <View style={s.centerBox}>
            <Text style={[s.emptyText, { color: colors.textMuted }]}>{missingText}</Text>
          </View>
        ) : null}

        {!isLoading && !error && article ? (
          <>
            {/* ========== ARTICLE CONTENT ========== */}
            <View style={s.articleBody}>

              {/* Hero image */}
              {article.imageUrl ? (
                <View style={[s.imageWrap, { borderColor: colors.borderSubtle }]}>
                  <Image source={{ uri: article.imageUrl }} style={s.heroImage} contentFit="cover" />
                </View>
              ) : null}

              {/* Trust header — vivid badge like web */}
              <View style={[s.trustCard, { borderColor: colors.border, backgroundColor: colors.backgroundElevated }]}>
                {typeof article.factCheckScore === 'number' ? (
                  <View style={[s.trustScoreBadge, { backgroundColor: getScoreColor(article.factCheckScore) }]}>
                    <Text style={s.trustScoreText}>Fiabilité : {article.factCheckScore}%</Text>
                  </View>
                ) : (
                  <View style={[s.trustScoreBadge, { backgroundColor: colors.backgroundSubtle }]}>
                    <Text style={[s.trustScoreTextMuted, { color: colors.textMuted }]}>Score indisponible</Text>
                  </View>
                )}
                <View style={s.trustMeta}>
                  {typeof article.factCheckScore === 'number' ? (
                    <Text style={[s.trustMetaLabel, { color: colors.textTertiary }]}>
                      {getScoreLabel(article.factCheckScore)} · {getSupportLabel(article.factCheckScore)}
                    </Text>
                  ) : null}
                  {typeof article.sourcesCount === 'number' ? (
                    <Pressable style={[s.trustSourcesBtn, { borderColor: colors.border }]} onPress={() => setSourcesExpanded(!sourcesExpanded)}>
                      <Text style={[s.trustSourcesBtnText, { color: colors.textTertiary }]}>{article.sourcesCount} sources analysées</Text>
                    </Pressable>
                  ) : (
                    <Text style={[s.trustMetaLabel, { color: colors.textMuted }]}>0 source analysée</Text>
                  )}
                </View>
                {statusLabel ? <Text style={[s.trustStatusLabel, { color: colors.textMuted }]}>{statusLabel}</Text> : null}
              </View>

              {/* Meta */}
              <View style={s.metaRow}>
                {article.category ? (
                  <View style={[s.categoryPill, { borderColor: colors.border }]}>
                    <Text style={[s.categoryPillText, { color: colors.accent }]}>{article.category}</Text>
                  </View>
                ) : null}
                {publishedAt ? <Text style={[s.metaText, { color: colors.textMuted }]}>{publishedAt}</Text> : null}
                {typeof article.viewsAll === 'number' ? <Text style={[s.metaText, { color: colors.textMuted }]}>· {article.viewsAll} vues</Text> : null}
                {article.authorName ? <Text style={[s.metaText, { color: colors.textMuted }]}>· {article.authorName}</Text> : null}
              </View>

              {/* Title */}
              <Text style={[s.title, { color: colors.text, fontFamily: Fonts.display }]}>{article.title}</Text>

              {/* Excerpt */}
              {article.excerpt ? <Text style={[s.excerpt, { color: colors.textSecondary }]}>{article.excerpt}</Text> : null}

              {/* AI Summary */}
              {article.aiSummary ? (
                <View style={[s.summaryCard, { borderColor: `${EPION_GREEN}30`, backgroundColor: `${EPION_GREEN}06` }]}>
                  <Text style={[s.summaryLabel, { color: EPION_GREEN }]}>RÉSUMÉ IA</Text>
                  <Text style={[s.summaryText, { color: colors.textSecondary }]}>{article.aiSummary}</Text>
                </View>
              ) : null}

              {/* Body content — rendered markdown */}
              {article.body ? (
                <View style={s.bodyContainer}>
                  {renderMarkdownContent(article.body, colors.text, colors.text, colors.textTertiary, colors.border, isHighlightActive)}
                </View>
              ) : (
                <Text style={[s.emptyText, { color: colors.textMuted }]}>Aucun contenu disponible.</Text>
              )}

              {/* Sources (expandable) */}
              {article.sources?.length ? (
                <View style={s.sourcesSection}>
                  <Pressable style={[s.sourcesToggle, { borderColor: colors.border }]} onPress={() => setSourcesExpanded(!sourcesExpanded)}>
                    <Text style={[s.sourcesToggleText, { color: colors.text }]}>Sources ({article.sources.length})</Text>
                    <Text style={[s.sourcesToggleArrow, { color: colors.textMuted }]}>{sourcesExpanded ? '▾' : '▸'}</Text>
                  </Pressable>
                  {sourcesExpanded ? (
                    <View style={s.sourcesList}>{article.sources.map(renderSource)}</View>
                  ) : null}
                </View>
              ) : null}
            </View>

            {/* ========== ESPACE EPION (PRIMARY) ========== */}
            <View style={[s.interactionSpace, { borderColor: colors.border }]}>
              <View style={s.interactionHeader}>
                <Text style={[s.interactionTitle, { color: colors.text, fontFamily: Fonts.display }]}>Espace Epion</Text>
                <Text style={[s.interactionSubtitle, { color: colors.textSecondary }]}>Positionnez-vous, contribuez au débat sourcé et validez les apports de la communauté.</Text>
              </View>

              {advancedLoading && !advancedInteractions ? (
                <ActivityIndicator color={colors.textMuted} style={{ marginVertical: Spacing.xl }} />
              ) : null}

              {visibleAdvancedInteractions ? (
                <>
                  {/* ---- OPINION MAP ---- */}
                  <View style={[s.opinionCard, { borderColor: confirmedPosition ? `${EPION_GREEN}40` : colors.border, backgroundColor: colors.backgroundElevated }]}>
                    <Text style={[s.opinionCardTitle, { color: colors.text }]}>Positionnez-vous</Text>

                    {confirmedPosition ? (
                      <View style={[s.confirmedBadge, { backgroundColor: `${EPION_GREEN}12`, borderColor: `${EPION_GREEN}40` }]}>
                        <Text style={s.confirmedBadgeText}>✓ Position confirmée</Text>
                      </View>
                    ) : null}

                    {/* Question */}
                    <View style={[s.questionBox, { backgroundColor: colors.backgroundSubtle, borderColor: colors.borderSubtle }]}>
                      <Text style={[s.questionText, { color: colors.text }]}>
                        {visibleAdvancedInteractions.opinionQuestion?.question || 'Les faits présentés pointent-ils plutôt vers un problème ponctuel ou structurel ?'}
                      </Text>
                    </View>

                    {/* Thesis labels */}
                    <View style={s.thesisRow}>
                      <View style={[s.thesisPill, { borderColor: colors.border }]}>
                        <Text style={[s.thesisPillText, { color: colors.text }]}>{visibleAdvancedInteractions.opinionQuestion?.thesisA || 'Thèse A'}</Text>
                      </View>
                      <View style={[s.thesisPill, { borderColor: colors.border }]}>
                        <Text style={[s.thesisPillText, { color: colors.text }]}>{visibleAdvancedInteractions.opinionQuestion?.thesisB || 'Thèse B'}</Text>
                      </View>
                    </View>

                    {/* Position slider/dots */}
                    <View style={s.positionTrack}>
                      <View style={[s.positionRail, { backgroundColor: colors.border }]} />
                      {POSITION_VALUES.map((pos) => {
                        const isSelected = selectedPosition === pos && !lacksContext;
                        const isConfirmedHere = confirmedPosition?.selectedPosition === pos;
                        return (
                          <Pressable
                            key={String(pos)}
                            style={[
                              s.positionDot,
                              isSelected || isConfirmedHere
                                ? s.positionDotActive
                                : { backgroundColor: colors.textMuted + '40' },
                            ]}
                            disabled={Boolean(confirmedPosition)}
                            onPress={() => { setSelectedPosition(pos); setLacksContext(false); setAdvancedError(null); }}
                          />
                        );
                      })}
                    </View>

                    {/* Position label */}
                    {selectedPosition !== null && !lacksContext ? (
                      <Text style={[s.positionLabelText, { color: colors.text }]}>{POSITION_LABELS[String(selectedPosition)] ?? ''}</Text>
                    ) : null}

                    {/* Lacks context */}
                    <Pressable
                      style={[s.lacksContextBtn, {
                        borderColor: lacksContext ? '#0EA5E933' : colors.border,
                        backgroundColor: lacksContext ? '#0EA5E90D' : 'transparent',
                      }]}
                      disabled={Boolean(confirmedPosition)}
                      onPress={() => { setSelectedPosition(null); setLacksContext(true); setAdvancedError(null); }}
                    >
                      <Text style={[s.lacksContextText, { color: lacksContext ? '#0369A1' : colors.textTertiary }]}>🛡 Je manque d'éléments</Text>
                    </Pressable>

                    {/* Confirm button */}
                    {!confirmedPosition ? (
                      <Pressable style={[s.confirmBtn, { backgroundColor: EPION_GREEN }]} disabled={isSubmittingPosition} onPress={confirmOpinionPosition}>
                        <Text style={s.confirmBtnText}>{isSubmittingPosition ? 'Confirmation...' : 'Confirmer ma position'}</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  {/* ---- DISTRIBUTION (only after confirming position) ---- */}
                  {confirmedPosition && distribution && distribution.total > 0 ? (
                    <View style={[s.distributionCard, { backgroundColor: colors.backgroundSubtle, borderColor: colors.borderSubtle }]}>
                      <Text style={[s.distributionTitle, { color: colors.textTertiary }]}>
                        {distribution.total} positions · {distribution.lacksContextCount} manquent d'éléments
                      </Text>
                      <View style={s.distributionBars}>
                        {POSITION_VALUES.map((pos) => {
                          const count = distribution.counts[String(pos)] ?? 0;
                          const height = Math.max(4, (count / maxOpinionCount) * 48);
                          return (
                            <View key={String(pos)} style={s.distributionCol}>
                              <View style={[s.distributionBar, { height, backgroundColor: `${EPION_GREEN}25` }]} />
                              <Text style={[s.distributionBarLabel, { color: colors.textMuted }]}>{count}</Text>
                            </View>
                          );
                        })}
                      </View>
                      <View style={s.distributionLegend}>
                        <Text style={[s.distributionLegendText, { color: colors.textMuted }]}>← {visibleAdvancedInteractions.opinionQuestion?.thesisA || 'A'}</Text>
                        <Text style={[s.distributionLegendText, { color: colors.textMuted }]}>{visibleAdvancedInteractions.opinionQuestion?.thesisB || 'B'} →</Text>
                      </View>
                    </View>
                  ) : null}

                  {advancedError ? <Text style={[s.notice, { color: '#B45309' }]}>{advancedError}</Text> : null}

                  {/* ---- CONTRIBUTE GATEWAY ---- */}
                  <View style={[s.contributeCard, { borderColor: colors.border, backgroundColor: colors.backgroundElevated }]}>
                    <Text style={[s.contributeTitle, { color: colors.text }]}>Contribuer au débat</Text>
                    {!canContribute ? (
                      <View style={[s.contributeLocked, { backgroundColor: colors.backgroundSubtle, borderColor: colors.borderSubtle }]}>
                        <Text style={[s.contributeLockedText, { color: colors.textMuted }]}>Confirmez une position pour publier une contribution sourcée.</Text>
                      </View>
                    ) : (
                      <>
                        {/* Type grid — colored per type */}
                        <View style={s.typeGrid}>
                          {CONTRIBUTION_TYPES.map((item) => {
                            const isActive = contributionType === item.type;
                            return (
                              <Pressable
                                key={item.type}
                                style={[s.typeBtn, {
                                  borderColor: isActive ? item.colors.border : colors.border,
                                  backgroundColor: isActive ? item.colors.bg : 'transparent',
                                }]}
                                onPress={() => setContributionType(item.type)}
                              >
                                <Text style={[s.typeBtnLabel, { color: isActive ? item.colors.text : colors.text }]}>{item.label}</Text>
                                <Text style={[s.typeBtnHelp, { color: isActive ? item.colors.text + 'AA' : colors.textMuted }]}>{item.help}</Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        {contributionTargetId ? (
                          <View style={[s.targetInfo, { borderColor: '#BAE6FD', backgroundColor: '#F0F9FF' }]}>
                            <Text style={s.targetInfoText}>Note de contexte pour une contribution existante. Source requise.</Text>
                            <Pressable onPress={() => setContributionTargetId(null)}>
                              <Text style={s.targetInfoDismiss}>✕</Text>
                            </Pressable>
                          </View>
                        ) : null}

                        {contributionType !== 'SOURCE' ? (
                          <TextInput
                            style={[s.textArea, { borderColor: colors.border, backgroundColor: colors.backgroundElevated, color: colors.text }]}
                            multiline
                            onChangeText={setContributionText}
                            placeholder="Écrire une contribution précise et vérifiable..."
                            placeholderTextColor={colors.textMuted}
                            value={contributionText}
                          />
                        ) : null}
                        <TextInput
                          style={[s.textInput, { borderColor: colors.border, backgroundColor: colors.backgroundElevated, color: colors.text }]}
                          onChangeText={setContributionSourceUrl}
                          placeholder={contributionType === 'SOURCE' || contributionTargetId ? 'URL source (requise)' : 'URL source (facultatif)'}
                          placeholderTextColor={colors.textMuted}
                          value={contributionSourceUrl}
                          autoCapitalize="none"
                          keyboardType="url"
                        />
                        <Pressable style={[s.submitBtn, { backgroundColor: EPION_GREEN }]} disabled={isSubmittingContribution} onPress={submitContribution}>
                          <Text style={s.submitBtnText}>{isSubmittingContribution ? 'Envoi...' : 'Soumettre la contribution'}</Text>
                        </Pressable>
                      </>
                    )}
                  </View>

                  {/* ---- CONTRIBUTIONS LIST ---- */}
                  <View style={s.contributionsListHeader}>
                    <Text style={[s.contributionsListTitle, { color: colors.text }]}>
                      Contributions ({visibleAdvancedInteractions.contributions.length})
                    </Text>
                    <View style={[s.sortRow, { borderColor: colors.border }]}>
                      <Pressable
                        style={[s.sortBtn, advancedSort === 'top' ? { backgroundColor: colors.primary } : null]}
                        onPress={() => changeAdvancedSort('top')}
                      >
                        <Text style={[s.sortBtnText, { color: advancedSort === 'top' ? colors.background : colors.textMuted }]}>Consensus</Text>
                      </Pressable>
                      <Pressable
                        style={[s.sortBtn, advancedSort === 'recent' ? { backgroundColor: colors.primary } : null]}
                        onPress={() => changeAdvancedSort('recent')}
                      >
                        <Text style={[s.sortBtnText, { color: advancedSort === 'recent' ? colors.background : colors.textMuted }]}>Récents</Text>
                      </Pressable>
                    </View>
                  </View>

                  {advancedLoading ? <ActivityIndicator color={colors.textMuted} style={{ marginVertical: 12 }} /> : null}
                  {visibleAdvancedInteractions.contributions.length === 0 && !advancedLoading ? (
                    <View style={[s.emptyContributions, { borderColor: colors.borderSubtle }]}>
                      <Text style={[s.emptyText, { color: colors.textMuted }]}>Aucune contribution pour le moment. Soyez le premier à contribuer.</Text>
                    </View>
                  ) : null}
                  {visibleAdvancedInteractions.contributions.map(renderContribution)}
                </>
              ) : null}
            </View>

            {/* ========== COMMENTS (SECONDARY) ========== */}
            <View style={[s.commentsSection, { borderColor: colors.borderSubtle }]}>
              <Pressable style={s.commentsToggle} onPress={() => setCommentsExpanded(!commentsExpanded)}>
                <Text style={[s.commentsToggleText, { color: colors.textTertiary }]}>
                  Commentaires{comments.length > 0 ? ` (${comments.length})` : ''}
                </Text>
                <Text style={[s.commentsToggleArrow, { color: colors.textMuted }]}>{commentsExpanded ? '▾' : '▸'}</Text>
              </Pressable>

              {commentsExpanded ? (
                <View style={s.commentsContent}>
                  {/* Comment form */}
                  <View style={[s.commentForm, { borderColor: colors.borderSubtle }]}>
                    <TextInput
                      style={[s.commentInput, { borderColor: colors.border, backgroundColor: colors.backgroundElevated, color: colors.text }]}
                      multiline
                      onChangeText={setCommentText}
                      placeholder="Ajouter un commentaire..."
                      placeholderTextColor={colors.textMuted}
                      value={commentText}
                    />
                    <Pressable
                      style={[s.commentSendBtn, { backgroundColor: commentText.trim() ? colors.primary : colors.backgroundSubtle }]}
                      disabled={isPostingComment || !commentText.trim()}
                      onPress={submitComment}
                    >
                      <Text style={[s.commentSendBtnText, { color: commentText.trim() ? colors.background : colors.textMuted }]}>
                        {isPostingComment ? '...' : 'Publier'}
                      </Text>
                    </Pressable>
                  </View>
                  {commentError ? <Text style={[s.notice, { color: colors.error }]}>{commentError}</Text> : null}

                  {/* Comments list */}
                  {commentsLoading && comments.length === 0 ? <ActivityIndicator color={colors.textMuted} style={{ marginTop: 12 }} /> : null}
                  {comments.map((comment) => (
                    <View key={comment.id} style={[s.commentCard, { borderColor: colors.borderSubtle }]}>
                      <View style={s.commentHeader}>
                        <Text style={[s.commentAuthor, { color: colors.text }]}>{comment.authorName ?? 'Utilisateur Epion'}</Text>
                        <Text style={[s.commentDate, { color: colors.textMuted }]}>{formatDate(comment.createdAt)}</Text>
                      </View>
                      <Text style={[s.commentBody, { color: colors.textSecondary }]}>{comment.content}</Text>
                      {typeof comment.repliesCount === 'number' && comment.repliesCount > 0 ? (
                        <Text style={[s.commentReplies, { color: colors.textMuted }]}>{comment.repliesCount} réponses</Text>
                      ) : null}
                    </View>
                  ))}
                  {!commentsLoading && comments.length === 0 ? (
                    <Text style={[s.emptyText, { color: colors.textMuted, marginTop: Spacing.sm }]}>Aucun commentaire.</Text>
                  ) : null}
                  {commentsCursor ? (
                    <Pressable style={[s.loadMoreBtn, { borderColor: colors.border }]} disabled={commentsLoading} onPress={() => article.id && void loadComments(article.id, commentsCursor)}>
                      <Text style={[s.loadMoreText, { color: colors.text }]}>{commentsLoading ? '...' : 'Voir plus'}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* ========== FLOATING ACTION BAR — single expanding container (like web) ========== */}
      {!isLoading && article ? (
        <View style={[s.floatingBarWrap, { bottom: insets.bottom + 12 }]}>
          <View style={[s.floatingBar, toolbarPanel ? s.floatingBarExpanded : null, { backgroundColor: colors.backgroundElevated + 'F2', borderColor: colors.border }]}>

            {/* === Expanded panel content (inside the bar) === */}
            {toolbarPanel === 'interactions' ? (
              <View style={s.panelContent}>
                <Text style={[s.panelLabel, { color: colors.textMuted }]}>INTERACTIONS</Text>
                <View style={s.panelActionsColumn}>
                  <Pressable
                    style={[s.panelMenuBtn, { borderColor: reactions.userReaction === 'LIKE' ? '#A7F3D0' : colors.border, backgroundColor: reactions.userReaction === 'LIKE' ? '#ECFDF5' : 'transparent' }]}
                    onPress={() => void react('LIKE')}
                  >
                    <ThumbsUp size={18} color={reactions.userReaction === 'LIKE' ? '#059669' : colors.text} fill={reactions.userReaction === 'LIKE' ? '#059669' : 'none'} />
                    <Text style={[s.panelMenuBtnText, { color: reactions.userReaction === 'LIKE' ? '#059669' : colors.text }]}>{reactions.userReaction === 'LIKE' ? 'Aimé' : 'Aimer'}</Text>
                    {reactions.likes > 0 ? <Text style={[s.panelMenuBtnCount, { color: reactions.userReaction === 'LIKE' ? '#059669' : colors.textMuted }]}>{reactions.likes}</Text> : null}
                  </Pressable>
                  <Pressable
                    style={[s.panelMenuBtn, { borderColor: reactions.userReaction === 'DISLIKE' ? '#FECACA' : colors.border, backgroundColor: reactions.userReaction === 'DISLIKE' ? '#FEF2F2' : 'transparent' }]}
                    onPress={() => void react('DISLIKE')}
                  >
                    <ThumbsDown size={18} color={reactions.userReaction === 'DISLIKE' ? '#DC2626' : colors.text} fill={reactions.userReaction === 'DISLIKE' ? '#DC2626' : 'none'} />
                    <Text style={[s.panelMenuBtnText, { color: reactions.userReaction === 'DISLIKE' ? '#DC2626' : colors.text }]}>{reactions.userReaction === 'DISLIKE' ? 'Désaimé' : 'Désaimer'}</Text>
                    {reactions.dislikes > 0 ? <Text style={[s.panelMenuBtnCount, { color: reactions.userReaction === 'DISLIKE' ? '#DC2626' : colors.textMuted }]}>{reactions.dislikes}</Text> : null}
                  </Pressable>
                  <Pressable
                    style={[s.panelMenuBtn, { borderColor: reactions.userReposted ? '#C4B5FD' : colors.border, backgroundColor: reactions.userReposted ? '#F5F3FF' : 'transparent' }]}
                    onPress={() => void toggleRepost()}
                  >
                    <Repeat2 size={18} color={reactions.userReposted ? '#6D28D9' : colors.text} />
                    <Text style={[s.panelMenuBtnText, { color: reactions.userReposted ? '#6D28D9' : colors.text }]}>{reactions.userReposted ? 'Reposté' : 'Reposter'}</Text>
                    {reactions.reposts > 0 ? <Text style={[s.panelMenuBtnCount, { color: reactions.userReposted ? '#6D28D9' : colors.textMuted }]}>{reactions.reposts}</Text> : null}
                  </Pressable>
                  <Pressable
                    style={[s.panelMenuBtn, { borderColor: isSaved ? '#FFB01730' : colors.border, backgroundColor: isSaved ? '#FFF9ED' : 'transparent' }]}
                    disabled={isSaving}
                    onPress={toggleSave}
                  >
                    <Star size={18} color={isSaved ? '#C46101' : colors.text} fill={isSaved ? '#FFB017' : 'none'} />
                    <Text style={[s.panelMenuBtnText, { color: isSaved ? '#C46101' : colors.text }]}>{isSaved ? 'Article sauvegardé' : 'Sauvegarder'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {toolbarPanel === 'share' ? (
              <View style={s.panelContent}>
                <Text style={[s.panelLabel, { color: colors.textMuted }]}>PARTAGER</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shareDestinations}>
                  <Pressable style={s.shareDestBtn} onPress={() => openShareDestination(`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(article.title)}`)}>
                    <View style={[s.shareDestIcon, { backgroundColor: colors.backgroundSubtle, borderColor: colors.border }]}><Text style={s.shareDestIconText}>𝕏</Text></View>
                    <Text style={[s.shareDestLabel, { color: colors.text }]}>X</Text>
                  </Pressable>
                  <Pressable style={s.shareDestBtn} onPress={() => openShareDestination(`https://wa.me/?text=${encodeURIComponent(article.title + ' ' + shareUrl)}`)}>
                    <View style={[s.shareDestIcon, { backgroundColor: colors.backgroundSubtle, borderColor: colors.border }]}><Text style={s.shareDestIconText}>W</Text></View>
                    <Text style={[s.shareDestLabel, { color: colors.text }]}>WhatsApp</Text>
                  </Pressable>
                  <Pressable style={s.shareDestBtn} onPress={() => openShareDestination(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`)}>
                    <View style={[s.shareDestIcon, { backgroundColor: colors.backgroundSubtle, borderColor: colors.border }]}><Text style={s.shareDestIconText}>f</Text></View>
                    <Text style={[s.shareDestLabel, { color: colors.text }]}>Facebook</Text>
                  </Pressable>
                  <Pressable style={s.shareDestBtn} onPress={() => openShareDestination(`https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(article.title)}`)}>
                    <View style={[s.shareDestIcon, { backgroundColor: colors.backgroundSubtle, borderColor: colors.border }]}><Text style={s.shareDestIconText}>R</Text></View>
                    <Text style={[s.shareDestLabel, { color: colors.text }]}>Reddit</Text>
                  </Pressable>
                  <Pressable style={s.shareDestBtn} onPress={() => openShareDestination(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`)}>
                    <View style={[s.shareDestIcon, { backgroundColor: colors.backgroundSubtle, borderColor: colors.border }]}><Text style={s.shareDestIconText}>in</Text></View>
                    <Text style={[s.shareDestLabel, { color: colors.text }]}>LinkedIn</Text>
                  </Pressable>
                  <Pressable style={s.shareDestBtn} onPress={shareArticle}>
                    <View style={[s.shareDestIcon, { backgroundColor: colors.backgroundSubtle, borderColor: colors.border }]}><Forward size={16} color={colors.textMuted} /></View>
                    <Text style={[s.shareDestLabel, { color: colors.textMuted }]}>Autre</Text>
                  </Pressable>
                </ScrollView>
                <View style={[s.shareUrlRow, { borderColor: copyState === 'copied' ? '#34D39980' : colors.border, backgroundColor: copyState === 'copied' ? '#ECFDF510' : colors.backgroundSubtle }]}>
                  {copyState === 'copied' ? <Check size={14} color="#10B981" /> : null}
                  <Text style={[s.shareUrlText, { color: colors.text }]} numberOfLines={1}>{shareUrl}</Text>
                  <Pressable style={[s.copyBtn, { backgroundColor: colors.text }]} onPress={copyShareUrl}>
                    <Text style={[s.copyBtnText, { color: colors.background }]}>{copyState === 'copied' ? 'Copié' : 'Copier'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {toolbarPanel === 'info' ? (
              <View style={s.panelContent}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Info size={18} color="#3B82F6" />
                  <Text style={[s.panelLabel, { color: colors.text, fontSize: 13, fontWeight: '700', letterSpacing: 0 }]}>Contexte de génération IA</Text>
                </View>
                <Text style={{ fontSize: 11, color: colors.textMuted, lineHeight: 16 }}>Transparence sur la création du contenu. Voici le prompt utilisé pour générer cet article.</Text>
                <View style={[s.infoPromptBox, { backgroundColor: colors.backgroundSubtle, borderColor: colors.border }]}>
                  {article.generationPrompt ? (
                    <Text style={[s.infoPromptText, { color: colors.textSecondary }]}>{article.generationPrompt}</Text>
                  ) : (
                    <Text style={[s.infoPromptText, { color: colors.textMuted, fontStyle: 'italic' }]}>Aucun contexte disponible.</Text>
                  )}
                </View>
              </View>
            ) : null}

            {/* Separator between panel and buttons */}
            {toolbarPanel ? <View style={[s.panelDivider, { backgroundColor: colors.border }]} /> : null}

            {/* === Bottom button row (always visible) === */}
            <View style={s.floatingButtonRow}>
              <Pressable style={s.floatingBackBtn} onPress={() => router.back()}>
                <ChevronLeft size={16} color={colors.text} />
                <Text style={[s.floatingBackText, { color: colors.text }]}>Actualités</Text>
              </Pressable>

              <View style={[s.floatingSeparator, { backgroundColor: colors.border }]} />

              <View style={s.floatingActions}>
                {/* Share */}
                <Pressable
                  style={[s.floatingBtn, toolbarPanel === 'share' ? s.floatingBtnActive : null]}
                  onPress={() => setToolbarPanel(toolbarPanel === 'share' ? null : 'share')}
                >
                  {toolbarPanel === 'share' ? <X size={20} color="#FFFFFF" /> : <Forward size={20} color={colors.textTertiary} />}
                </Pressable>

                {/* Interactions (heart) */}
                <Pressable
                  style={[s.floatingBtn, toolbarPanel === 'interactions' ? s.floatingBtnActive : null]}
                  onPress={() => setToolbarPanel(toolbarPanel === 'interactions' ? null : 'interactions')}
                >
                  {toolbarPanel === 'interactions' ? <X size={20} color="#FFFFFF" /> : <Heart size={20} color={reactions.userReaction === 'LIKE' ? EPION_GREEN : colors.textTertiary} fill={reactions.userReaction === 'LIKE' ? EPION_GREEN : 'none'} />}
                </Pressable>

                {/* Chat with article */}
                <Pressable
                  style={s.floatingBtn}
                  onPress={() => { setToolbarPanel(null); void openChatWithArticle(); }}
                >
                  <MessageSquare size={20} color={isChatLoading ? EPION_GREEN : colors.textTertiary} />
                </Pressable>

                {/* Highlight sources */}
                <Pressable
                  style={[s.floatingBtn, isHighlightActive ? s.floatingBtnActive : null]}
                  onPress={() => { setToolbarPanel(null); setIsHighlightActive(!isHighlightActive); }}
                >
                  <Highlighter size={20} color={isHighlightActive ? '#FFFFFF' : '#14B8A6'} />
                </Pressable>

                {/* Info / AI context */}
                <Pressable
                  style={[s.floatingBtn, toolbarPanel === 'info' ? s.floatingBtnActive : null]}
                  onPress={() => setToolbarPanel(toolbarPanel === 'info' ? null : 'info')}
                >
                  {toolbarPanel === 'info' ? <X size={20} color="#FFFFFF" /> : <Info size={20} color="#3B82F6" />}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      ) : null}
      {interactionMessage ? <Text style={[s.floatingNotice, { color: '#B45309', bottom: insets.bottom + 80 }]}>{interactionMessage}</Text> : null}
      {reactionError ? <Text style={[s.floatingNotice, { color: '#B45309', bottom: insets.bottom + 80 }]}>{reactionError}</Text> : null}
    </View>
  );
}

// --- MARKDOWN STYLES ---
const ms = StyleSheet.create({
  h1: { fontSize: FontSize['2xl'], fontWeight: '700', letterSpacing: -0.3, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  h2: { fontSize: FontSize.xl, fontWeight: '600', letterSpacing: -0.2, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  h3: { fontSize: FontSize.lg, fontWeight: '600', marginTop: Spacing.lg, marginBottom: Spacing.xs },
  paragraph: { fontSize: FontSize.md, lineHeight: 26, marginBottom: Spacing.md },
  blockquote: { borderLeftWidth: 3, paddingLeft: Spacing.md, paddingVertical: Spacing.sm, marginVertical: Spacing.md },
  blockquoteText: { fontSize: FontSize.md, lineHeight: 24, fontStyle: 'italic' },
  list: { marginVertical: Spacing.sm, gap: Spacing.xs },
  listItem: { flexDirection: 'row', paddingLeft: Spacing.sm, gap: Spacing.sm },
  listBullet: { fontSize: FontSize.md, lineHeight: 24 },
  listItemText: { flex: 1, fontSize: FontSize.md, lineHeight: 24 },
});

// --- COMPONENT STYLES ---
const s = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg },
  centerBox: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing['3xl'] },
  loadingText: { fontSize: FontSize.base },
  errorBox: { alignItems: 'center', borderRadius: Radius.xl, borderWidth: 1, gap: Spacing.lg, padding: Spacing['2xl'] },
  errorText: { fontSize: FontSize.base, textAlign: 'center', lineHeight: 20 },
  retryBtn: { borderRadius: Radius.full, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm },
  retryBtnText: { fontSize: FontSize.base, fontWeight: '600' },
  emptyText: { fontSize: FontSize.base, lineHeight: 22 },

  // Article body zone
  articleBody: { gap: Spacing.lg },
  imageWrap: { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden', aspectRatio: 16 / 9, marginBottom: Spacing.xs },
  heroImage: { width: '100%', height: '100%' },

  // Trust header — vivid badge
  trustCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  trustScoreBadge: { alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  trustScoreText: { color: '#FFFFFF', fontSize: FontSize.sm, fontWeight: '700' },
  trustScoreTextMuted: { fontSize: FontSize.sm, fontWeight: '500' },
  trustMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
  trustMetaLabel: { fontSize: FontSize.sm },
  trustSourcesBtn: { borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  trustSourcesBtnText: { fontSize: FontSize.xs, fontWeight: '500' },
  trustStatusLabel: { fontSize: FontSize.xs, fontStyle: 'italic' },

  // Meta
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  categoryPill: { borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  categoryPillText: { fontSize: FontSize.sm, fontWeight: '600' },
  metaText: { fontSize: FontSize.sm },

  // Title + excerpt
  title: { fontSize: FontSize['3xl'], fontWeight: '700', letterSpacing: -0.5, lineHeight: 38 },
  excerpt: { fontSize: FontSize.lg, lineHeight: 26, marginTop: -4 },

  // Summary
  summaryCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.lg, gap: Spacing.sm },
  summaryLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.8 },
  summaryText: { fontSize: FontSize.md, lineHeight: 24 },

  // Body
  bodyContainer: { gap: 0 },

  // Sources (expandable)
  sourcesSection: { gap: Spacing.sm },
  sourcesToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  sourcesToggleText: { fontSize: FontSize.base, fontWeight: '600' },
  sourcesToggleArrow: { fontSize: FontSize.lg },
  sourcesList: { gap: Spacing.sm },
  sourceItem: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sourceFavicon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sourceFaviconText: { fontSize: FontSize.xs, fontWeight: '600' },
  sourceInfo: { flex: 1, gap: 1 },
  sourceDomain: { fontSize: FontSize.base, fontWeight: '600' },
  sourceDomainSub: { fontSize: FontSize.xs },
  sourceDesc: { fontSize: FontSize.sm, lineHeight: 18 },
  sourceType: { fontSize: FontSize.xs, textTransform: 'uppercase' as const },
  scorePill: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  scorePillText: { color: '#FFFFFF', fontSize: FontSize.xs, fontWeight: '700' },

  // --- ESPACE EPION (PRIMARY INTERACTION) ---
  interactionSpace: { marginTop: Spacing['2xl'], borderTopWidth: 1, paddingTop: Spacing['2xl'], gap: Spacing.lg },
  interactionHeader: { gap: Spacing.xs },
  interactionTitle: { fontSize: FontSize['2xl'], fontWeight: '600', letterSpacing: -0.3 },
  interactionSubtitle: { fontSize: FontSize.base, lineHeight: 20 },

  // Opinion card
  opinionCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.lg, gap: Spacing.lg, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  opinionCardTitle: { fontSize: FontSize.lg, fontWeight: '600' },
  confirmedBadge: { alignSelf: 'flex-start', borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: 4 },
  confirmedBadgeText: { color: '#065F46', fontSize: FontSize.xs, fontWeight: '600' },
  questionBox: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.lg },
  questionText: { fontSize: FontSize.md, fontWeight: '500', lineHeight: 22 },
  thesisRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  thesisPill: { flex: 1, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm },
  thesisPillText: { fontSize: FontSize.sm, fontWeight: '500', textAlign: 'center' },

  // Position track
  positionTrack: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing['2xl'], paddingHorizontal: 4, position: 'relative' },
  positionRail: { position: 'absolute', left: 4, right: 4, height: 3, borderRadius: 2, top: '50%' },
  positionDot: { width: 11, height: 11, borderRadius: 6, zIndex: 1 },
  positionDotActive: { width: 15, height: 15, borderRadius: 8, backgroundColor: EPION_GREEN, shadowColor: EPION_GREEN, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  positionLabelText: { fontSize: FontSize.base, fontWeight: '500', textAlign: 'center' },
  lacksContextBtn: { borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center', paddingVertical: Spacing.md },
  lacksContextText: { fontSize: FontSize.base, fontWeight: '500' },
  confirmBtn: { borderRadius: Radius.full, alignItems: 'center', paddingVertical: 12 },
  confirmBtnText: { color: '#FFFFFF', fontSize: FontSize.base, fontWeight: '700' },

  // Distribution
  distributionCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.lg, gap: Spacing.md },
  distributionTitle: { fontSize: FontSize.sm },
  distributionBars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 56, gap: 6 },
  distributionCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  distributionBar: { width: '100%', borderRadius: 4 },
  distributionBarLabel: { fontSize: FontSize.xs },
  distributionLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  distributionLegendText: { fontSize: FontSize.xs },

  // Contribute
  contributeCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.lg, gap: Spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  contributeTitle: { fontSize: FontSize.lg, fontWeight: '600' },
  contributeLocked: { borderRadius: Radius.lg, borderWidth: 1, borderStyle: 'dashed', padding: Spacing.lg, alignItems: 'center' },
  contributeLockedText: { fontSize: FontSize.base, lineHeight: 20, textAlign: 'center' },
  typeGrid: { gap: Spacing.sm },
  typeBtn: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: 2 },
  typeBtnLabel: { fontSize: FontSize.base, fontWeight: '600' },
  typeBtnHelp: { fontSize: FontSize.sm, lineHeight: 18 },
  targetInfo: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
  targetInfoText: { flex: 1, color: '#0369A1', fontSize: FontSize.sm },
  targetInfoDismiss: { color: '#0369A1', fontSize: FontSize.lg, fontWeight: '600' },
  textArea: { borderRadius: Radius.lg, borderWidth: 1, fontSize: FontSize.md, lineHeight: 21, minHeight: 80, padding: Spacing.md, textAlignVertical: 'top' },
  textInput: { borderRadius: Radius.lg, borderWidth: 1, fontSize: FontSize.md, padding: Spacing.md },
  submitBtn: { borderRadius: Radius.full, alignItems: 'center', paddingVertical: 12 },
  submitBtnText: { color: '#FFFFFF', fontSize: FontSize.base, fontWeight: '700' },

  // Contributions list header
  contributionsListHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  contributionsListTitle: { fontSize: FontSize.md, fontWeight: '600' },
  sortRow: { flexDirection: 'row', borderRadius: Radius.full, borderWidth: 1, overflow: 'hidden' },
  sortBtn: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full },
  sortBtnText: { fontSize: FontSize.xs, fontWeight: '600' },

  // Contribution cards
  contributionCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.lg, gap: Spacing.md },
  contributionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  contributionAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  contributionAvatarText: { fontSize: FontSize.xs, fontWeight: '600' },
  contributionMeta: { flex: 1, gap: 2 },
  contributionAuthor: { fontSize: FontSize.sm, fontWeight: '600' },
  contributionTypeBadgeRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  typeBadgeInline: { borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1 },
  typeBadgeInlineText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' as const },
  contributionEdited: { fontSize: FontSize.xs },
  contestedBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm },
  contestedIcon: { fontSize: FontSize.base },
  contestedText: { flex: 1, color: '#92400E', fontSize: FontSize.sm, lineHeight: 18 },
  contributionBody: { fontSize: FontSize.base, lineHeight: 22 },
  sourceLink: { borderRadius: Radius.lg, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  sourceLinkDot: { width: 6, height: 6, borderRadius: 3 },
  sourceLinkText: { flex: 1, fontSize: FontSize.sm },
  sourceLinkArrow: { fontSize: FontSize.base },
  validationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  validationPill: { borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: 5 },
  validationPillText: { fontSize: FontSize.xs, fontWeight: '500' },
  contextReplyBtn: { borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center', paddingVertical: 8 },
  contextReplyText: { fontSize: FontSize.sm, fontWeight: '500' },
  childNote: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.xs, marginTop: Spacing.sm },
  childNoteLabel: { color: '#0369A1', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  childNoteBody: { fontSize: FontSize.sm, lineHeight: 20 },
  childNoteLink: { color: '#0369A1', fontSize: FontSize.xs },
  emptyContributions: { borderRadius: Radius.lg, borderWidth: 1, borderStyle: 'dashed', padding: Spacing.lg, alignItems: 'center' },

  // --- COMMENTS (SECONDARY) ---
  commentsSection: { marginTop: Spacing.xl, borderTopWidth: 1, paddingTop: Spacing.lg },
  commentsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm },
  commentsToggleText: { fontSize: FontSize.base, fontWeight: '500' },
  commentsToggleArrow: { fontSize: FontSize.lg },
  commentsContent: { gap: Spacing.sm, marginTop: Spacing.sm },
  commentForm: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm, flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-end' },
  commentInput: { flex: 1, borderRadius: Radius.md, borderWidth: 1, fontSize: FontSize.sm, minHeight: 36, paddingHorizontal: Spacing.sm, paddingVertical: 6, textAlignVertical: 'top' },
  commentSendBtn: { borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 7 },
  commentSendBtnText: { fontSize: FontSize.sm, fontWeight: '600' },
  commentCard: { borderRadius: Radius.md, borderBottomWidth: 1, paddingVertical: Spacing.sm },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  commentAuthor: { fontSize: FontSize.sm, fontWeight: '500' },
  commentDate: { fontSize: FontSize.xs },
  commentBody: { fontSize: FontSize.sm, lineHeight: 19, marginTop: 3 },
  commentReplies: { fontSize: FontSize.xs, marginTop: Spacing.xs },
  loadMoreBtn: { borderRadius: Radius.full, borderWidth: 1, alignItems: 'center', paddingVertical: Spacing.sm },
  loadMoreText: { fontSize: FontSize.sm, fontWeight: '500' },

  // --- FLOATING ACTION BAR (single expanding container) ---
  floatingBarWrap: { position: 'absolute', left: Spacing.md, right: Spacing.md, alignItems: 'center' },
  floatingBar: { width: '100%', maxWidth: 430, borderRadius: 32, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8, overflow: 'hidden' },
  floatingBarExpanded: { paddingVertical: 16, gap: 12 },
  floatingButtonRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  floatingBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 40, paddingHorizontal: 10, borderRadius: 20 },
  floatingBackText: { fontSize: FontSize.sm, fontWeight: '500' },
  floatingSeparator: { width: 1, height: 20, marginHorizontal: 4 },
  floatingActions: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  floatingBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  floatingBtnActive: { backgroundColor: '#000000' },

  // Panel content (inside the expanding bar)
  panelContent: { gap: Spacing.sm },
  panelDivider: { height: 1, marginVertical: 4 },
  panelLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' as const },
  panelActionsColumn: { gap: Spacing.sm },
  panelMenuBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 48, borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: Spacing.md },
  panelMenuBtnText: { fontSize: 15, fontWeight: '500', flex: 1 },
  panelMenuBtnCount: { fontSize: FontSize.xs, fontWeight: '400', opacity: 0.5 },

  // Share panel
  shareDestinations: { gap: 12, paddingVertical: 4, paddingHorizontal: 2 },
  shareDestBtn: { width: 64, height: 72, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: Radius.lg },
  shareDestIcon: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  shareDestIconText: { fontSize: 16, fontWeight: '700' },
  shareDestLabel: { fontSize: 11, fontWeight: '500' },
  shareUrlRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, paddingLeft: Spacing.md, paddingVertical: 6, paddingRight: 6 },
  shareUrlText: { flex: 1, fontSize: FontSize.xs },
  copyBtn: { borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 8 },
  copyBtnText: { fontSize: FontSize.xs, fontWeight: '600' },

  // Info panel
  infoPromptBox: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, maxHeight: 160 },
  infoPromptText: { fontSize: 11, lineHeight: 17, fontFamily: 'monospace' },

  floatingNotice: { position: 'absolute', left: Spacing.xl, right: Spacing.xl, textAlign: 'center', fontSize: FontSize.xs },
  notice: { fontSize: FontSize.sm, lineHeight: 18, marginTop: 4 },
});

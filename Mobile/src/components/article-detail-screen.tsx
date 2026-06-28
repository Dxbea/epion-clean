import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

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
  toggleArticleContributionValidation,
  toggleArticleReaction,
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
const CONTRIBUTION_TYPES: Array<{ type: ArticleContributionType; label: string; help: string }> = [
  { type: 'SOURCE', label: 'Source', help: 'Ajouter une source verifiable.' },
  { type: 'NUANCE', label: 'Nuance', help: 'Ajouter du contexte ou une distinction.' },
  { type: 'CONTRADICTION', label: 'Contradiction', help: 'Signaler un conflit avec un element.' },
  { type: 'QUESTION', label: 'Question', help: 'Ouvrir un point precis a clarifier.' },
  { type: 'CORRECTION', label: 'Correction', help: 'Proposer une correction factuelle.' },
];
const VALIDATION_TYPES: Array<{ type: ArticleValidationType; label: string }> = [
  { type: 'WELL_SOURCED', label: 'Bien source' },
  { type: 'ADDS_NUANCE', label: 'Nuance' },
  { type: 'NEEDS_CHECK', label: 'A verifier' },
];
function formatDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function scoreStatusLabel(status?: string): string | undefined {
  if (!status || status === 'COMPLETED') return undefined;
  if (status === 'PENDING') return 'Analyse en attente';
  if (status === 'RUNNING') return 'Analyse en cours';
  if (status === 'FAILED') return 'Analyse indisponible';
  if (status === 'STALE') return 'Score base sur une version precedente';
  return status;
}

function formatSourceScore(source: ArticleSource): string | undefined {
  if (typeof source.trustScore !== 'number') return undefined;
  return `TrustScore ${source.trustScore}`;
}

function authorLabel(comment: ArticleComment): string {
  return comment.authorName ?? 'Utilisateur Epion';
}

function contributionAuthorLabel(contribution: ArticleContribution): string {
  return contribution.author?.name ?? contribution.author?.username ?? 'Contributeur Epion';
}

function contributionTypeLabel(type: ArticleContributionType): string {
  return CONTRIBUTION_TYPES.find((item) => item.type === type)?.label ?? type;
}

function positionLabel(value: number | null): string {
  if (value === null) return 'Sans position';
  if (value <= -0.9) return 'These A forte';
  if (value < -0.3) return 'These A moderee';
  if (value < 0) return 'These A legere';
  if (value < 0.3) return 'These B legere';
  if (value < 0.9) return 'These B moderee';
  return 'These B forte';
}

function validUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
export function ArticleDetailScreenContent({ loadArticle, missingText = 'Aucun detail disponible pour cet article.' }: ArticleDetailScreenProps) {
  const router = useRouter();
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
      setAdvancedError('Contributions et carte d opinion indisponibles pour le moment.');
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
        .catch(() => setReactionError('Reactions indisponibles pour le moment.'));

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

  const publishedAt = formatDate(article?.publishedAt);
  const statusLabel = scoreStatusLabel(article?.factCheckStatus);
  const shareUrl = useMemo(() => {
    if (!article) return WEB_ORIGIN;
    return `${WEB_ORIGIN}/article/${article.slug ?? article.id}`;
  }, [article]);

  const toggleSave = useCallback(async () => {
    if (!article?.id || isSaving) return;

    const previous = isSaved;
    setIsSaving(true);
    setInteractionMessage(null);
    setIsSaved(!previous);

    try {
      if (previous) {
        await removeFavoriteArticle(article.id);
      } else {
        await saveFavoriteArticle(article.id);
      }
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
        setReactionError('Connexion requise ou reaction indisponible.');
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

  const confirmedPosition = advancedInteractions?.currentUserOpinionPosition ?? null;
  const canContribute = advancedInteractions?.canContribute === true;
  const canValidate = advancedInteractions?.canValidateContributions === true;
  const distribution = advancedInteractions?.opinionDistribution;
  const maxOpinionCount = Math.max(1, ...POSITION_VALUES.map((position) => distribution?.counts[String(position)] ?? 0));

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
      setAdvancedError('Connexion requise ou position deja confirmee.');
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
      setAdvancedError('Ecrivez une contribution avant de publier.');
      return;
    }
    if (sourceUrl && !validUrl(sourceUrl)) {
      setAdvancedError('L URL doit commencer par http:// ou https://.');
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
          contributions: current.contributions.map((contribution) => contribution.id === created.targetContributionId ? { ...contribution, children: [...contribution.children, created] } : contribution),
        };
      });
      setContributionText('');
      setContributionSourceUrl('');
      setContributionTargetId(null);
      setContributionType('NUANCE');
    } catch {
      setAdvancedError('Connexion requise ou contribution refusee par l API.');
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
      contributions: updateContributionTree(current.contributions, contributionId, (contribution) => {
        const hadIt = contribution.currentUserValidations.includes(type);
        return {
          ...contribution,
          currentUserValidations: hadIt ? contribution.currentUserValidations.filter((item) => item !== type) : [...contribution.currentUserValidations, type],
          validationSummary: {
            ...contribution.validationSummary,
            [type]: Math.max(0, contribution.validationSummary[type] + (hadIt ? -1 : 1)),
          },
        };
      }),
    } : current);

    try {
      const result = await toggleArticleContributionValidation(contributionId, type);
      setAdvancedInteractions((current) => current ? {
        ...current,
        contributions: updateContributionTree(current.contributions, contributionId, (contribution) => ({
          ...contribution,
          validationSummary: result.validationSummary,
          currentUserValidations: result.action === 'ADDED'
            ? [...contribution.currentUserValidations.filter((item) => item !== type), type]
            : contribution.currentUserValidations.filter((item) => item !== type),
        })),
      } : current);
    } catch {
      setAdvancedInteractions(previous);
      setAdvancedError('Validation impossible: connexion requise ou contribution non eligible.');
    }
  }, [advancedInteractions, canValidate]);

  const changeAdvancedSort = useCallback((sort: ArticleInteractionsSortMode) => {
    setAdvancedSort(sort);
    if (article) void loadAdvancedInteractions(article, sort);
  }, [article, loadAdvancedInteractions]);
  const shareArticle = useCallback(async () => {
    if (!article) return;

    try {
      await Share.share({
        title: article.title,
        message: `${article.title}\n${shareUrl}`,
        url: shareUrl,
      });
    } catch {
      setInteractionMessage('Partage indisponible sur cet appareil.');
    }
  }, [article, shareUrl]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Retour</Text>
        </Pressable>

        {isLoading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.stateText}>Chargement de l'article...</Text>
          </View>
        ) : null}

        {!isLoading && error ? (
          <View style={styles.stateBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={load}>
              <Text style={styles.retryText}>Reessayer</Text>
            </Pressable>
          </View>
        ) : null}

        {!isLoading && !error && !article ? (
          <View style={styles.stateBox}>
            <Text style={styles.emptyText}>{missingText}</Text>
          </View>
        ) : null}

        {!isLoading && !error && article ? (
          <View style={styles.article}>
            <View style={styles.metaRow}>
              {article.category ? <Text style={styles.category}>{article.category}</Text> : null}
              {publishedAt ? <Text style={styles.meta}>{publishedAt}</Text> : null}
              {typeof article.viewsAll === 'number' ? <Text style={styles.meta}>{article.viewsAll} vues</Text> : null}
              {article.authorName ? <Text style={styles.meta}>Par {article.authorName}</Text> : null}
            </View>

            <Text style={styles.title}>{article.title}</Text>
            {article.excerpt ? <Text style={styles.excerpt}>{article.excerpt}</Text> : null}

            <View style={styles.actionRow}>
              <Pressable style={styles.secondaryButton} disabled={isSaving} onPress={toggleSave}>
                <Text style={styles.secondaryButtonText}>{isSaving ? '...' : isSaved ? 'Sauvegarde' : 'Sauver'}</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={shareArticle}>
                <Text style={styles.secondaryButtonText}>Partager</Text>
              </Pressable>
            </View>
            {interactionMessage ? <Text style={styles.noticeText}>{interactionMessage}</Text> : null}

            <View style={styles.trustBox}>
              <Text style={styles.trustTitle}>Transparence</Text>
              <View style={styles.trustRow}>
                {typeof article.factCheckScore === 'number' ? (
                  <Text style={styles.trustPill}>FactScore {article.factCheckScore}</Text>
                ) : (
                  <Text style={styles.trustPill}>Score non disponible</Text>
                )}
                {article.supportLevel ? <Text style={styles.trustPill}>{article.supportLevel}</Text> : null}
                {typeof article.sourcesCount === 'number' ? <Text style={styles.trustPill}>{article.sourcesCount} sources</Text> : null}
              </View>
              {statusLabel ? <Text style={styles.placeholderText}>{statusLabel}</Text> : null}
              {article.sources?.length ? (
                <View style={styles.sourceList}>
                  {article.sources.map((source, index) => (
                    <Pressable
                      key={source.id ?? source.url ?? `${source.domain}-${index}`}
                      style={styles.sourceItem}
                      onPress={() => {
                        if (source.url) void Linking.openURL(source.url);
                      }}>
                      <Text style={styles.sourceTitle}>{source.domain}</Text>
                      <Text style={styles.sourceMeta}>{[formatSourceScore(source), source.type].filter(Boolean).join(' - ') || 'Source referencee'}</Text>
                      {source.description ? <Text style={styles.sourceText}>{source.description}</Text> : null}
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.placeholderText}>Aucune liste de sources exploitable dans la reponse actuelle.</Text>
              )}
              <Text style={styles.placeholderText}>Placeholder mobile: details avances du score, modal de fiabilite et surlignage des claims restent a adapter.</Text>
            </View>

            {article.aiSummary ? (
              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>Resume IA</Text>
                <Text style={styles.infoText}>{article.aiSummary}</Text>
              </View>
            ) : null}

            {article.structuredContentAvailable ? (
              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>Article structure</Text>
                <Text style={styles.infoText}>Placeholder mobile: le rendu structure avec claims et citations reste a transformer depuis React web.</Text>
              </View>
            ) : null}

            {article.body ? <Text style={styles.body}>{article.body}</Text> : <Text style={styles.emptyText}>Aucun contenu disponible.</Text>}

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Reactions</Text>
              <View style={styles.actionRow}>
                <Pressable style={[styles.secondaryButton, reactions.userReaction === 'LIKE' ? styles.activeButton : null]} onPress={() => void react('LIKE')}>
                  <Text style={styles.secondaryButtonText}>J'aime {reactions.likes}</Text>
                </Pressable>
                <Pressable style={[styles.secondaryButton, reactions.userReaction === 'DISLIKE' ? styles.activeButton : null]} onPress={() => void react('DISLIKE')}>
                  <Text style={styles.secondaryButtonText}>A verifier {reactions.dislikes}</Text>
                </Pressable>
              </View>
              {reactionError ? <Text style={styles.noticeText}>{reactionError}</Text> : null}
              <Text style={styles.placeholderText}>Placeholder mobile: repost et espace d'opinion avance restent a adapter.</Text>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Carte d'opinion Epion</Text>
              <Text style={styles.infoText}>Ce bloc reprend le systeme web: positionnement d'abord, puis contributions structurees et validations.</Text>
              {advancedLoading ? <Text style={styles.placeholderText}>Chargement des contributions...</Text> : null}
              {advancedError ? <Text style={styles.noticeText}>{advancedError}</Text> : null}
              {advancedInteractions ? (
                <View>
                  <View style={styles.opinionBox}>
                    <Text style={styles.sectionLabel}>Question de positionnement</Text>
                    <Text style={styles.infoText}>{advancedInteractions.opinionQuestion?.question || 'Les faits presentes pointent-ils plutot vers un probleme ponctuel ou structurel ?'}</Text>
                    <View style={styles.thesisRow}>
                      <Text style={styles.sourceMeta}>{advancedInteractions.opinionQuestion?.thesisA || 'These A'}</Text>
                      <Text style={styles.sourceMeta}>{advancedInteractions.opinionQuestion?.thesisB || 'These B'}</Text>
                    </View>
                    <View style={styles.positionGrid}>
                      {POSITION_VALUES.map((position) => (
                        <Pressable
                          key={String(position)}
                          style={[styles.positionButton, selectedPosition === position && !lacksContext ? styles.activeButton : null]}
                          disabled={Boolean(confirmedPosition)}
                          onPress={() => {
                            setSelectedPosition(position);
                            setLacksContext(false);
                            setAdvancedError(null);
                          }}>
                          <Text style={styles.positionText}>{positionLabel(position)}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Pressable
                      style={[styles.secondaryButton, lacksContext ? styles.activeButton : null]}
                      disabled={Boolean(confirmedPosition)}
                      onPress={() => {
                        setSelectedPosition(null);
                        setLacksContext(true);
                        setAdvancedError(null);
                      }}>
                      <Text style={styles.secondaryButtonText}>Je manque de contexte</Text>
                    </Pressable>
                    <Pressable style={styles.retryButton} disabled={Boolean(confirmedPosition) || isSubmittingPosition} onPress={confirmOpinionPosition}>
                      <Text style={styles.retryText}>{confirmedPosition ? 'Position confirmee' : isSubmittingPosition ? 'Confirmation...' : 'Confirmer ma position'}</Text>
                    </Pressable>
                  </View>

                  <View style={styles.opinionBox}>
                    <Text style={styles.sectionLabel}>Repartition communautaire</Text>
                    <Text style={styles.placeholderText}>{distribution?.total ?? 0} positions confirmees - {distribution?.lacksContextCount ?? 0} manquent de contexte</Text>
                    {POSITION_VALUES.map((position) => {
                      const count = distribution?.counts[String(position)] ?? 0;
                      return (
                        <View key={String(position)} style={styles.distributionRow}>
                          <Text style={styles.distributionLabel}>{positionLabel(position)}</Text>
                          <View style={styles.distributionTrack}>
                            <View style={[styles.distributionFill, { width: `${Math.max(5, (count / maxOpinionCount) * 100)}%` }]} />
                          </View>
                          <Text style={styles.distributionCount}>{count}</Text>
                        </View>
                      );
                    })}
                  </View>

                  <View style={styles.opinionBox}>
                    <Text style={styles.sectionLabel}>Contribuer intentionnellement</Text>
                    {!canContribute ? <Text style={styles.placeholderText}>Confirmez une position pour publier une contribution. Si vous avez indique manquer de contexte, l'espace reste en lecture seule.</Text> : null}
                    <View style={styles.typeGrid}>
                      {CONTRIBUTION_TYPES.map((item) => (
                        <Pressable key={item.type} style={[styles.typeButton, contributionType === item.type ? styles.activeButton : null]} disabled={!canContribute} onPress={() => setContributionType(item.type)}>
                          <Text style={styles.secondaryButtonText}>{item.label}</Text>
                          <Text style={styles.sourceMeta}>{item.help}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {contributionTargetId ? <Text style={styles.noticeText}>Note de contexte pour une contribution existante. Une source est requise.</Text> : null}
                    {contributionType !== 'SOURCE' ? (
                      <TextInput
                        style={styles.commentInput}
                        multiline
                        editable={canContribute}
                        onChangeText={setContributionText}
                        placeholder="Ecrire une contribution precise"
                        placeholderTextColor="#9CA3AF"
                        value={contributionText}
                      />
                    ) : null}
                    <TextInput
                      style={styles.singleLineInput}
                      editable={canContribute}
                      onChangeText={setContributionSourceUrl}
                      placeholder={contributionType === 'SOURCE' || contributionTargetId ? 'Source URL requise' : 'Source URL facultative'}
                      placeholderTextColor="#9CA3AF"
                      value={contributionSourceUrl}
                    />
                    <Pressable style={styles.retryButton} disabled={!canContribute || isSubmittingContribution} onPress={submitContribution}>
                      <Text style={styles.retryText}>{isSubmittingContribution ? 'Envoi...' : 'Soumettre la contribution'}</Text>
                    </Pressable>
                  </View>

                  <View style={styles.sortRow}>
                    <Pressable style={[styles.secondaryButton, advancedSort === 'top' ? styles.activeButton : null]} onPress={() => changeAdvancedSort('top')}>
                      <Text style={styles.secondaryButtonText}>Top consensus</Text>
                    </Pressable>
                    <Pressable style={[styles.secondaryButton, advancedSort === 'recent' ? styles.activeButton : null]} onPress={() => changeAdvancedSort('recent')}>
                      <Text style={styles.secondaryButtonText}>Plus recents</Text>
                    </Pressable>
                  </View>

                  {advancedInteractions.contributions.length === 0 ? <Text style={styles.placeholderText}>Aucune contribution analytique pour le moment.</Text> : null}
                  {advancedInteractions.contributions.map((contribution) => {
                    const positive = contribution.validationSummary.WELL_SOURCED + contribution.validationSummary.ADDS_NUANCE;
                    const needsCheck = contribution.validationSummary.NEEDS_CHECK;
                    const isContested = needsCheck >= 3 && needsCheck > positive;
                    return (
                      <View key={contribution.id} style={[styles.contributionItem, isContested ? styles.contestedContribution : null]}>
                        <View style={styles.metaRow}>
                          <Text style={styles.contributionType}>{contributionTypeLabel(contribution.type)}</Text>
                          <Text style={styles.meta}>{contributionAuthorLabel(contribution)}</Text>
                          {contribution.editCount > 0 ? <Text style={styles.meta}>Modifie</Text> : null}
                        </View>
                        {isContested ? <Text style={styles.noticeText}>La communaute estime que cette contribution necessite une verification.</Text> : null}
                        {contribution.text.trim() ? <Text style={styles.commentText}>{contribution.text}</Text> : <Text style={styles.placeholderText}>Source proposee sans commentaire.</Text>}
                        {contribution.sourceUrl ? (
                          <Pressable onPress={() => contribution.sourceUrl && void Linking.openURL(contribution.sourceUrl)}>
                            <Text style={styles.linkText}>{contribution.sourceUrl}</Text>
                          </Pressable>
                        ) : null}
                        <View style={styles.actionRow}>
                          {VALIDATION_TYPES.map((validation) => {
                            const isActive = contribution.currentUserValidations.includes(validation.type);
                            const count = contribution.validationSummary[validation.type];
                            return (
                              <Pressable key={validation.type} style={[styles.validationButton, isActive ? styles.activeButton : null]} disabled={!canValidate} onPress={() => void validateContribution(contribution.id, validation.type)}>
                                <Text style={styles.validationText}>{validation.label} {count}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <Pressable
                          style={styles.secondaryButton}
                          disabled={!canValidate}
                          onPress={() => {
                            setContributionTargetId(contribution.id);
                            setContributionType('CORRECTION');
                            setContributionText('');
                            setContributionSourceUrl('');
                          }}>
                          <Text style={styles.secondaryButtonText}>Ajouter un contexte / corriger</Text>
                        </Pressable>
                        {contribution.children.map((child) => (
                          <View key={child.id} style={styles.childContribution}>
                            <Text style={styles.sectionLabel}>Contexte communautaire</Text>
                            <Text style={styles.commentText}>{child.text}</Text>
                            {child.sourceUrl ? <Text style={styles.linkText}>{child.sourceUrl}</Text> : null}
                          </View>
                        ))}
                      </View>
                    );
                  })}
                  <Text style={styles.placeholderText}>Placeholders mobile: edition, suppression, signalement et moderation admin restent a transformer depuis le web.</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Commentaires simples</Text>
              <Text style={styles.placeholderText}>Distinct des contributions Epion: fil social basique avec reponses/suppression encore en placeholder mobile.</Text>
              <TextInput
                style={styles.commentInput}
                multiline
                onChangeText={setCommentText}
                placeholder="Ajouter un commentaire"
                placeholderTextColor="#9CA3AF"
                value={commentText}
              />
              <Pressable style={styles.retryButton} disabled={isPostingComment || !commentText.trim()} onPress={submitComment}>
                <Text style={styles.retryText}>{isPostingComment ? 'Envoi...' : 'Publier'}</Text>
              </Pressable>
              {commentError ? <Text style={styles.noticeText}>{commentError}</Text> : null}
              {commentsLoading && comments.length === 0 ? <Text style={styles.placeholderText}>Chargement des commentaires...</Text> : null}
              {comments.map((comment) => (
                <View key={comment.id} style={styles.commentItem}>
                  <Text style={styles.commentAuthor}>{authorLabel(comment)}</Text>
                  <Text style={styles.commentDate}>{formatDate(comment.createdAt)}</Text>
                  <Text style={styles.commentText}>{comment.content}</Text>
                  {typeof comment.repliesCount === 'number' && comment.repliesCount > 0 ? <Text style={styles.sourceMeta}>{comment.repliesCount} reponses</Text> : null}
                </View>
              ))}
              {!commentsLoading && comments.length === 0 ? <Text style={styles.placeholderText}>Aucun commentaire pour le moment.</Text> : null}
              {commentsCursor ? (
                <Pressable style={styles.secondaryButton} disabled={commentsLoading} onPress={() => article.id && void loadComments(article.id, commentsCursor)}>
                  <Text style={styles.secondaryButtonText}>{commentsLoading ? 'Chargement...' : 'Afficher plus'}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 54,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#111827',
    borderRadius: 8,
    marginBottom: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  stateBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    padding: 24,
  },
  stateText: {
    color: '#4B5563',
    fontSize: 15,
    marginTop: 12,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#111827',
    borderRadius: 8,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyText: {
    color: '#4B5563',
    fontSize: 15,
    lineHeight: 22,
  },
  article: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    padding: 20,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  category: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  meta: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 35,
  },
  excerpt: {
    color: '#374151',
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 25,
    marginTop: 20,
  },
  body: {
    color: '#1F2937',
    fontSize: 16,
    lineHeight: 25,
    marginTop: 24,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  activeButton: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
  },
  secondaryButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },
  noticeText: {
    color: '#B45309',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  trustBox: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 22,
    padding: 14,
  },
  trustTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
  },
  trustRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  trustPill: {
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  placeholderText: {
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  sourceList: {
    gap: 10,
    marginTop: 14,
  },
  sourceItem: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  sourceTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },
  sourceMeta: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  sourceText: {
    color: '#4B5563',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  infoBox: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 18,
    padding: 14,
  },
  infoTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  infoText: {
    color: '#4B5563',
    fontSize: 14,
    lineHeight: 21,
  },
  sectionLabel: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  opinionBox: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  thesisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 10,
  },
  positionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  positionButton: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    width: '47%',
  },
  positionText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
  },
  distributionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  distributionLabel: {
    color: '#4B5563',
    fontSize: 11,
    width: 86,
  },
  distributionTrack: {
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    flex: 1,
    height: 8,
    overflow: 'hidden',
  },
  distributionFill: {
    backgroundColor: '#2563EB',
    height: 8,
  },
  distributionCount: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
    width: 24,
  },
  typeGrid: {
    gap: 8,
    marginBottom: 12,
  },
  typeButton: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  contributionItem: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  contestedContribution: {
    borderColor: '#F59E0B',
  },
  contributionType: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  linkText: {
    color: '#2563EB',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  validationButton: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  validationText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
  },
  childContribution: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 10,
  },
  singleLineInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111827',
    fontSize: 15,
    marginTop: 10,
    padding: 12,
  },  commentInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111827',
    fontSize: 15,
    lineHeight: 21,
    minHeight: 92,
    padding: 12,
    textAlignVertical: 'top',
  },
  commentItem: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  commentAuthor: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },
  commentDate: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
  commentText: {
    color: '#374151',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
});
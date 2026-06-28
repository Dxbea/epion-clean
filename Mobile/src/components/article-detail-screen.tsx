import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  WEB_ORIGIN,
  fetchArticleComments,
  fetchArticleReactions,
  fetchArticleStats,
  fetchFavoriteArticleIds,
  postArticleComment,
  recordArticleView,
  removeFavoriteArticle,
  saveFavoriteArticle,
  toggleArticleReaction,
} from '@/lib/api';
import type { ArticleComment, ArticleDetail, ArticleReactionSummary, ArticleSource } from '@/types/article';

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

  const hydrateInteractions = useCallback(
    async (articleId: string) => {
      setInteractionMessage(null);
      setReactionError(null);

      void fetchFavoriteArticleIds()
        .then((ids) => setIsSaved(ids.includes(articleId)))
        .catch(() => setIsSaved(false));

      void fetchArticleReactions(articleId)
        .then(setReactions)
        .catch(() => setReactionError('Reactions indisponibles pour le moment.'));

      void loadComments(articleId, null);
    },
    [loadComments],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setComments([]);
    setCommentsCursor(null);
    setReactions(EMPTY_REACTIONS);
    setIsSaved(false);

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
        void hydrateInteractions(nextArticle.id);
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
              <Text style={styles.infoTitle}>Commentaires</Text>
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
  commentInput: {
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
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen, StateBox } from '@/components/screen';
import { useAuth } from '@/context/AuthContext';
import type { Article, ArticlePage } from '@/types/article';

type ArticleListScreenProps = {
  title: string;
  subtitle: string;
  emptyText: string;
  loadArticles?: () => Promise<Article[]>;
  loadPage?: (cursor?: string | null) => Promise<ArticlePage>;
  onRemoveArticle?: (articleId: string) => Promise<void>;
  removeActionLabel?: string;
  requireAuth?: boolean;
  authRequiredText?: string;
  authActionText?: string;
};

function formatDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function ArticleListScreen({
  title,
  subtitle,
  emptyText,
  loadArticles,
  loadPage,
  onRemoveArticle,
  removeActionLabel = 'Retirer',
  requireAuth = false,
  authRequiredText = 'Connecte-toi pour voir tes articles sauvegardes',
  authActionText = 'Aller au compte',
}: ArticleListScreenProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [removingArticleId, setRemovingArticleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canLoad = !requireAuth || Boolean(user);

  const load = useCallback(
    async (cursor?: string | null) => {
      if (requireAuth && !user) {
        setArticles([]);
        setNextCursor(null);
        setError(null);
        setIsLoading(false);
        setIsLoadingMore(false);
        return;
      }

      if (cursor) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        if (loadPage) {
          const page = await loadPage(cursor ?? null);
          setArticles((current) => (cursor ? [...current, ...page.items] : page.items));
          setNextCursor(page.nextCursor);
        } else if (loadArticles) {
          setArticles(await loadArticles());
          setNextCursor(null);
        }
      } catch {
        if (!cursor) {
          setArticles([]);
        }
        setNextCursor(null);
        setError('Impossible de charger cette page pour le moment.');
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [loadArticles, loadPage, requireAuth, user],
  );

  const removeArticle = useCallback(
    async (articleId: string) => {
      if (!onRemoveArticle) return;

      setRemovingArticleId(articleId);
      setError(null);

      try {
        await onRemoveArticle(articleId);
        setArticles((current) => current.filter((article) => article.id !== articleId));
      } catch {
        setError('Impossible de mettre a jour vos articles sauvegardes.');
      } finally {
        setRemovingArticleId(null);
      }
    },
    [onRemoveArticle],
  );

  useEffect(() => {
    if (requireAuth && authLoading) {
      return;
    }

    void load(null);
  }, [authLoading, load, requireAuth]);

  return (
    <Screen title={title} subtitle={subtitle}>
      {requireAuth && authLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>Verification de la session...</Text>
        </View>
      ) : null}

      {requireAuth && !authLoading && !user ? (
        <View style={styles.stateBox}>
          <Text style={styles.emptyText}>{authRequiredText}</Text>
          <Pressable style={styles.retryButton} onPress={() => router.push('/account')}>
            <Text style={styles.retryText}>{authActionText}</Text>
          </Pressable>
        </View>
      ) : null}

      {canLoad && isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>Chargement...</Text>
        </View>
      ) : null}

      {canLoad && !isLoading && error ? <StateBox title={error} text="Revenez plus tard ou verifiez votre session dans Compte." /> : null}

      {canLoad && !isLoading && error ? (
        <Pressable style={styles.retryButton} onPress={() => void load(null)}>
          <Text style={styles.retryText}>Reessayer</Text>
        </Pressable>
      ) : null}

      {canLoad && !isLoading && !error && articles.length === 0 ? <StateBox title={emptyText} /> : null}

      {canLoad && !isLoading && !error
        ? articles.map((article) => {
            const date = formatDate(article.publishedAt);
            return (
              <Pressable
                key={article.id}
                style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
                onPress={() => router.push({ pathname: '/article/[id]', params: { id: article.slug ?? article.id } })}>
                <View style={styles.metaRow}>
                  {article.category ? <Text style={styles.category}>{article.category}</Text> : null}
                  {date ? <Text style={styles.meta}>{date}</Text> : null}
                  {typeof article.views === 'number' ? <Text style={styles.meta}>{article.views} vues</Text> : null}
                </View>
                <Text style={styles.title}>{article.title}</Text>
                {article.excerpt ? <Text style={styles.excerpt}>{article.excerpt}</Text> : null}
                {onRemoveArticle ? (
                  <Pressable
                    style={styles.removeButton}
                    disabled={removingArticleId === article.id}
                    onPress={(event) => {
                      event.stopPropagation();
                      void removeArticle(article.id);
                    }}>
                    <Text style={styles.removeButtonText}>{removingArticleId === article.id ? 'Mise a jour...' : removeActionLabel}</Text>
                  </Pressable>
                ) : null}
              </Pressable>
            );
          })
        : null}

      {canLoad && !isLoading && !error && nextCursor ? (
        <Pressable
          style={({ pressed }) => [styles.loadMoreButton, pressed ? styles.pressed : null]}
          disabled={isLoadingMore}
          onPress={() => void load(nextCursor)}>
          <Text style={styles.loadMoreText}>{isLoadingMore ? 'Chargement...' : 'Afficher plus'}</Text>
        </Pressable>
      ) : null}

      {canLoad && !isLoading && !error && articles.length > 0 && !nextCursor ? <Text style={styles.endText}>Fin des resultats</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
  },
  pressed: {
    opacity: 0.75,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
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
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 25,
  },
  excerpt: {
    color: '#4B5563',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#111827',
    borderRadius: 8,
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  removeButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  removeButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },
  loadMoreButton: {
    alignSelf: 'center',
    backgroundColor: '#111827',
    borderRadius: 8,
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  loadMoreText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  emptyText: {
    color: '#4B5563',
    fontSize: 15,
    lineHeight: 22,
  },
  endText: {
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'center',
  },
});

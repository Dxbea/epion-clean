import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen, StateBox } from '@/components/screen';
import type { Article, ArticlePage } from '@/types/article';

type ArticleListScreenProps = {
  title: string;
  subtitle: string;
  emptyText: string;
  loadArticles?: () => Promise<Article[]>;
  loadPage?: (cursor?: string | null) => Promise<ArticlePage>;
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

export function ArticleListScreen({ title, subtitle, emptyText, loadArticles, loadPage }: ArticleListScreenProps) {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cursor?: string | null) => {
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
    [loadArticles, loadPage],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  return (
    <Screen title={title} subtitle={subtitle}>
      {isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>Chargement...</Text>
        </View>
      ) : null}

      {!isLoading && error ? (
        <StateBox title={error} text="Revenez plus tard ou verifiez votre session dans Compte." />
      ) : null}

      {!isLoading && !error && articles.length === 0 ? <StateBox title={emptyText} /> : null}

      {!isLoading && !error
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
              </Pressable>
            );
          })
        : null}

      {!isLoading && !error && nextCursor ? (
        <Pressable
          style={({ pressed }) => [styles.loadMoreButton, pressed ? styles.pressed : null]}
          disabled={isLoadingMore}
          onPress={() => void load(nextCursor)}>
          <Text style={styles.loadMoreText}>{isLoadingMore ? 'Chargement...' : 'Afficher plus'}</Text>
        </Pressable>
      ) : null}

      {!isLoading && !error && articles.length > 0 && !nextCursor ? <Text style={styles.endText}>Fin des resultats</Text> : null}
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
  endText: {
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'center',
  },
});

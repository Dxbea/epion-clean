import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen, StateBox } from '@/components/screen';
import type { Article } from '@/types/article';

type ArticleListScreenProps = {
  title: string;
  subtitle: string;
  emptyText: string;
  loadArticles: () => Promise<Article[]>;
};

export function ArticleListScreen({ title, subtitle, emptyText, loadArticles }: ArticleListScreenProps) {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setArticles(await loadArticles());
    } catch {
      setArticles([]);
      setError('Impossible de charger cette page pour le moment.');
    } finally {
      setIsLoading(false);
    }
  }, [loadArticles]);

  useEffect(() => {
    void load();
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
        ? articles.map((article) => (
            <Pressable
              key={article.id}
              style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
              onPress={() => router.push({ pathname: '/article/[id]', params: { id: article.id } })}>
              {article.category ? <Text style={styles.category}>{article.category}</Text> : null}
              <Text style={styles.title}>{article.title}</Text>
              {article.excerpt ? <Text style={styles.excerpt}>{article.excerpt}</Text> : null}
            </Pressable>
          ))
        : null}
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
  category: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
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
});

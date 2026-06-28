import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchArticleDetail } from '@/lib/api';
import type { ArticleDetail } from '@/types/article';

function formatDate(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export default function ArticleDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const articleId = useMemo(() => {
    if (Array.isArray(params.id)) {
      return params.id[0];
    }

    return params.id;
  }, [params.id]);
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadArticle = useCallback(async () => {
    if (!articleId) {
      setArticle(null);
      setError('Article introuvable.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      setArticle(await fetchArticleDetail(articleId));
    } catch {
      setArticle(null);
      setError('Impossible de charger cet article pour le moment.');
    } finally {
      setIsLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    void loadArticle();
  }, [loadArticle]);

  const publishedAt = formatDate(article?.publishedAt);

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
            <Pressable style={styles.retryButton} onPress={loadArticle}>
              <Text style={styles.retryText}>Reessayer</Text>
            </Pressable>
          </View>
        ) : null}

        {!isLoading && !error && !article ? (
          <View style={styles.stateBox}>
            <Text style={styles.emptyText}>Aucun detail disponible pour cet article.</Text>
          </View>
        ) : null}

        {!isLoading && !error && article ? (
          <View style={styles.article}>
            {article.category ? <Text style={styles.category}>{article.category}</Text> : null}
            <Text style={styles.title}>{article.title}</Text>
            {publishedAt ? <Text style={styles.date}>{publishedAt}</Text> : null}
            {article.excerpt ? <Text style={styles.excerpt}>{article.excerpt}</Text> : null}
            {article.body ? (
              <Text style={styles.body}>{article.body}</Text>
            ) : (
              <Text style={styles.emptyText}>Aucun contenu disponible.</Text>
            )}
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
    backgroundColor: '#111827',
    borderRadius: 8,
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
  category: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  title: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 35,
  },
  date: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 12,
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
});

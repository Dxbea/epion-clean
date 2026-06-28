import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type ArticleDetail = {
  id: string;
  title: string;
  excerpt?: string;
  category?: string;
  publishedAt?: string;
  body?: string;
};

type ArticleDetailApiItem = {
  id?: string | number;
  title?: unknown;
  excerpt?: unknown;
  summary?: unknown;
  description?: unknown;
  content?: unknown;
  body?: unknown;
  publishedAt?: unknown;
  createdAt?: unknown;
  category?: unknown;
};

const ARTICLE_URL = 'https://api.epion.app/api/articles';

function readOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readCategory(value: unknown): string | undefined {
  const directCategory = readOptionalText(value);

  if (directCategory) {
    return directCategory;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return readOptionalText(record.name) ?? readOptionalText(record.slug);
  }

  return undefined;
}

function getArticlePayload(payload: unknown): ArticleDetailApiItem | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;

  if (record.article && typeof record.article === 'object') {
    return record.article as ArticleDetailApiItem;
  }

  if (record.item && typeof record.item === 'object') {
    return record.item as ArticleDetailApiItem;
  }

  if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
    return record.data as ArticleDetailApiItem;
  }

  return record as ArticleDetailApiItem;
}

function normalizeArticle(item: ArticleDetailApiItem | null, fallbackId: string): ArticleDetail | null {
  if (!item) {
    return null;
  }

  const title = readOptionalText(item.title);

  if (!title) {
    return null;
  }

  return {
    id: String(item.id ?? fallbackId),
    title,
    excerpt:
      readOptionalText(item.excerpt) ??
      readOptionalText(item.summary) ??
      readOptionalText(item.description),
    category: readCategory(item.category),
    publishedAt: readOptionalText(item.publishedAt) ?? readOptionalText(item.createdAt),
    body: readOptionalText(item.content) ?? readOptionalText(item.body),
  };
}

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
      const response = await fetch(`${ARTICLE_URL}/${encodeURIComponent(articleId)}`, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload: unknown = await response.json();
      setArticle(normalizeArticle(getArticlePayload(payload), articleId));
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
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Article = {
  id: string;
  title: string;
  excerpt?: string;
  category?: string;
};

type ArticleApiItem = {
  id?: string | number;
  slug?: string;
  title?: unknown;
  excerpt?: unknown;
  summary?: unknown;
  description?: unknown;
  category?: unknown;
};

const ARTICLES_URL = 'https://api.epion.app/api/articles';

function getArticleItems(payload: unknown): ArticleApiItem[] {
  if (Array.isArray(payload)) {
    return payload as ArticleApiItem[];
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const candidates = [record.articles, record.items, record.data];
    const match = candidates.find(Array.isArray);

    if (match) {
      return match as ArticleApiItem[];
    }
  }

  return [];
}

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

function normalizeArticle(item: ArticleApiItem, index: number): Article | null {
  const title = readOptionalText(item.title);

  if (!title) {
    return null;
  }

  return {
    id: String(item.id ?? item.slug ?? index),
    title,
    excerpt:
      readOptionalText(item.excerpt) ??
      readOptionalText(item.summary) ??
      readOptionalText(item.description),
    category: readCategory(item.category),
  };
}

export default function HomeScreen() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadArticles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(ARTICLES_URL, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload: unknown = await response.json();
      const nextArticles = getArticleItems(payload)
        .map(normalizeArticle)
        .filter((article): article is Article => article !== null);

      setArticles(nextArticles);
    } catch {
      setError('Impossible de charger les articles pour le moment.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadArticles();
  }, [loadArticles]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Epion</Text>
          <Text style={styles.title}>Articles recents</Text>
          <Text style={styles.subtitle}>Verifiez, comprenez et explorez l'information.</Text>
        </View>

        {isLoading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.stateText}>Chargement des articles...</Text>
          </View>
        ) : null}

        {!isLoading && error ? (
          <View style={styles.stateBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={loadArticles}>
              <Text style={styles.retryText}>Reessayer</Text>
            </Pressable>
          </View>
        ) : null}

        {!isLoading && !error ? (
          <View style={styles.list}>
            {articles.length === 0 ? (
              <Text style={styles.emptyText}>Aucun article disponible.</Text>
            ) : (
              articles.map((article) => (
                <View key={article.id} style={styles.articleCard}>
                  {article.category ? <Text style={styles.category}>{article.category}</Text> : null}
                  <Text style={styles.articleTitle}>{article.title}</Text>
                  {article.excerpt ? <Text style={styles.excerpt}>{article.excerpt}</Text> : null}
                </View>
              ))
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
    paddingTop: 64,
  },
  header: {
    marginBottom: 28,
  },
  eyebrow: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#111827',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 10,
  },
  subtitle: {
    color: '#4B5563',
    fontSize: 16,
    lineHeight: 23,
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
  list: {
    gap: 14,
  },
  emptyText: {
    color: '#4B5563',
    fontSize: 15,
  },
  articleCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
  },
  category: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  articleTitle: {
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
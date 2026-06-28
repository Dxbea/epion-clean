import { Link, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchArticles } from '@/lib/api';
import type { Article } from '@/types/article';

export default function NewsScreen() {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadArticles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setArticles(await fetchArticles());
    } catch {
      setError('Impossible de charger les articles pour le moment.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openArticle = useCallback(
    (articleId: string) => {
      router.push({ pathname: '/article/[id]', params: { id: articleId } });
    },
    [router],
  );

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

        <View style={styles.nav}>
          <Link href={'/news' as Href} asChild>
            <Pressable style={styles.primaryNavButton}>
              <Text style={styles.primaryNavText}>News</Text>
            </Pressable>
          </Link>
          <Link href={'/account' as Href} asChild>
            <Pressable style={styles.navButton}>
              <Text style={styles.navText}>Account</Text>
            </Pressable>
          </Link>
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
                <Pressable
                  key={article.id}
                  style={({ pressed }) => [styles.articleCard, pressed ? styles.articleCardPressed : null]}
                  onPress={() => openArticle(article.id)}>
                  {article.category ? <Text style={styles.category}>{article.category}</Text> : null}
                  <Text style={styles.articleTitle}>{article.title}</Text>
                  {article.excerpt ? <Text style={styles.excerpt}>{article.excerpt}</Text> : null}
                </Pressable>
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
    marginBottom: 22,
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
  nav: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  primaryNavButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  primaryNavText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  navButton: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  navText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
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
  articleCardPressed: {
    opacity: 0.75,
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

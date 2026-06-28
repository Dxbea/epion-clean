import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';

import { ArticleDetailScreenContent } from '@/components/article-detail-screen';
import { ArticleListScreen } from '@/components/article-list-screen';
import { fetchArticleBySlug, fetchCategories, fetchCategoryArticlesPage } from '@/lib/api';

type Mode = 'loading' | 'article' | 'category' | 'notfound';

function labelFromSlug(slug: string): string {
  const pretty = slug.replace(/-/g, ' ');
  return pretty.slice(0, 1).toUpperCase() + pretty.slice(1);
}

export default function NewsSlugScreen() {
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = useMemo(() => (Array.isArray(params.slug) ? params.slug[0] : params.slug) ?? '', [params.slug]);
  const [mode, setMode] = useState<Mode>('loading');
  const [categoryLabel, setCategoryLabel] = useState(labelFromSlug(slug));

  useEffect(() => {
    let alive = true;

    async function resolveSlug() {
      if (!slug) {
        setMode('notfound');
        return;
      }

      setMode('loading');
      setCategoryLabel(labelFromSlug(slug));

      try {
        await fetchArticleBySlug(slug);
        if (alive) setMode('article');
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message && !message.includes('HTTP 404')) {
          if (alive) setMode('notfound');
          return;
        }
      }

      try {
        const categories = await fetchCategories();
        const match = categories.find((category) => category.slug === slug);
        if (!alive) return;
        if (match) {
          setCategoryLabel(match.name);
          setMode('category');
        } else {
          setMode('notfound');
        }
      } catch {
        if (alive) setMode('notfound');
      }
    }

    void resolveSlug();

    return () => {
      alive = false;
    };
  }, [slug]);

  const loadArticle = useCallback(() => fetchArticleBySlug(slug), [slug]);
  const loadCategoryPage = useCallback((cursor?: string | null) => fetchCategoryArticlesPage(slug, { cursor }), [slug]);

  if (mode === 'loading') {
    return (
      <View style={styles.screen}>
        <View style={styles.stateBox}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>Chargement...</Text>
        </View>
      </View>
    );
  }

  if (mode === 'article') {
    return <ArticleDetailScreenContent loadArticle={loadArticle} missingText="Cet article n'existe pas." />;
  }

  if (mode === 'category') {
    return (
      <ArticleListScreen
        title={categoryLabel}
        subtitle="Articles recents de cette categorie."
        emptyText="Aucun article dans cette categorie."
        loadPage={loadCategoryPage}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.stateBox}>
        <Text style={styles.title}>Introuvable</Text>
        <Text style={styles.stateText}>Cet article ou cette categorie n'existe pas.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7FAFC',
    paddingHorizontal: 20,
    paddingTop: 64,
  },
  stateBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    padding: 24,
  },
  title: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  stateText: {
    color: '#4B5563',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    textAlign: 'center',
  },
});

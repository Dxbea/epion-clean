import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { fetchArticlesPage, fetchFollowingArticles, fetchTopArticles } from '@/lib/api';
import type { Article } from '@/types/article';

function since24h(value?: string): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && Date.now() - time <= 24 * 60 * 60 * 1000;
}

function formatDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

type ArticleCardProps = {
  article: Article;
  compact?: boolean;
};

function groupByCategory(articles: Article[]): Record<string, Article[]> {
  return articles.reduce<Record<string, Article[]>>((acc, article) => {
    const name = article.category?.trim();
    if (!name || name.toLowerCase() === 'null') return acc;
    acc[name] = [...(acc[name] ?? []), article];
    return acc;
  }, {});
}

export default function NewsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [topWeek, setTopWeek] = useState<Article[]>([]);
  const [followingArticles, setFollowingArticles] = useState<Article[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openArticle = useCallback(
    (article: Article) => {
      router.push({ pathname: '/article/[id]', params: { id: article.slug ?? article.id } });
    },
    [router],
  );

  const renderArticleCard = useCallback(
    ({ article, compact = false }: ArticleCardProps) => {
      const date = formatDate(article.publishedAt);
      return (
        <Pressable
          key={article.id}
          style={({ pressed }) => [styles.articleCard, compact ? styles.compactCard : null, pressed ? styles.articleCardPressed : null]}
          onPress={() => openArticle(article)}>
          <View style={styles.metaRow}>
            {article.category ? <Text style={styles.category}>{article.category}</Text> : null}
            {date ? <Text style={styles.meta}>{date}</Text> : null}
            {typeof article.views === 'number' ? <Text style={styles.meta}>{article.views} vues</Text> : null}
          </View>
          <Text style={compact ? styles.compactTitle : styles.articleTitle}>{article.title}</Text>
          {!compact && article.excerpt ? <Text style={styles.excerpt}>{article.excerpt}</Text> : null}
        </Pressable>
      );
    },
    [openArticle],
  );

  const loadArticles = useCallback(async (cursor?: string | null) => {
    if (cursor) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const page = await fetchArticlesPage({ take: 24, cursor });
      setArticles((current) => (cursor ? [...current, ...page.items] : page.items));
      setNextCursor(page.nextCursor);
    } catch {
      if (!cursor) setArticles([]);
      setNextCursor(null);
      setError('Impossible de charger les articles pour le moment.');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadArticles(null);
    void fetchTopArticles('7d', 12)
      .then(setTopWeek)
      .catch(() => setTopWeek([]));
  }, [loadArticles]);

  useEffect(() => {
    if (!user) {
      setFollowingArticles([]);
      return;
    }

    void fetchFollowingArticles()
      .then(setFollowingArticles)
      .catch(() => setFollowingArticles([]));
  }, [user]);

  const hero = useMemo(() => {
    if (!articles.length) return null;
    const recentPopular = [...articles]
      .filter((article) => since24h(article.publishedAt))
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];

    return recentPopular ?? [...articles].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
  }, [articles]);

  const categorySections = useMemo(() => {
    const byCategory = groupByCategory(articles);
    return Object.entries(byCategory)
      .map(([name, categoryArticles]) => ({
        name,
        articles: [...categoryArticles].sort((a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime()),
        newest: Math.max(...categoryArticles.map((article) => new Date(article.publishedAt ?? 0).getTime())),
        totalViews: categoryArticles.reduce((sum, article) => sum + (article.views ?? 0), 0),
      }))
      .sort((a, b) => b.totalViews - a.totalViews || b.newest - a.newest)
      .slice(0, 4);
  }, [articles]);

  const discoveryRows = useMemo(() => {
    const pool = [...articles].sort((a, b) => (a.views ?? 0) - (b.views ?? 0));
    return pool.slice(0, 6);
  }, [articles]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Epion</Text>
          <Text style={styles.title}>Actualites</Text>
          <Text style={styles.subtitle}>Verifiez, comprenez et explorez l'information avec des articles sources.</Text>
          <View style={styles.quickActions}>
            <Pressable style={styles.quickAction} onPress={() => router.push('/news/search' as Href)}>
              <Text style={styles.quickActionText}>Search</Text>
            </Pressable>
            <Pressable style={styles.quickAction} onPress={() => router.push('/news/categories' as Href)}>
              <Text style={styles.quickActionText}>Categories</Text>
            </Pressable>
            <Pressable style={styles.quickAction} onPress={() => router.push('/create' as Href)}>
              <Text style={styles.quickActionText}>Create</Text>
            </Pressable>
          </View>
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
            <Pressable style={styles.retryButton} onPress={() => void loadArticles(null)}>
              <Text style={styles.retryText}>Reessayer</Text>
            </Pressable>
          </View>
        ) : null}

        {!isLoading && !error && articles.length === 0 ? <Text style={styles.emptyText}>Aucun article disponible.</Text> : null}

        {!isLoading && !error && hero ? (
          <Section title="A la une">
            {renderArticleCard({ article: hero })}
          </Section>
        ) : null}

        {!isLoading && !error && topWeek.length > 0 ? (
          <Section title="Top of the week" subtitle="Last 7 days">
            {topWeek.slice(0, 3).map((article) => renderArticleCard({ article, compact: true }))}
          </Section>
        ) : null}

        {!isLoading && !error && user ? (
          <Section title="Vos abonnements">
            {followingArticles.length > 0 ? (
              followingArticles.slice(0, 4).map((article) => renderArticleCard({ article, compact: true }))
            ) : (
              <Text style={styles.emptyText}>Aucun article recent dans vos abonnements.</Text>
            )}
          </Section>
        ) : null}

        {!isLoading && !error
          ? categorySections.map((section) => (
              <Section
                key={section.name}
                title={section.name}
                actionLabel="Voir la categorie"
                onAction={() => router.push({ pathname: '/news/[slug]', params: { slug: slugify(section.name) } })}>
                {section.articles.slice(0, 3).map((article) => renderArticleCard({ article, compact: true }))}
              </Section>
            ))
          : null}

        {!isLoading && !error && discoveryRows.length > 0 ? (
          <Section title="Decouverte">
            {discoveryRows.map((article) => renderArticleCard({ article, compact: true }))}
            {nextCursor ? (
              <Pressable style={styles.loadMoreButton} disabled={isLoadingMore} onPress={() => void loadArticles(nextCursor)}>
                <Text style={styles.loadMoreText}>{isLoadingMore ? 'Chargement...' : 'Afficher plus'}</Text>
              </Pressable>
            ) : null}
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  subtitle,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction}>
            <Text style={styles.sectionAction}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  content: {
    gap: 18,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 64,
  },
  header: {
    marginBottom: 4,
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
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  },
  quickAction: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  quickActionText: {
    color: '#FFFFFF',
    fontSize: 14,
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
  section: {
    gap: 12,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 21,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: '#6B7280',
    fontSize: 13,
    marginTop: 2,
  },
  sectionAction: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '800',
  },
  articleCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
  },
  compactCard: {
    padding: 14,
  },
  articleCardPressed: {
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
  articleTitle: {
    color: '#111827',
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 25,
  },
  compactTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  excerpt: {
    color: '#4B5563',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  emptyText: {
    color: '#4B5563',
    fontSize: 15,
    lineHeight: 22,
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
});

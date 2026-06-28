import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ArticleCard, Button, EmptyState, ErrorState, LoadingState, Screen, Section } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { fetchArticlesPage, fetchFollowingArticles, fetchTopArticles } from '@/lib/api';
import { FontSize, Radius, Spacing } from '@/constants/theme';
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
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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
  const colors = useTheme();
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
    <Screen
      title="Actualités"
      subtitle="Vérifiez, comprenez et explorez l'information avec des articles sourcés."
    >
      <View style={styles.actions}>
        <Button title="Créer un article" onPress={() => router.push('/create' as Href)} rounded />
        <View style={styles.pillRow}>
          <Pressable style={[styles.pill, { borderColor: colors.border }]} onPress={() => router.push('/news/search' as Href)}>
            <Text style={[styles.pillText, { color: colors.text }]}>Rechercher</Text>
          </Pressable>
          <Pressable style={[styles.pill, { borderColor: colors.border }]} onPress={() => router.push('/news/categories' as Href)}>
            <Text style={[styles.pillText, { color: colors.text }]}>Catégories</Text>
          </Pressable>
        </View>
      </View>

      {isLoading ? <LoadingState message="Chargement des articles..." /> : null}

      {!isLoading && error ? <ErrorState message={error} onRetry={() => void loadArticles(null)} /> : null}

      {!isLoading && !error && articles.length === 0 ? (
        <EmptyState message="Aucun article disponible pour le moment." />
      ) : null}

      {!isLoading && !error && hero ? (
        <Section title="À la une">
          <ArticleCard
            title={hero.title}
            excerpt={hero.excerpt}
            category={hero.category}
            date={formatDate(hero.publishedAt)}
            views={hero.views}
            onPress={() => openArticle(hero)}
          />
        </Section>
      ) : null}

      {!isLoading && !error && topWeek.length > 0 ? (
        <Section title="Top de la semaine" subtitle="7 derniers jours">
          {topWeek.slice(0, 3).map((article) => (
            <ArticleCard
              key={article.id}
              title={article.title}
              category={article.category}
              date={formatDate(article.publishedAt)}
              views={article.views}
              compact
              onPress={() => openArticle(article)}
            />
          ))}
        </Section>
      ) : null}

      {!isLoading && !error && user ? (
        <Section title="Vos abonnements">
          {followingArticles.length > 0 ? (
            followingArticles.slice(0, 4).map((article) => (
              <ArticleCard
                key={article.id}
                title={article.title}
                category={article.category}
                date={formatDate(article.publishedAt)}
                compact
                onPress={() => openArticle(article)}
              />
            ))
          ) : (
            <EmptyState message="Aucun article récent dans vos abonnements." />
          )}
        </Section>
      ) : null}

      {!isLoading && !error
        ? categorySections.map((section) => (
            <Section
              key={section.name}
              title={section.name}
              actionLabel="Voir"
              onAction={() => router.push({ pathname: '/news/[slug]', params: { slug: slugify(section.name) } })}
            >
              {section.articles.slice(0, 3).map((article) => (
                <ArticleCard
                  key={article.id}
                  title={article.title}
                  category={article.category}
                  date={formatDate(article.publishedAt)}
                  compact
                  onPress={() => openArticle(article)}
                />
              ))}
            </Section>
          ))
        : null}

      {!isLoading && !error && discoveryRows.length > 0 ? (
        <Section title="Découverte">
          {discoveryRows.map((article) => (
            <ArticleCard
              key={article.id}
              title={article.title}
              category={article.category}
              date={formatDate(article.publishedAt)}
              compact
              onPress={() => openArticle(article)}
            />
          ))}
          {nextCursor ? (
            <Button
              title={isLoadingMore ? 'Chargement...' : 'Afficher plus'}
              onPress={() => void loadArticles(nextCursor)}
              variant="secondary"
              loading={isLoadingMore}
              disabled={isLoadingMore}
              rounded
              style={{ alignSelf: 'center', marginTop: Spacing.sm }}
            />
          ) : null}
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: Spacing.lg,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  pill: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  pillText: {
    fontSize: FontSize.base,
    fontWeight: '500',
  },
});

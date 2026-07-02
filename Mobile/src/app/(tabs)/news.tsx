import { useRouter, type Href } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ArticleCard, Button, EmptyState, ErrorState, LoadingState, Screen, Section } from '@/components/ui';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/use-theme';
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

function groupByCategory(articles: Article[]): Record<string, Article[]> {
  return articles.reduce<Record<string, Article[]>>((acc, article) => {
    const name = article.category?.trim();
    if (!name || name.toLowerCase() === 'null') return acc;
    acc[name] = [...(acc[name] ?? []), article];
    return acc;
  }, {});
}

function newestTime(article: Article): number {
  return new Date(article.publishedAt ?? 0).getTime();
}

export default function NewsScreen() {
  const router = useRouter();
  const colors = useTheme();
  const { user } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [apiHero, setApiHero] = useState<Article | null>(null);
  const [topWeek, setTopWeek] = useState<Article[]>([]);
  const [followingArticles, setFollowingArticles] = useState<Article[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const openArticle = useCallback(
    (article: Article) => {
      router.push({ pathname: '/article/[id]', params: { id: article.slug ?? article.id } });
    },
    [router],
  );

  const submitSearch = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/news/search?q=${encodeURIComponent(trimmed)}` as Href);
  }, [query, router]);

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
    void fetchTopArticles('all', 1)
      .then((items) => setApiHero(items[0] ?? null))
      .catch(() => setApiHero(null));
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

  const memoHero = useMemo(() => {
    if (!articles.length) return null;
    const recentPopular = [...articles]
      .filter((article) => since24h(article.publishedAt))
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];

    return recentPopular ?? [...articles].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
  }, [articles]);

  const hero = apiHero ?? memoHero;

  const categorySections = useMemo(() => {
    const byCategory = groupByCategory(articles);
    return Object.entries(byCategory)
      .map(([name, categoryArticles]) => ({
        name,
        articles: [...categoryArticles].sort((a, b) => newestTime(b) - newestTime(a)),
        newest: Math.max(...categoryArticles.map(newestTime)),
        totalViews: categoryArticles.reduce((sum, article) => sum + (article.views ?? 0), 0),
      }))
      .sort((a, b) => b.totalViews - a.totalViews || b.newest - a.newest)
      .slice(0, 4);
  }, [articles]);

  const discoveryRows = useMemo(() => {
    const sortedByViewsAsc = [...articles].sort((a, b) => (a.views ?? 0) - (b.views ?? 0));
    const poolSize = Math.max(6, Math.ceil(sortedByViewsAsc.length * 0.1));
    return sortedByViewsAsc.slice(0, poolSize).slice(0, 6);
  }, [articles]);

  return (
    <Screen title="Actualités">
      <View style={styles.actions}>
        <Button
          title="Demander à l'IA de créer un article"
          onPress={() => router.push('/create' as Href)}
          rounded
          style={styles.createButton}
        />
        <Pressable
          accessibilityLabel="Rechercher des articles"
          style={({ pressed }) => [
            styles.topSearchButton,
            { borderColor: colors.border, backgroundColor: colors.backgroundElevated },
            pressed ? styles.pressed : null,
          ]}
          onPress={() => router.push('/news/search' as Href)}
        >
          <Search size={20} color={colors.text} strokeWidth={2.2} />
        </Pressable>
      </View>

      {isLoading ? <LoadingState message="Chargement des articles..." /> : null}

      {!isLoading && error ? <ErrorState message={error} onRetry={() => void loadArticles(null)} /> : null}

      {!isLoading && !error && articles.length === 0 ? (
        <EmptyState message="Aucun article disponible pour le moment." />
      ) : null}

      {!isLoading && !error && hero ? (
        <Section title="À la une aujourd'hui">
          <ArticleCard
            title={hero.title}
            excerpt={hero.excerpt}
            category={hero.category}
            imageUrl={hero.imageUrl}
            date={formatDate(hero.publishedAt)}
            views={hero.views}
            hero
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
              excerpt={article.excerpt}
              category={article.category}
              imageUrl={article.imageUrl}
              date={formatDate(article.publishedAt)}
              views={article.views}
              onPress={() => openArticle(article)}
            />
          ))}
        </Section>
      ) : null}

      {!isLoading && !error && user ? (
        <Section title="De la part des personnes que vous suivez">
          {followingArticles.length > 0 ? (
            followingArticles.slice(0, 3).map((article) => (
              <ArticleCard
                key={article.id}
                title={article.title}
                excerpt={article.excerpt}
                category={article.category}
                imageUrl={article.imageUrl}
                date={formatDate(article.publishedAt)}
                views={article.views}
                onPress={() => openArticle(article)}
              />
            ))
          ) : (
            <EmptyState message="Les articles des personnes que vous suivez apparaîtront ici. Aucun article trouvé pour le moment." />
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
                  excerpt={article.excerpt}
                  category={article.category}
                  imageUrl={article.imageUrl}
                  date={formatDate(article.publishedAt)}
                  views={article.views}
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
              excerpt={article.excerpt}
              category={article.category}
              imageUrl={article.imageUrl}
              date={formatDate(article.publishedAt)}
              views={article.views}
              onPress={() => openArticle(article)}
            />
          ))}
          {nextCursor ? (
            <Button
              title={isLoadingMore ? 'Chargement...' : 'Charger plus'}
              onPress={() => void loadArticles(nextCursor)}
              variant="secondary"
              loading={isLoadingMore}
              disabled={isLoadingMore}
              rounded
              style={styles.loadMoreButton}
            />
          ) : null}
        </Section>
      ) : null}

      {!isLoading && !error ? (
        <Section title="Chercher & explorer">
          <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.backgroundElevated }]}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={submitSearch}
              placeholder="Chercher un article..."
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              style={[styles.searchInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
            />
            <View style={styles.searchActions}>
              <Button title="Rechercher" onPress={submitSearch} rounded disabled={!query.trim()} />
              <Pressable
                style={({ pressed }) => [styles.categoryButton, { borderColor: colors.border }, pressed ? styles.pressed : null]}
                onPress={() => router.push('/news/categories' as Href)}
              >
                <Text style={[styles.categoryButtonText, { color: colors.text }]}>Trouver des articles par catégorie</Text>
              </Pressable>
            </View>
          </View>
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  createButton: {
    flex: 1,
  },
  topSearchButton: {
    alignItems: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  loadMoreButton: {
    alignSelf: 'center',
    marginTop: Spacing.sm,
  },
  searchBox: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    gap: Spacing.lg,
    padding: Spacing.lg,
  },
  searchInput: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    fontSize: FontSize.base,
    minHeight: 48,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  searchActions: {
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  categoryButton: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  categoryButtonText: {
    fontSize: FontSize.base,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
  },
});
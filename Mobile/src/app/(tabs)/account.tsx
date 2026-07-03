import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { ArticleCard, Badge, Button, Card, EmptyState, Input, Screen } from '@/components/ui';
import { Brand, Fonts, FontSize, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { fetchMyArticlesPage, fetchMyArticleStats, type MyArticleStats, type MyArticleStatus } from '@/lib/api';
import { getAuthUserLabel } from '@/lib/auth';
import type { Article } from '@/types/article';

const TABS: MyArticleStatus[] = ['ALL', 'DRAFT', 'PUBLISHED', 'ARCHIVED'];

function initials(label: string): string {
  return label.trim().slice(0, 1).toUpperCase() || 'U';
}

function formatDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function tabLabel(status: MyArticleStatus): string {
  if (status === 'ALL') return 'All';
  return status.slice(0, 1) + status.slice(1).toLowerCase();
}

function tabCount(stats: MyArticleStats | null, status: MyArticleStatus): number | null {
  if (!stats) return null;
  if (status === 'ALL') return stats.total;
  if (status === 'DRAFT') return stats.draft;
  if (status === 'PUBLISHED') return stats.published;
  return stats.archived;
}

export default function AccountScreen() {
  const router = useRouter();
  const colors = useTheme();
  const { user, loading: authLoading, signIn, signOut, refreshSession } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [activeTab, setActiveTab] = useState<MyArticleStatus>('ALL');
  const [stats, setStats] = useState<MyArticleStats | null>(null);
  const [items, setItems] = useState<Article[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [articlesError, setArticlesError] = useState<string | null>(null);

  const label = getAuthUserLabel(user);
  const createdAt = formatDate(user?.createdAt);
  const displayName = user?.displayName?.trim() || user?.username?.trim() || user?.email?.split('@')[0] || label;
  const subtitle = [user?.username ? `@${user.username}` : null, createdAt ? `Membre depuis ${createdAt}` : null]
    .filter(Boolean)
    .join(' · ');

  const statsSummary = useMemo(
    () => [
      { label: 'Articles', value: stats?.total ?? 0 },
      { label: 'Brouillons', value: stats?.draft ?? 0 },
      { label: 'Publies', value: stats?.published ?? 0 },
    ],
    [stats],
  );

  const loadArticles = useCallback(
    async (cursor?: string | null) => {
      if (!user) return;

      setArticlesLoading(true);
      setArticlesError(null);

      try {
        const page = await fetchMyArticlesPage({ status: activeTab, take: 12, cursor });
        setItems((current) => (cursor ? [...current, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
      } catch {
        if (!cursor) setItems([]);
        setNextCursor(null);
        setArticlesError('Impossible de charger vos articles.');
      } finally {
        setArticlesLoading(false);
      }
    },
    [activeTab, user],
  );

  useEffect(() => {
    if (!user) {
      setStats(null);
      setItems([]);
      setNextCursor(null);
      return;
    }

    void fetchMyArticleStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setItems([]);
    setNextCursor(null);
    void loadArticles(null);
  }, [loadArticles, user]);

  const login = useCallback(async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setAuthMessage('Email et mot de passe requis.');
      return;
    }

    setAuthBusy(true);
    setAuthMessage(null);

    try {
      const result = await signIn(trimmedEmail, password);
      setPassword('');
      setAuthMessage(result.ok && result.user ? null : result.errorMessage || 'Connexion impossible.');
    } catch {
      setPassword('');
      setAuthMessage('Erreur reseau pendant la connexion.');
    } finally {
      setAuthBusy(false);
    }
  }, [email, password, signIn]);

  const logout = useCallback(async () => {
    setAuthBusy(true);
    setAuthMessage(null);

    try {
      await signOut();
      setAuthMessage('Deconnecte.');
    } catch {
      setAuthMessage('Erreur reseau pendant la deconnexion.');
    } finally {
      setAuthBusy(false);
    }
  }, [signOut]);

  const refresh = useCallback(async () => {
    setAuthBusy(true);
    setAuthMessage(null);

    try {
      await refreshSession();
    } catch {
      setAuthMessage('Impossible de verifier la session.');
    } finally {
      setAuthBusy(false);
    }
  }, [refreshSession]);

  return (
    <Screen title="">
      {user ? (
        <>
          <View style={[styles.profileHeader, { borderColor: colors.borderSubtle }]}>
            <View style={[styles.banner, { backgroundColor: colors.backgroundSubtle }]}>
              {user.bannerUrl ? <Image source={{ uri: user.bannerUrl }} style={styles.bannerImage} contentFit="cover" /> : null}
            </View>

            <View style={styles.profileBody}>
              {user.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={[styles.avatarImage, { borderColor: colors.background }]} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, { borderColor: colors.background, backgroundColor: Brand.turquoise }]}>
                  <Text style={styles.avatarText}>{initials(displayName)}</Text>
                </View>
              )}

              <View style={styles.profileText}>
                <Text style={[styles.profileName, { color: colors.text, fontFamily: Fonts.display }]}>{displayName}</Text>
                {subtitle ? <Text style={[styles.profileSubtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
                {user.email ? <Text style={[styles.profileEmail, { color: colors.textTertiary }]}>{user.email}</Text> : null}
                {user.bio ? <Text style={[styles.bio, { color: colors.textSecondary }]}>{user.bio}</Text> : null}

                <View style={styles.badgeRow}>
                  <Badge label={user.emailVerified ? 'Verifie' : 'Non verifie'} />
                  {user.role ? <Badge label={user.role} /> : null}
                </View>
              </View>

              <View style={styles.profileActions}>
                <Button title="Modifier" onPress={() => router.push('/settings/account')} variant="secondary" size="sm" rounded />
                <Button title="Rafraichir" onPress={refresh} variant="ghost" size="sm" disabled={authBusy || authLoading} />
                <Button title="Deconnexion" onPress={logout} variant="ghost" size="sm" disabled={authBusy || authLoading} />
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            {statsSummary.map((item) => (
              <Card key={item.label} style={styles.statCard}>
                <Text style={[styles.statValue, { color: colors.text }]}>{item.value}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>{item.label}</Text>
              </Card>
            ))}
          </View>

          <View style={styles.articlesHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: Fonts.display }]}>Articles</Text>
            <Button title="Creer" onPress={() => router.push('/create')} variant="secondary" size="sm" rounded />
          </View>

          <View style={styles.tabs}>
            {TABS.map((tab) => {
              const active = activeTab === tab;
              const count = tabCount(stats, tab);
              return (
                <Pressable
                  key={tab}
                  style={[
                    styles.tab,
                    { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.backgroundElevated },
                  ]}
                  onPress={() => setActiveTab(tab)}
                >
                  <Text style={[styles.tabText, { color: active ? colors.background : colors.textSecondary }]}>
                    {tabLabel(tab)}
                    {count === null ? '' : ` ${count}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {articlesLoading && items.length === 0 ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={colors.textMuted} />
              <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading articles...</Text>
            </View>
          ) : null}

          {articlesError ? <EmptyState title={articlesError} message="Reessayez dans quelques instants." /> : null}

          {!articlesLoading && !articlesError && items.length === 0 ? (
            <EmptyState
              title="No articles found."
              message="Creez un article pour le retrouver ici."
              actionLabel="Create Article"
              onAction={() => router.push('/create')}
            />
          ) : null}

          {!articlesError ? (
            <View style={styles.articleList}>
              {items.map((article) => (
                <ArticleCard
                  key={article.id}
                  title={article.title}
                  excerpt={article.excerpt}
                  category={article.category}
                  imageUrl={article.imageUrl}
                  date={article.publishedAt ? formatDate(article.publishedAt) : undefined}
                  views={article.views}
                  onPress={() =>
                    router.push({
                      pathname: '/account/articles/[id]/edit',
                      params: { id: article.slug ?? article.id },
                    })
                  }
                />
              ))}
            </View>
          ) : null}

          {nextCursor ? (
            <Button
              title="Load more"
              onPress={() => void loadArticles(nextCursor)}
              variant="secondary"
              rounded
              loading={articlesLoading}
              style={styles.loadMore}
            />
          ) : null}
        </>
      ) : (
        <>
          <Card>
            <View style={styles.loginContent}>
              <View>
                <Text style={[styles.loginTitle, { color: colors.text, fontFamily: Fonts.display }]}>Se connecter</Text>
                <Text style={[styles.loginDesc, { color: colors.textSecondary }]}>
                  Connectez-vous pour acceder a votre profil et a vos articles.
                </Text>
              </View>

              <View style={styles.formGap}>
                <Input
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  textContentType="username"
                />
                <Input value={password} onChangeText={setPassword} placeholder="Mot de passe" secureTextEntry textContentType="password" />
                {authMessage ? <Text style={[styles.formMessage, { color: colors.error }]}>{authMessage}</Text> : null}
                <Button title="Se connecter" onPress={login} rounded loading={authBusy || authLoading} />
              </View>
            </View>
          </Card>

          <EmptyState title="Compte requis" message="Les articles et reglages de compte utilisent votre session Epion." />
        </>
      )}

      {user && authMessage ? <Text style={[styles.authMessage, { color: colors.textMuted }]}>{authMessage}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileHeader: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  banner: {
    height: 132,
    width: '100%',
  },
  bannerImage: {
    height: '100%',
    width: '100%',
  },
  profileBody: {
    gap: Spacing.lg,
    padding: Spacing.xl,
    paddingTop: 0,
  },
  avatar: {
    alignItems: 'center',
    borderRadius: Radius.full,
    borderWidth: 4,
    height: 88,
    justifyContent: 'center',
    marginTop: -44,
    width: 88,
  },
  avatarImage: {
    borderRadius: Radius.full,
    borderWidth: 4,
    height: 88,
    marginTop: -44,
    width: 88,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
  },
  profileText: {
    gap: Spacing.xs,
  },
  profileName: {
    fontSize: FontSize['3xl'],
    fontWeight: '700',
  },
  profileSubtitle: {
    fontSize: FontSize.md,
  },
  profileEmail: {
    fontSize: FontSize.base,
    marginTop: 2,
  },
  bio: {
    fontSize: FontSize.base,
    lineHeight: 21,
    marginTop: Spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  profileActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    padding: Spacing.md,
  },
  statValue: {
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  articlesHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: FontSize['2xl'],
    fontWeight: '700',
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tab: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
  },
  tabText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  loadingBox: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  loadingText: {
    fontSize: FontSize.sm,
  },
  articleList: {
    gap: Spacing.lg,
  },
  loadMore: {
    alignSelf: 'center',
  },
  loginContent: {
    gap: Spacing.lg,
  },
  loginTitle: {
    fontSize: FontSize['2xl'],
    fontWeight: '700',
  },
  loginDesc: {
    fontSize: FontSize.base,
    lineHeight: 21,
    marginTop: Spacing.sm,
  },
  formGap: {
    gap: Spacing.md,
  },
  formMessage: {
    fontSize: FontSize.sm,
  },
  authMessage: {
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
});

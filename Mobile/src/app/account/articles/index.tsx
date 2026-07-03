import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { StateBox } from '@/components/screen';
import { useAuth } from '@/context/AuthContext';
import { fetchMyArticlesPage, fetchMyArticleStats, type MyArticleStats, type MyArticleStatus } from '@/lib/api';
import type { Article } from '@/types/article';

const tabs: MyArticleStatus[] = ['ALL', 'DRAFT', 'PUBLISHED', 'ARCHIVED'];

function labelForStatus(status: MyArticleStatus): string {
  if (status === 'ALL') return 'All';
  return status.slice(0, 1) + status.slice(1).toLowerCase();
}

function countForStatus(stats: MyArticleStats | null, status: MyArticleStatus): number | null {
  if (!stats) return null;
  if (status === 'ALL') return stats.total;
  if (status === 'DRAFT') return stats.draft;
  if (status === 'PUBLISHED') return stats.published;
  return stats.archived;
}

export default function MyArticlesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [status, setStatus] = useState<MyArticleStatus>('ALL');
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [stats, setStats] = useState<MyArticleStats | null>(null);
  const [items, setItems] = useState<Article[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setStats(null);
      return;
    }

    void fetchMyArticleStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, [user]);

  const loadPage = useCallback(
    async (cursor?: string | null) => {
      if (!user) return;
      setLoading(true);
      setError(null);

      try {
        const page = await fetchMyArticlesPage({ status, query: submittedQuery, cursor, take: 24 });
        setItems((current) => (cursor ? [...current, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
      } catch {
        if (!cursor) setItems([]);
        setNextCursor(null);
        setError('Impossible de charger vos articles.');
      } finally {
        setLoading(false);
      }
    },
    [status, submittedQuery, user],
  );

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void loadPage(null);
  }, [loadPage]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Epion</Text>
          <Text style={styles.title}>My articles</Text>
          <Text style={styles.subtitle}>Articles crees depuis votre compte.</Text>
        </View>

        {!user ? <StateBox title="Connexion requise" text="Connectez-vous depuis Account pour charger vos articles." /> : null}

        {user ? (
          <>
            <View style={styles.tabs}>
              {tabs.map((tab) => {
                const count = countForStatus(stats, tab);
                const active = status === tab;
                return (
                  <Pressable key={tab} style={[styles.tab, active ? styles.activeTab : null]} onPress={() => setStatus(tab)}>
                    <Text style={[styles.tabText, active ? styles.activeTabText : null]}>
                      {labelForStatus(tab)}{count === null ? '' : ` ${count}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.searchRow}>
              <TextInput
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                placeholder="Search in my articles..."
                keyboardType="default"
                autoCapitalize="sentences"
                autoCorrect
                spellCheck
                textContentType="none"
                returnKeyType="search"
                onSubmitEditing={() => setSubmittedQuery(query.trim())}
              />
              <Pressable style={styles.searchButton} onPress={() => setSubmittedQuery(query.trim())}>
                <Text style={styles.searchButtonText}>Search</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {loading && items.length === 0 ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.stateText}>Chargement...</Text>
          </View>
        ) : null}

        {error ? <StateBox title={error} /> : null}

        {user && !loading && !error && items.length === 0 ? <StateBox title="Aucun article trouve." /> : null}

        {!error
          ? items.map((article) => (
              <Pressable
                key={article.id}
                style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
                onPress={() => router.push({ pathname: '/article/[id]', params: { id: article.slug ?? article.id } })}>
                {article.category ? <Text style={styles.category}>{article.category}</Text> : null}
                <Text style={styles.itemTitle}>{article.title}</Text>
                {article.excerpt ? <Text style={styles.itemDescription}>{article.excerpt}</Text> : null}
              </Pressable>
            ))
          : null}

        {nextCursor && !loading ? (
          <Pressable style={styles.loadMoreButton} onPress={() => void loadPage(nextCursor)}>
            <Text style={styles.loadMoreText}>Afficher plus</Text>
          </Pressable>
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
    gap: 16,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 64,
  },
  header: {
    marginBottom: 6,
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
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tab: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  activeTab: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  tabText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '800',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111827',
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchButton: {
    alignSelf: 'stretch',
    backgroundColor: '#111827',
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  searchButtonText: {
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
  itemTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  itemDescription: {
    color: '#4B5563',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  loadMoreButton: {
    alignSelf: 'center',
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  loadMoreText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});

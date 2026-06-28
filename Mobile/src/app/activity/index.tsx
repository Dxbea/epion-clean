import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { StateBox } from '@/components/screen';
import { useAuth } from '@/context/AuthContext';
import { fetchActivityPage, type ActivityComment, type ActivityType } from '@/lib/api';
import type { Article } from '@/types/article';

const tabs: Array<{ id: ActivityType; label: string }> = [
  { id: 'SAVED', label: 'Saved' },
  { id: 'LIKED', label: 'Liked' },
  { id: 'DISLIKED', label: 'Disliked' },
  { id: 'REPOSTED', label: 'Reposts' },
  { id: 'COMMENTS', label: 'Comments' },
];

function isComment(item: Article | ActivityComment): item is ActivityComment {
  return 'content' in item;
}

function formatDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ActivityScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [currentTab, setCurrentTab] = useState<ActivityType>('SAVED');
  const [items, setItems] = useState<Array<Article | ActivityComment>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(
    async (cursor?: string | null) => {
      if (!user) return;
      setLoading(true);
      setError(null);

      try {
        const page = await fetchActivityPage(currentTab, { cursor, take: 24 });
        setItems((current) => (cursor ? [...current, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
      } catch {
        if (!cursor) setItems([]);
        setNextCursor(null);
        setError('Impossible de charger cette activite.');
      } finally {
        setLoading(false);
      }
    },
    [currentTab, user],
  );

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void loadItems(null);
  }, [loadItems]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Epion</Text>
          <Text style={styles.title}>Activity</Text>
          <Text style={styles.subtitle}>Interactions sauvegardees, likes, reposts et commentaires.</Text>
        </View>

        {!user ? <StateBox title="Connexion requise" text="Connectez-vous depuis Account pour voir votre activite." /> : null}

        {user ? (
          <View style={styles.tabs}>
            {tabs.map((tab) => {
              const active = currentTab === tab.id;
              return (
                <Pressable key={tab.id} style={[styles.tab, active ? styles.activeTab : null]} onPress={() => setCurrentTab(tab.id)}>
                  <Text style={[styles.tabText, active ? styles.activeTabText : null]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {loading && items.length === 0 ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.stateText}>Chargement...</Text>
          </View>
        ) : null}

        {error ? <StateBox title={error} /> : null}

        {user && !loading && !error && items.length === 0 ? (
          <StateBox title="No activity yet" text="Vous n'avez pas encore d'interactions dans cette section." />
        ) : null}

        {!error
          ? items.map((item) => {
              if (isComment(item)) {
                const date = formatDate(item.createdAt);
                return (
                  <Pressable
                    key={item.id}
                    style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
                    onPress={() => {
                      const id = item.articleSlug ?? item.articleId;
                      if (id) router.push({ pathname: '/article/[id]', params: { id } });
                    }}>
                    {date ? <Text style={styles.meta}>{date}</Text> : null}
                    {item.articleTitle ? <Text style={styles.itemTitle}>{item.articleTitle}</Text> : null}
                    <Text style={styles.itemDescription}>{item.content}</Text>
                  </Pressable>
                );
              }

              return (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
                  onPress={() => router.push({ pathname: '/article/[id]', params: { id: item.slug ?? item.id } })}>
                  {item.category ? <Text style={styles.category}>{item.category}</Text> : null}
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  {item.excerpt ? <Text style={styles.itemDescription}>{item.excerpt}</Text> : null}
                </Pressable>
              );
            })
          : null}

        {nextCursor && !loading ? (
          <Pressable style={styles.loadMoreButton} onPress={() => void loadItems(nextCursor)}>
            <Text style={styles.loadMoreText}>Load more</Text>
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
  meta: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
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

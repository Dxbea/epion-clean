import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { ArticleListScreen } from '@/components/article-list-screen';
import { Screen, StateBox } from '@/components/screen';
import { searchArticlesPage } from '@/lib/api';

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string | string[] }>();
  const initialQuery = useMemo(() => (Array.isArray(params.q) ? params.q[0] : params.q) ?? '', [params.q]);
  const [query, setQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery.trim());

  const submitSearch = useCallback(() => {
    const nextQuery = query.trim();
    setSubmittedQuery(nextQuery);
    if (nextQuery) {
      router.setParams({ q: nextQuery });
    }
  }, [query, router]);

  const loadPage = useCallback(
    (cursor?: string | null) => {
      if (!submittedQuery.trim()) {
        return Promise.resolve({ items: [], nextCursor: null });
      }

      return searchArticlesPage(submittedQuery.trim(), { cursor });
    },
    [submittedQuery],
  );

  if (submittedQuery) {
    return (
      <ArticleListScreen
        title="Search"
        subtitle={`Resultats pour "${submittedQuery}"`}
        emptyText="Aucun resultat pour cette recherche."
        loadPage={loadPage}
      />
    );
  }

  return (
    <Screen title="Search" subtitle="Rechercher des articles Epion.">
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="Recherche..."
        returnKeyType="search"
        onSubmitEditing={submitSearch}
      />
      <Pressable style={styles.button} onPress={submitSearch}>
        <Text style={styles.buttonText}>Rechercher</Text>
      </Pressable>
      <StateBox title="Astuce" text="Saisissez un sujet puis validez pour lancer la recherche." />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111827',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});

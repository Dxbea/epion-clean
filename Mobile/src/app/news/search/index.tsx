import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { ArticleListScreen } from '@/components/article-list-screen';
import { Screen, StateBox } from '@/components/screen';
import { searchArticles } from '@/lib/api';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');

  const loadArticles = useCallback(() => {
    if (!submittedQuery.trim()) {
      return Promise.resolve([]);
    }

    return searchArticles(submittedQuery.trim());
  }, [submittedQuery]);

  if (submittedQuery) {
    return (
      <ArticleListScreen
        title="Search"
        subtitle={`Resultats pour "${submittedQuery}"`}
        emptyText="Aucun resultat pour cette recherche."
        loadArticles={loadArticles}
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
        onSubmitEditing={() => setSubmittedQuery(query.trim())}
      />
      <Pressable style={styles.button} onPress={() => setSubmittedQuery(query.trim())}>
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

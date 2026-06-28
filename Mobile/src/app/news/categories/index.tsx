import { Link, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen, StateBox } from '@/components/screen';
import { fetchCategories, type Category } from '@/lib/api';

export default function CategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setCategories(await fetchCategories());
    } catch {
      setCategories([]);
      setError('Impossible de charger les categories.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen title="Categories" subtitle="Explorez les articles par theme.">
      {isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>Chargement des categories...</Text>
        </View>
      ) : null}
      {!isLoading && error ? <StateBox title={error} /> : null}
      {!isLoading && !error && categories.length === 0 ? <StateBox title="Aucune categorie disponible." /> : null}
      {!isLoading && !error
        ? categories.map((category) => (
            <Link key={category.slug} href={({ pathname: '/news/[slug]', params: { slug: category.slug } }) as unknown as Href} asChild>
              <Pressable style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}>
                <Text style={styles.title}>{category.name}</Text>
                <Text style={styles.meta}>{category.articleCount ?? 0} articles</Text>
              </Pressable>
            </Link>
          ))
        : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    padding: 16,
  },
  pressed: {
    opacity: 0.75,
  },
  title: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
  },
  meta: {
    color: '#6B7280',
    fontSize: 13,
    marginTop: 6,
  },
});



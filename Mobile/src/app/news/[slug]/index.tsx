import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { ArticleListScreen } from '@/components/article-list-screen';
import { fetchCategoryArticles } from '@/lib/api';

export default function CategoryScreen() {
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = useMemo(() => (Array.isArray(params.slug) ? params.slug[0] : params.slug) ?? '', [params.slug]);

  return (
    <ArticleListScreen
      title={slug || 'Categorie'}
      subtitle="Articles recents de cette categorie."
      emptyText="Aucun article dans cette categorie."
      loadArticles={() => (slug ? fetchCategoryArticles(slug) : Promise.resolve([]))}
    />
  );
}

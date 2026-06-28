import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { ArticleDetailScreenContent } from '@/components/article-detail-screen';
import { fetchArticleDetail } from '@/lib/api';

export default function ArticleDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const articleId = useMemo(() => (Array.isArray(params.id) ? params.id[0] : params.id) ?? '', [params.id]);

  const loadArticle = useCallback(() => {
    if (!articleId) {
      return Promise.resolve(null);
    }

    return fetchArticleDetail(articleId);
  }, [articleId]);

  return <ArticleDetailScreenContent loadArticle={loadArticle} />;
}

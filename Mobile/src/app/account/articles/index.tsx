import { ArticleListScreen } from '@/components/article-list-screen';
import { fetchMyArticles } from '@/lib/api';

export default function MyArticlesScreen() {
  return (
    <ArticleListScreen
      title="My articles"
      subtitle="Articles crees depuis votre compte."
      emptyText="Aucun article cree pour le moment."
      loadArticles={fetchMyArticles}
    />
  );
}

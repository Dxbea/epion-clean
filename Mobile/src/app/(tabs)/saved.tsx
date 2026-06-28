import { fetchFavoriteArticles, removeFavoriteArticle } from '@/lib/api';
import { ArticleListScreen } from '@/components/article-list-screen';

export default function SavedScreen() {
  return (
    <ArticleListScreen
      title="Saved"
      subtitle="Articles sauvegardes sur votre compte."
      emptyText="Aucun article sauvegarde pour le moment."
      loadArticles={fetchFavoriteArticles}
      onRemoveArticle={removeFavoriteArticle}
      removeActionLabel="Retirer des sauvegardes"
      requireAuth
      authRequiredText="Connecte-toi pour voir tes articles sauvegardes"
      authActionText="Se connecter"
    />
  );
}

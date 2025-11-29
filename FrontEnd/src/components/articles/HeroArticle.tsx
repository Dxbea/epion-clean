// DEBUT BLOC (remplace tout le fichier HeroArticle.tsx)
import React from 'react';
import { useSavedArticles } from '@/hooks/useSavedArticles';
import type { Article } from '@/types/article';
import SaveButton from '@/components/ui/SaveButton';
import { Link } from 'react-router-dom';



export default function HeroArticle({ article }: { article: Article | null }) {
  if (!article) return null;

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-black/10 p-4 shadow-sm dark:border-white/10 sm:flex-row sm:p-6">
      {/* Image à gauche */}
      <div className="sm:w-1/2">
        {article.imageUrl ? (
          <img
            src={article.imageUrl}
            alt={article.title}
            className="h-56 w-full rounded-xl object-cover sm:h-full"
          />
        ) : (
          <div className="flex h-56 w-full items-center justify-center rounded-xl bg-black/5 text-sm text-black/50 dark:bg-white/5 dark:text-white/50 sm:h-full">
            No image
          </div>
        )}
      </div>

      {/* Contenu à droite */}
      <div className="flex flex-1 flex-col justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            <Link to={article.url}>{article.title}</Link>
          </h2>
          <div className="mt-1 text-sm opacity-70">
            {article.category} •{' '}
            {new Date(article.publishedAt).toLocaleDateString()}
          </div>
          {article.excerpt && (
            <p className="mt-3 text-black/80 dark:text-white/80 line-clamp-4">
              {article.excerpt}
            </p>
          )}
        </div>

        {/* Bouton Save aligné en bas à droite */}
        <div className="mt-4 flex justify-end">
          <SaveButton articleId={article.id} />
        </div>
      </div>
    </div>
  );
}
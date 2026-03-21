// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import React from 'react';
import { Link } from 'react-router-dom';
import { useSavedArticles } from '@/hooks/useSavedArticles';
import { isInternalUrl } from '@/utils/url';
import type { Article } from '@/types/article'; // <- utiliser le type partagé
import { useAuthRequired } from '@/hooks/useAuthRequired';

import SaveButton from '@/components/ui/SaveButton';
import ArticleThumbnail from './ArticleThumbnail';
import CategoryBadge from '@/components/shared/CategoryBadge';

export default function ArticleCard({ article, disableLink = false }: { article: Article; disableLink?: boolean }) {
  const { isSaved } = useSavedArticles();
  const saved = isSaved(article.id);
  const internal = isInternalUrl(article.url);

  // 👉 normalisation locale de la catégorie
  let categoryLabel: string | null;
  if (typeof article.category === 'string') {
    categoryLabel = article.category;
  } else if (
    article.category &&
    typeof article.category === 'object' &&
    'name' in article.category
  ) {
    categoryLabel = (article.category as { name?: string }).name ?? null;
  } else {
    categoryLabel = null;
  }

  const Image = (
    <div className="group relative aspect-[16/9] overflow-hidden rounded-b-none">
      <ArticleThumbnail
        imageUrl={article.imageUrl}
        title={article.title}
        category={categoryLabel}
        className="h-full w-full"
      />
    </div>
  );

  const Body = (
    <div className="p-3">
      {!!categoryLabel && (
        <CategoryBadge category={categoryLabel} className="mb-2" />
      )}
      <h4 className="leading-snug group-hover:underline">{article.title}</h4>
      {article.excerpt && (
        <p className="mt-1 line-clamp-2 text-sm opacity-80">
          {article.excerpt}
        </p>
      )}
    </div>
  );

  const { requireAuth } = useAuthRequired();

  const handleClick = (e: React.MouseEvent) => {
    if (!requireAuth('Connectez-vous pour lire cet article.')) {
      e.preventDefault();
    }
  };

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    if (disableLink) return <div className="block h-full cursor-pointer">{children}</div>;

    if (internal) return <Link onClick={handleClick} to={article.url} className="block">{children}</Link>;
    return (
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className="block"
      >
        {children}
      </a>
    );
  };

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm
                 transition-shadow hover:shadow-md dark:border-white/10 dark:bg-neutral-950"
    >
      <SaveButton
        articleId={article.id}
        variant="card-pill"
        className="absolute right-2 top-2 z-10"
      />

      <Wrapper>
        {Image}
        {Body}
      </Wrapper>
    </div>
  );
}
// FIN BLOC

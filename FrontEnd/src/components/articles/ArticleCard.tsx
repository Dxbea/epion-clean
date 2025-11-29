// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import React from 'react';
import { useSavedArticles } from '@/hooks/useSavedArticles';
import { isInternalUrl } from '@/utils/url';
import type { Article } from '@/types/article'; // <- utiliser le type partagé
import { useAuthRequired } from '@/hooks/useAuthRequired';

const ERROR_IMG = '/img/placeholder.svg';

export default function ArticleCard({ article }: { article: Article }) {
  const { isSaved, toggle } = useSavedArticles();
  const { requireAuth } = useAuthRequired();
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
    <div className="relative aspect-[16/9] overflow-hidden rounded-b-none">
      <img
        src={article.imageUrl || ERROR_IMG}
        alt={article.title}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = ERROR_IMG;
        }}
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        decoding="async"
        width={960}
        height={540}
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
      />
    </div>
  );

  const Body = (
    <div className="p-3">
      {!!categoryLabel && (
        <div className="mb-1 text-xs opacity-70">{categoryLabel}</div>
      )}
      <h4 className="leading-snug group-hover:underline">{article.title}</h4>
      {article.excerpt && (
        <p className="mt-1 line-clamp-2 text-sm opacity-80">
          {article.excerpt}
        </p>
      )}
    </div>
  );

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    if (internal) return <a href={article.url}>{children}</a>;
    return (
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
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
      <button
        aria-label={saved ? 'Remove from saved' : 'Save article'}
        onClick={(e) => {
          e.preventDefault();
          // 🔐 blocage invité + popup
          const ok = requireAuth('You need to sign in to save articles.');
          if (!ok) return;
          toggle(article.id);
        }}
        className="absolute right-2 top-2 z-10 rounded-full bg-white/90 px-2 py-1 text-xs shadow hover:bg-white
                   dark:bg-neutral-900/90"
      >
        {saved ? 'Saved ★' : 'Save ☆'}
      </button>

      <Wrapper>
        {Image}
        {Body}
      </Wrapper>
    </div>
  );
}
// FIN BLOC

import React from 'react';
import ArticleCard, { type Article } from './ArticleCard';
import SectionHeader from '../SectionHeader';

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

export default function ArticleSection({
  title = '',
  articles,
  category,
  showHeader = true,
  showHeaderBar = true,
}: {
  title?: string;
  articles: Article[];
  category?: string;
  showHeader?: boolean;
  showHeaderBar?: boolean;
}) {
  const items = articles.slice(0, 3);
  const ctaTo = category ? `/actuality/${slugify(category)}` : undefined;

  return (
    <section className="space-y-3">
      {showHeader && (
        <SectionHeader
          title={title}
          showBar={showHeaderBar}
          right={
            ctaTo && (
              <a
                href={ctaTo}
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm hover:bg-black/5 dark:border-white/10"
              >
                Browse {category}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="opacity-70">
                  <path
                    d="M9 18l6-6-6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            )
          }
        />
      )}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((a) => (
          <ArticleCard key={a.id} article={a} />
        ))}
      </div>
    </section>
  );
}

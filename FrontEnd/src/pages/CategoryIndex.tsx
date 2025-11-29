import React from 'react';
import { Link } from 'react-router-dom';

// mêmes catégories que ton Footer par défaut pour cohérence
const CATEGORIES = [
  'Politics','World','Economy','Tech','Science','Environment',
  'Business','National','Opinions','Trending','Weather','Other'
];

export default function CategoryIndex(){
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Browse categories</h1>
        <div className="hidden sm:block w-[30vw] h-[2px] bg-gradient-to-r from-[#2A6FBF] via-[#4290D3] to-[#7EC3FF] rounded-md" />
      </header>

      <p className="text-black/70 dark:text-white/70 mb-6">
        Choisis une catégorie pour voir les articles correspondants.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {CATEGORIES.map((c) => {
          const slug = c.toLowerCase().replace(/\s+/g,'-');
          return (
            <Link
              key={c}
              to={`/actuality/${slug}`} // redirige vers la page de catégorie spécifique (déjà prévue)
              className="rounded-xl border border-black/10 px-4 py-3 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            >
              {c}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

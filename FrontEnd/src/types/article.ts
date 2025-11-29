// src/types/article.ts

// Forme "carte d'article" qu'on affiche partout (cards, listes, hero, etc.)
export type Article = {
  id: string

  // pour construire des liens /article/:slug
  slug?: string | null

  // affichage
  title: string
  excerpt: string | null
  imageUrl: string | null

  // méta
  publishedAt: string // ISO string (createdAt côté back)
  category?: string | null

  // optionnels selon l'endpoint
  url?: string            // souvent déjà construit par l'API pour éviter de refaire `/article/${slug}`
  tags?: string[]
  views?: number
};

// Forme "article détaillé" (page Article, page EditArticle...)
export type FullArticle = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  content: string | null
  imageUrl: string | null
  publishedAt: string // createdAt
  status?: string

  category: {
    id: string
    slug: string
    name: string
  } | null

  author: {
    id: string
    email: string
    name: string | null
  } | null
};

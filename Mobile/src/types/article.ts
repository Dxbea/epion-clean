export type Article = {
  id: string;
  slug?: string;
  title: string;
  excerpt?: string;
  category?: string;
  categorySlug?: string;
  imageUrl?: string;
  publishedAt?: string;
  views?: number;
  url?: string;
};

export type ArticlePage = {
  items: Article[];
  nextCursor: string | null;
};

export type ArticleDetail = Article & {
  body?: string;
  aiSummary?: string;
  authorName?: string;
  factCheckScore?: number;
  factCheckStatus?: string;
  supportLevel?: string;
  sourcesCount?: number;
  generationPrompt?: string;
  structuredContentAvailable?: boolean;
  viewsAll?: number;
};

export type ArticleApiItem = {
  id?: string | number;
  slug?: string;
  title?: unknown;
  excerpt?: unknown;
  summary?: unknown;
  description?: unknown;
  category?: unknown;
  imageUrl?: unknown;
  publishedAt?: unknown;
  createdAt?: unknown;
  views?: unknown;
  url?: unknown;
  factCheckScore?: unknown;
  factCheckStatus?: unknown;
  factCheckData?: unknown;
  sources?: unknown;
};

export type ArticleDetailApiItem = ArticleApiItem & {
  content?: unknown;
  body?: unknown;
  aiSummary?: unknown;
  author?: unknown;
  generationPrompt?: unknown;
  structuredContent?: unknown;
};

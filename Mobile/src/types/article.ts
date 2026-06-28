export type Article = {
  id: string;
  title: string;
  excerpt?: string;
  category?: string;
};

export type ArticleDetail = Article & {
  publishedAt?: string;
  body?: string;
};

export type ArticleApiItem = {
  id?: string | number;
  slug?: string;
  title?: unknown;
  excerpt?: unknown;
  summary?: unknown;
  description?: unknown;
  category?: unknown;
};

export type ArticleDetailApiItem = ArticleApiItem & {
  content?: unknown;
  body?: unknown;
  publishedAt?: unknown;
  createdAt?: unknown;
};

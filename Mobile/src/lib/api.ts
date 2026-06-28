import type { Article, ArticleApiItem, ArticleDetail, ArticleDetailApiItem } from '@/types/article';

export const API_BASE = 'https://api.epion.app';
export const WEB_ORIGIN = 'https://epion.app';
export const AUTH_CALLBACK_URL = `${WEB_ORIGIN}/verify-email`;

export function getHeaderValue(headers: Headers, name: string): string | null {
  return headers.get(name) ?? headers.get(name.toLowerCase()) ?? headers.get(name.toUpperCase());
}

export async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function readOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readCategory(value: unknown): string | undefined {
  const directCategory = readOptionalText(value);

  if (directCategory) {
    return directCategory;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return readOptionalText(record.name) ?? readOptionalText(record.slug);
  }

  return undefined;
}

function getArticleItems(payload: unknown): ArticleApiItem[] {
  if (Array.isArray(payload)) {
    return payload as ArticleApiItem[];
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const candidates = [record.articles, record.items, record.data];
    const match = candidates.find(Array.isArray);

    if (match) {
      return match as ArticleApiItem[];
    }
  }

  return [];
}

function getArticlePayload(payload: unknown): ArticleDetailApiItem | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;

  if (record.article && typeof record.article === 'object') {
    return record.article as ArticleDetailApiItem;
  }

  if (record.item && typeof record.item === 'object') {
    return record.item as ArticleDetailApiItem;
  }

  if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
    return record.data as ArticleDetailApiItem;
  }

  return record as ArticleDetailApiItem;
}

function normalizeArticle(item: ArticleApiItem, index: number): Article | null {
  const title = readOptionalText(item.title);

  if (!title) {
    return null;
  }

  return {
    id: String(item.id ?? item.slug ?? index),
    title,
    excerpt:
      readOptionalText(item.excerpt) ??
      readOptionalText(item.summary) ??
      readOptionalText(item.description),
    category: readCategory(item.category),
  };
}

function normalizeArticleDetail(item: ArticleDetailApiItem | null, fallbackId: string): ArticleDetail | null {
  if (!item) {
    return null;
  }

  const article = normalizeArticle(item, 0);

  if (!article) {
    return null;
  }

  return {
    ...article,
    id: String(item.id ?? fallbackId),
    publishedAt: readOptionalText(item.publishedAt) ?? readOptionalText(item.createdAt),
    body: readOptionalText(item.content) ?? readOptionalText(item.body),
  };
}

export async function fetchArticles(): Promise<Article[]> {
  const response = await fetch(`${API_BASE}/api/articles`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await readJson(response);

  return getArticleItems(payload)
    .map(normalizeArticle)
    .filter((article): article is Article => article !== null);
}

export async function fetchArticleDetail(articleId: string): Promise<ArticleDetail | null> {
  const response = await fetch(`${API_BASE}/api/articles/${encodeURIComponent(articleId)}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await readJson(response);
  return normalizeArticleDetail(getArticlePayload(payload), articleId);
}




export type Category = {
  id: string;
  name: string;
  slug: string;
  articleCount?: number;
};

export type ChatSessionSummary = {
  id: string;
  title: string;
  updatedAt?: string;
};

function getItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const candidates = [record.items, record.articles, record.data, record.sessions];
    const match = candidates.find(Array.isArray);

    if (match) {
      return match;
    }
  }

  return [];
}

export async function fetchCategories(): Promise<Category[]> {
  const response = await fetch(`${API_BASE}/api/categories`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await readJson(response);

  return getItems(payload)
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const record = item as Record<string, unknown>;
      const name = readOptionalText(record.name);
      const slug = readOptionalText(record.slug) ?? name?.toLowerCase().replace(/\s+/g, '-');

      if (!name || !slug) {
        return null;
      }

      return {
        id: String(record.id ?? slug),
        name,
        slug,
        ...(typeof record.articleCount === 'number' ? { articleCount: record.articleCount } : {}),
      };
    })
    .filter((category): category is Category => category !== null);
}

export async function searchArticles(query: string): Promise<Article[]> {
  const params = new URLSearchParams({
    q: query,
    take: '24',
  });
  const response = await fetch(`${API_BASE}/api/articles/search?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await readJson(response);

  return getArticleItems(payload)
    .map(normalizeArticle)
    .filter((article): article is Article => article !== null);
}

export async function fetchCategoryArticles(slug: string): Promise<Article[]> {
  const params = new URLSearchParams({
    take: '24',
  });
  const response = await fetch(`${API_BASE}/api/categories/${encodeURIComponent(slug)}/articles?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await readJson(response);

  return getArticleItems(payload)
    .map(normalizeArticle)
    .filter((article): article is Article => article !== null);
}

export async function fetchFavoriteArticles(): Promise<Article[]> {
  const response = await fetch(`${API_BASE}/api/favorites?take=24`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await readJson(response);

  return getArticleItems(payload)
    .map(normalizeArticle)
    .filter((article): article is Article => article !== null);
}

export async function fetchMyArticles(): Promise<Article[]> {
  const response = await fetch(`${API_BASE}/api/me/articles?take=24`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await readJson(response);

  return getArticleItems(payload)
    .map(normalizeArticle)
    .filter((article): article is Article => article !== null);
}

export async function fetchChatSessions(): Promise<ChatSessionSummary[]> {
  const response = await fetch(`${API_BASE}/api/chat/sessions?take=20`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await readJson(response);

  return getItems(payload)
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const record = item as Record<string, unknown>;
      const id = readOptionalText(record.id);

      if (!id) {
        return null;
      }

      const updatedAt = readOptionalText(record.updatedAt);

      return {
        id,
        title: readOptionalText(record.title) ?? 'Conversation sans titre',
        ...(updatedAt ? { updatedAt } : {}),
      };
    })
    .filter((session): session is ChatSessionSummary => session !== null);
}


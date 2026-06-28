import type {
  Article,
  ArticleApiItem,
  ArticleComment,
  ArticleCommentsPage,
  ArticleDetail,
  ArticleDetailApiItem,
  ArticleReactionSummary,
  ArticleSource,
} from '@/types/article';

export const API_BASE = 'https://api.epion.app';
export const WEB_ORIGIN = 'https://epion.app';
export const AUTH_CALLBACK_URL = `${WEB_ORIGIN}/verify-email`;

export function getHeaderValue(headers: Headers, name: string): string | null {
  return headers.get(name) ?? headers.get(name.toLowerCase()) ?? headers.get(name.toUpperCase());
}

export async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

let cachedCsrfToken: string | null = null;
let csrfInflight: Promise<string> | null = null;

async function getCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken;

  if (!csrfInflight) {
    csrfInflight = (async () => {
      const response = await fetch(`${API_BASE}/api/csrf`, {
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await readJson(response);
      const token = payload && typeof payload === 'object' ? readOptionalText((payload as Record<string, unknown>).token) : undefined;

      if (!token) {
        throw new Error('Missing CSRF token');
      }

      cachedCsrfToken = token;
      return token;
    })().finally(() => {
      csrfInflight = null;
    });
  }

  return csrfInflight;
}

async function withCsrf(init: RequestInit = {}): Promise<RequestInit> {
  const token = await getCsrfToken();

  return {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.headers ?? {}),
      'X-CSRF-Token': token,
    },
  };
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
  createdAt?: string;
  updatedAt?: string;
  folderId?: string | null;
};

export type ChatRigor = 'fast' | 'balanced' | 'precise';

export type ChatResponseStyle = 'concise' | 'normal' | 'detailed';

export type ChatSessionDetail = ChatSessionSummary & {
  mode?: ChatRigor;
};

export type ChatMessageItem = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  sources?: unknown[];
  metadata?: unknown;
};

export type ArticlePage = {
  items: Article[];
  nextCursor: string | null;
};

function readOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readCategoryName(value: unknown): string | undefined {
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

function readCategorySlug(value: unknown): string | undefined {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return readOptionalText(record.slug);
  }

  return undefined;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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

function getNextCursor(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const cursor = (payload as Record<string, unknown>).nextCursor;
  return readOptionalText(cursor) ?? null;
}
function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readNestedNumber(record: Record<string, unknown> | null, keys: string[]): number | undefined {
  let current: unknown = record;

  for (const key of keys) {
    const currentRecord = readRecord(current);
    if (!currentRecord) return undefined;
    current = currentRecord[key];
  }

  return readOptionalNumber(current);
}

function parsePotentialSources(sources: unknown, factCheckData: unknown): unknown[] {
  const candidates = [sources, factCheckData];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;

    if (typeof candidate === 'string' && candidate.trim()) {
      try {
        const parsed = JSON.parse(candidate) as unknown;
        if (Array.isArray(parsed)) return parsed;
        const parsedRecord = readRecord(parsed);
        if (Array.isArray(parsedRecord?.sources)) return parsedRecord.sources;
      } catch {
        continue;
      }
    }

    const record = readRecord(candidate);
    if (Array.isArray(record?.sources)) return record.sources;
  }

  return [];
}

function resolveSourceDomain(record: Record<string, unknown>): string {
  const domain = readOptionalText(record.domain) ?? readOptionalText(record.name);
  if (domain) return domain;

  const url = readOptionalText(record.url) ?? readOptionalText(record.link);
  if (!url) return 'Source inconnue';

  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function resolveSourceScore(record: Record<string, unknown>): number | undefined {
  return (
    readOptionalNumber(record.trustScore) ??
    readNestedNumber(readRecord(record.metadata), ['dbScore']) ??
    readOptionalNumber(record.dbScore) ??
    readOptionalNumber(record.score)
  );
}

function normalizeArticleSource(item: unknown, index: number): ArticleSource | null {
  const record = readRecord(item);
  if (!record) return null;

  const domain = resolveSourceDomain(record);
  const url = readOptionalText(record.url) ?? readOptionalText(record.link);
  const trustScore = resolveSourceScore(record);
  const id = readOptionalText(record.id) ?? readOptionalText(record.sourceId) ?? (url ? undefined : String(index));
  const type = readOptionalText(record.type) ?? readOptionalText(record.category);
  const description = readOptionalText(record.description) ?? readOptionalText(readRecord(record.metadata)?.description);

  return {
    ...(id ? { id } : {}),
    name: domain,
    domain,
    ...(url ? { url } : {}),
    ...(trustScore !== undefined ? { trustScore } : {}),
    ...(type ? { type } : {}),
    ...(description ? { description } : {}),
  };
}

function normalizeArticleSources(sources: unknown, factCheckData: unknown): ArticleSource[] {
  return parsePotentialSources(sources, factCheckData)
    .map(normalizeArticleSource)
    .filter((source): source is ArticleSource => source !== null);
}

function readFactCheckScore(item: ArticleDetailApiItem): number | undefined {
  const factCheckData = readRecord(item.factCheckData);
  return (
    readOptionalNumber(item.factCheckScore) ??
    readOptionalNumber(factCheckData?.score) ??
    readOptionalNumber(factCheckData?.factScore)
  );
}

function normalizeArticleComment(item: unknown): ArticleComment | null {
  const record = readRecord(item);
  if (!record) return null;

  const id = readOptionalText(record.id);
  const content = readOptionalText(record.content) ?? readOptionalText(record.text);
  const createdAt = readOptionalText(record.createdAt);

  if (!id || !content || !createdAt) return null;

  const author = readRecord(record.author);
  const authorName = author ? readOptionalText(author.name) ?? readOptionalText(author.username) ?? readOptionalText(author.email) : undefined;
  const repliesCount = readOptionalNumber(record.repliesCount);

  return {
    id,
    content,
    createdAt,
    ...(authorName ? { authorName } : {}),
    ...(repliesCount !== undefined ? { repliesCount } : {}),
  };
}

function normalizeReactionSummary(payload: unknown): ArticleReactionSummary {
  const record = readRecord(payload) ?? {};
  const rawReaction = readOptionalText(record.userReaction);

  return {
    likes: readOptionalNumber(record.likes) ?? 0,
    dislikes: readOptionalNumber(record.dislikes) ?? 0,
    reposts: readOptionalNumber(record.reposts) ?? 0,
    userReaction: rawReaction === 'LIKE' || rawReaction === 'DISLIKE' ? rawReaction : null,
    userReposted: record.userReposted === true,
  };
}
function normalizeChatSession(item: unknown): ChatSessionSummary | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const record = item as Record<string, unknown>;
  const id = readOptionalText(record.id);

  if (!id) {
    return null;
  }

  const createdAt = readOptionalText(record.createdAt);
  const updatedAt = readOptionalText(record.updatedAt);
  const folderId = readOptionalText(record.folderId) ?? null;

  return {
    id,
    title: readOptionalText(record.title) ?? 'Conversation sans titre',
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    folderId,
  };
}

function normalizeChatSessionDetail(payload: unknown): ChatSessionDetail | null {
  const session = normalizeChatSession(payload);

  if (!session || !payload || typeof payload !== 'object') {
    return session;
  }

  const mode = readOptionalText((payload as Record<string, unknown>).mode);

  return {
    ...session,
    ...(mode === 'fast' || mode === 'balanced' || mode === 'precise' ? { mode } : {}),
  };
}

function normalizeChatMessage(item: unknown): ChatMessageItem | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const record = item as Record<string, unknown>;
  const id = readOptionalText(record.id);
  const rawRole = readOptionalText(record.role);
  const content = typeof record.content === 'string' ? record.content : '';
  const createdAt = readOptionalText(record.createdAt);

  if (!id || !createdAt || (rawRole !== 'user' && rawRole !== 'assistant')) {
    return null;
  }

  return {
    id,
    role: rawRole,
    content,
    createdAt,
    ...(Array.isArray(record.sources) ? { sources: record.sources } : {}),
    ...(record.metadata !== undefined ? { metadata: record.metadata } : {}),
  };
}

function buildApiError(response: Response, payload: unknown): Error {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const message = readOptionalText(record.message) ?? readOptionalText(record.error) ?? `HTTP ${response.status}`;
  const error = new Error(message) as Error & { status?: number; code?: string };
  error.status = response.status;
  error.code = readOptionalText(record.code) ?? readOptionalText(record.error);
  return error;
}

function parseChatStreamText(text: string): string {
  if (!text.trim()) {
    return '';
  }

  let content = '';
  const events = text.split(/\n\n+/);

  for (const event of events) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim();

    if (!data) {
      continue;
    }

    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;
      if (parsed.type === 'text' && typeof parsed.content === 'string') {
        content += parsed.content;
      }
    } catch {
      // Ignore malformed stream events; the canonical messages are reloaded after POST.
    }
  }

  return content;
}

function getArticleItems(payload: unknown): ArticleApiItem[] {
  return getItems(payload) as ArticleApiItem[];
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

function countPotentialSources(sources: unknown, factCheckData: unknown): number | undefined {
  const candidates = [sources, factCheckData];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.length;
    }

    if (candidate && typeof candidate === 'object') {
      const nested = (candidate as Record<string, unknown>).sources;
      if (Array.isArray(nested)) {
        return nested.length;
      }
    }
  }

  return undefined;
}

function readSupportLevel(factCheckData: unknown, score?: number): string | undefined {
  if (factCheckData && typeof factCheckData === 'object') {
    const supportLevel = readOptionalText((factCheckData as Record<string, unknown>).supportLevel);
    if (supportLevel) {
      return supportLevel;
    }
  }

  if (score === undefined) {
    return undefined;
  }

  if (score >= 90) return 'Tres solide';
  if (score >= 70) return 'Solide';
  if (score >= 50) return 'A nuancer';
  if (score >= 30) return 'Fragile';
  return 'A verifier';
}

function normalizeArticle(item: ArticleApiItem, index: number): Article | null {
  const title = readOptionalText(item.title);

  if (!title) {
    return null;
  }

  const slug = readOptionalText(item.slug);
  const category = readCategoryName(item.category);
  const categorySlug = readCategorySlug(item.category) ?? (category ? slugify(category) : undefined);
  const publishedAt = readOptionalText(item.publishedAt) ?? readOptionalText(item.createdAt);
  const imageUrl = readOptionalText(item.imageUrl);
  const excerpt = readOptionalText(item.excerpt) ?? readOptionalText(item.summary) ?? readOptionalText(item.description);
  const url = readOptionalText(item.url) ?? (slug ? `/article/${slug}` : undefined);
  const views = readOptionalNumber(item.views);

  return {
    id: String(item.id ?? slug ?? index),
    ...(slug ? { slug } : {}),
    title,
    ...(excerpt ? { excerpt } : {}),
    ...(category ? { category } : {}),
    ...(categorySlug ? { categorySlug } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(views !== undefined ? { views } : {}),
    ...(url ? { url } : {}),
  };
}

function readAuthorName(author: unknown): string | undefined {
  if (!author || typeof author !== 'object') {
    return undefined;
  }

  const record = author as Record<string, unknown>;
  return readOptionalText(record.name) ?? readOptionalText(record.username) ?? readOptionalText(record.email);
}

function normalizeArticleDetail(item: ArticleDetailApiItem | null, fallbackId: string): ArticleDetail | null {
  if (!item) {
    return null;
  }

  const article = normalizeArticle(item, 0);

  if (!article) {
    return null;
  }

  const factCheckScore = readFactCheckScore(item);
  const factCheckStatus = readOptionalText(item.factCheckStatus);
  const body = readOptionalText(item.content) ?? readOptionalText(item.body);
  const aiSummary = readOptionalText(item.aiSummary);
  const generationPrompt = readOptionalText(item.generationPrompt);
  const authorName = readAuthorName(item.author);
  const sources = normalizeArticleSources(item.sources, item.factCheckData);
  const sourcesCount = sources.length || countPotentialSources(item.sources, item.factCheckData);
  const supportLevel = readSupportLevel(item.factCheckData, factCheckScore);

  return {
    ...article,
    id: String(item.id ?? fallbackId),
    ...(body ? { body } : {}),
    ...(aiSummary ? { aiSummary } : {}),
    ...(authorName ? { authorName } : {}),
    ...(factCheckScore !== undefined ? { factCheckScore } : {}),
    ...(factCheckStatus ? { factCheckStatus } : {}),
    ...(supportLevel ? { supportLevel } : {}),
    ...(sourcesCount !== undefined ? { sourcesCount } : {}),
    ...(sources.length > 0 ? { sources } : {}),
    ...(generationPrompt ? { generationPrompt } : {}),
    ...(item.structuredContent ? { structuredContentAvailable: true } : {}),
  };
}

async function fetchArticlePage(path: string): Promise<ArticlePage> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await readJson(response);

  return {
    items: getArticleItems(payload)
      .map(normalizeArticle)
      .filter((article): article is Article => article !== null),
    nextCursor: getNextCursor(payload),
  };
}

export async function fetchArticlesPage(options?: { take?: number; cursor?: string | null; status?: 'PUBLISHED' | 'ALL' }): Promise<ArticlePage> {
  const params = new URLSearchParams();
  params.set('take', String(Math.min(options?.take ?? 24, 50)));
  if (options?.status === 'ALL') params.set('status', 'all');
  if (options?.cursor) params.set('cursor', options.cursor);

  return fetchArticlePage(`/api/articles?${params.toString()}`);
}

export async function fetchArticles(): Promise<Article[]> {
  return (await fetchArticlesPage()).items;
}

export async function fetchTopArticles(period: '7d' | 'all' = '7d', take = 12): Promise<Article[]> {
  const params = new URLSearchParams({ period, take: String(take) });
  return (await fetchArticlePage(`/api/articles/top?${params.toString()}`)).items;
}

export async function fetchFollowingArticles(): Promise<Article[]> {
  const response = await fetch(`${API_BASE}/api/articles/following`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (response.status === 401) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await readJson(response);
  return getArticleItems(payload)
    .map(normalizeArticle)
    .filter((article): article is Article => article !== null);
}

export async function fetchArticleDetail(articleId: string): Promise<ArticleDetail | null> {
  const encoded = encodeURIComponent(articleId);
  const primary = await fetch(`${API_BASE}/api/articles/${encoded}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  let response = primary;

  if (primary.status === 404) {
    response = await fetch(`${API_BASE}/api/articles/slug/${encoded}`, {
      headers: {
        Accept: 'application/json',
      },
    });
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await readJson(response);
  return normalizeArticleDetail(getArticlePayload(payload), articleId);
}

export async function fetchArticleBySlug(slug: string): Promise<ArticleDetail | null> {
  const response = await fetch(`${API_BASE}/api/articles/slug/${encodeURIComponent(slug)}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await readJson(response);
  return normalizeArticleDetail(getArticlePayload(payload), slug);
}

export async function recordArticleView(articleId: string): Promise<void> {
  await fetch(`${API_BASE}/api/articles/${encodeURIComponent(articleId)}/view`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => undefined);
}

export async function fetchArticleStats(articleId: string): Promise<{ viewsAll?: number }> {
  const response = await fetch(`${API_BASE}/api/articles/${encodeURIComponent(articleId)}/stats`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return {};
  }

  const payload = await readJson(response);
  const viewsAll = payload && typeof payload === 'object' ? readOptionalNumber((payload as Record<string, unknown>).viewsAll) : undefined;
  return viewsAll === undefined ? {} : { viewsAll };
}

export async function fetchArticleReactions(articleId: string): Promise<ArticleReactionSummary> {
  const response = await fetch(`${API_BASE}/api/articles/${encodeURIComponent(articleId)}/reactions`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return normalizeReactionSummary(await readJson(response));
}

export async function toggleArticleReaction(articleId: string, type: 'LIKE' | 'DISLIKE'): Promise<ArticleReactionSummary> {
  const response = await fetch(
    `${API_BASE}/api/articles/${encodeURIComponent(articleId)}/react`,
    await withCsrf({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type }),
    }),
  );

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }

  return normalizeReactionSummary(payload);
}

export async function fetchArticleComments(articleId: string, cursor?: string | null): Promise<ArticleCommentsPage> {
  const params = new URLSearchParams({ take: '20' });
  if (cursor) params.set('cursor', cursor);

  const response = await fetch(`${API_BASE}/api/articles/${encodeURIComponent(articleId)}/comments?${params.toString()}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await readJson(response);

  return {
    items: getItems(payload).map(normalizeArticleComment).filter((comment): comment is ArticleComment => comment !== null),
    nextCursor: getNextCursor(payload),
  };
}

export async function postArticleComment(articleId: string, content: string): Promise<ArticleComment> {
  const response = await fetch(
    `${API_BASE}/api/articles/${encodeURIComponent(articleId)}/comments`,
    await withCsrf({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    }),
  );

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }

  const comment = normalizeArticleComment(payload);
  if (!comment) {
    throw new Error('Invalid comment response');
  }

  return comment;
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
      const slug = readOptionalText(record.slug) ?? (name ? slugify(name) : undefined);

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
    .filter((category): category is Category => category !== null)
    .sort((a, b) => (b.articleCount ?? 0) - (a.articleCount ?? 0));
}

export async function searchArticlesPage(query: string, options?: { take?: number; cursor?: string | null }): Promise<ArticlePage> {
  const params = new URLSearchParams({
    q: query,
    take: String(Math.min(options?.take ?? 24, 50)),
  });
  if (options?.cursor) params.set('cursor', options.cursor);

  return fetchArticlePage(`/api/articles/search?${params.toString()}`);
}

export async function searchArticles(query: string): Promise<Article[]> {
  return (await searchArticlesPage(query)).items;
}

export async function fetchCategoryArticlesPage(slug: string, options?: { take?: number; cursor?: string | null }): Promise<ArticlePage> {
  const params = new URLSearchParams({
    take: String(Math.min(options?.take ?? 24, 50)),
  });
  if (options?.cursor) params.set('cursor', options.cursor);

  return fetchArticlePage(`/api/categories/${encodeURIComponent(slug)}/articles?${params.toString()}`);
}

export async function fetchCategoryArticles(slug: string): Promise<Article[]> {
  return (await fetchCategoryArticlesPage(slug)).items;
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

export async function fetchFavoriteArticleIds(): Promise<string[]> {
  const response = await fetch(`${API_BASE}/api/favorites/ids`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (response.status === 401) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await readJson(response);
  const ids = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).ids : undefined;
  return Array.isArray(ids) ? ids.map(String) : [];
}
export async function saveFavoriteArticle(articleId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/favorites/${encodeURIComponent(articleId)}`,
    await withCsrf({
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
    }),
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

export async function removeFavoriteArticle(articleId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/favorites/${encodeURIComponent(articleId)}`,
    await withCsrf({
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
    }),
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
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

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }

  return getItems(payload)
    .map(normalizeChatSession)
    .filter((session): session is ChatSessionSummary => session !== null);
}

export async function createChatSession(options?: { title?: string; mode?: ChatRigor }): Promise<ChatSessionDetail> {
  const body = {
    ...(options?.title ? { title: options.title } : {}),
    mode: options?.mode ?? 'balanced',
  };

  const response = await fetch(
    `${API_BASE}/api/chat/sessions`,
    await withCsrf({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
  );

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }

  const session = normalizeChatSessionDetail(payload);
  if (!session) {
    throw new Error('Invalid chat session response');
  }

  return session;
}

export async function fetchChatSession(sessionId: string): Promise<ChatSessionDetail> {
  const response = await fetch(`${API_BASE}/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }

  const session = normalizeChatSessionDetail(payload);
  if (!session) {
    throw new Error('Invalid chat session response');
  }

  return session;
}

export async function fetchChatMessages(sessionId: string): Promise<ChatMessageItem[]> {
  const response = await fetch(`${API_BASE}/api/chat/sessions/${encodeURIComponent(sessionId)}/messages?take=100`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }

  return getItems(payload)
    .map(normalizeChatMessage)
    .filter((message): message is ChatMessageItem => message !== null);
}

export async function sendChatMessage(
  sessionId: string,
  content: string,
  options?: {
    model?: 'sonar' | 'sonar-pro';
    mode?: ChatRigor;
    responseStyle?: ChatResponseStyle;
  },
): Promise<{ streamedText: string }> {
  const response = await fetch(
    `${API_BASE}/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
    await withCsrf({
      method: 'POST',
      headers: {
        Accept: 'text/event-stream, application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        model: options?.model ?? 'sonar',
        mode: options?.mode ?? 'balanced',
        sourceRestricted: true,
        neutralityForced: true,
        timeRecent: false,
        responseStyle: options?.responseStyle ?? 'normal',
      }),
    }),
  );

  const text = await response.text().catch(() => '');

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { message: text };
    }
    throw buildApiError(response, payload);
  }

  return { streamedText: parseChatStreamText(text) };
}
export type MyArticleStatus = 'ALL' | 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type MyArticleStats = {
  total: number;
  draft: number;
  published: number;
  archived: number;
};

export type AccountSession = {
  id: string;
  createdAt: string;
  expiresAt: string | null;
  lastActiveAt?: string | null;
  current: boolean;
};

export type ActivityType = 'SAVED' | 'LIKED' | 'DISLIKED' | 'REPOSTED' | 'COMMENTS';

export type ActivityComment = {
  id: string;
  content: string;
  createdAt?: string;
  articleTitle?: string;
  articleId?: string;
  articleSlug?: string;
};

export type ActivityPage = {
  items: Article[] | ActivityComment[];
  nextCursor: string | null;
};

function normalizeCommentActivity(item: unknown): ActivityComment | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const record = item as Record<string, unknown>;
  const id = readOptionalText(record.id) ?? readOptionalText(record.commentId);
  const content = readOptionalText(record.content) ?? readOptionalText(record.text);

  if (!id || !content) {
    return null;
  }

  const article = record.article && typeof record.article === 'object' ? (record.article as Record<string, unknown>) : null;

  return {
    id,
    content,
    ...(readOptionalText(record.createdAt) ? { createdAt: readOptionalText(record.createdAt) } : {}),
    ...(article && readOptionalText(article.title) ? { articleTitle: readOptionalText(article.title) } : {}),
    ...(article && readOptionalText(article.id) ? { articleId: readOptionalText(article.id) } : {}),
    ...(article && readOptionalText(article.slug) ? { articleSlug: readOptionalText(article.slug) } : {}),
  };
}

export async function fetchMyArticlesPage(options?: {
  status?: MyArticleStatus;
  query?: string;
  cursor?: string | null;
  take?: number;
}): Promise<ArticlePage> {
  const params = new URLSearchParams();
  params.set('status', options?.status ?? 'ALL');
  params.set('take', String(Math.min(options?.take ?? 24, 50)));
  if (options?.query?.trim()) params.set('q', options.query.trim());
  if (options?.cursor) params.set('cursor', options.cursor);

  const response = await fetch(`${API_BASE}/api/me/articles?${params.toString()}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await readJson(response);
  return {
    items: getArticleItems(payload)
      .map(normalizeArticle)
      .filter((article): article is Article => article !== null),
    nextCursor: getNextCursor(payload),
  };
}

export async function fetchMyArticleStats(): Promise<MyArticleStats> {
  const response = await fetch(`${API_BASE}/api/me/articles/stats`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await readJson(response);
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

  return {
    total: readOptionalNumber(record.total) ?? 0,
    draft: readOptionalNumber(record.draft) ?? 0,
    published: readOptionalNumber(record.published) ?? 0,
    archived: readOptionalNumber(record.archived) ?? 0,
  };
}

export async function fetchAccountSessions(): Promise<AccountSession[]> {
  const response = await fetch(`${API_BASE}/api/me/sessions`, {
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
    .map((item): AccountSession | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const record = item as Record<string, unknown>;
      const id = readOptionalText(record.id);
      const createdAt = readOptionalText(record.createdAt);

      if (!id || !createdAt) {
        return null;
      }

      return {
        id,
        createdAt,
        expiresAt: readOptionalText(record.expiresAt) ?? null,
        ...(readOptionalText(record.lastActiveAt) ? { lastActiveAt: readOptionalText(record.lastActiveAt) } : {}),
        current: Boolean(record.current),
      };
    })
    .filter((session): session is AccountSession => session !== null);
}

export async function fetchActivityPage(type: ActivityType, options?: { cursor?: string | null; take?: number }): Promise<ActivityPage> {
  const params = new URLSearchParams({
    type,
    take: String(Math.min(options?.take ?? 24, 50)),
  });
  if (options?.cursor) params.set('cursor', options.cursor);

  const response = await fetch(`${API_BASE}/api/social/activity?${params.toString()}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await readJson(response);
  const rawItems = getItems(payload);

  return {
    items:
      type === 'COMMENTS'
        ? rawItems.map(normalizeCommentActivity).filter((item): item is ActivityComment => item !== null)
        : (rawItems as ArticleApiItem[]).map(normalizeArticle).filter((article): article is Article => article !== null),
    nextCursor: getNextCursor(payload),
  };
}

import type {
  Article,
  ArticleApiItem,
  ArticleComment,
  ArticleCommentsPage,
  ArticleDetail,
  ArticleContribution,
  ArticleContributionType,
  ArticleDetailApiItem,
  ArticleFactCheckDetail,
  ArticleInteractions,
  ArticleInteractionsSortMode,
  ArticleOpinionDistribution,
  ArticleReactionSummary,
  ArticleValidationSummary,
  ArticleValidationType,
  ArticleSource,
  ArticleSourceHighlight,
  StructuredArticleClaim,
  StructuredArticleContent,
  StructuredArticleItem,
  StructuredArticleSection,
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

export type ChatFolder = {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
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

export type GenerateArticleTone = 'neutral' | 'explainer' | 'short' | 'indepth';

export type GenerateArticleLanguage = 'fr' | 'en';

export type GenerateArticleParams = {
  topic: string;
  language: GenerateArticleLanguage;
  style: GenerateArticleTone;
  category?: string;
  categoryName?: string;
  categoryId?: string;
  generateImage: boolean;
  imageUrl?: string;
};

export type GeneratedArticleResult = {
  article?: {
    id?: string;
    slug?: string;
  };
  message?: string;
};

export type EditableArticleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type EditableArticle = {
  id: string;
  slug: string | null;
  title: string;
  summary: string;
  content: string;
  imageUrl: string | null;
  status: EditableArticleStatus;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  authorId: string | null;
};

export type UpdateEditableArticleParams = {
  title: string;
  summary: string | null;
  content: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  status: EditableArticleStatus;
};

export type EditArticleWithAIParams = {
  instruction: string;
  currentContent: string;
  field: 'title' | 'summary' | 'content' | 'items';
};

export type EditArticleWithAIResult = {
  result: string;
};

export type ImageProposal = {
  url: string;
  source: string;
  credit: string;
  description: string;
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

function readJsonRecord(value: unknown): Record<string, unknown> | null {
  const direct = readRecord(value);
  if (direct) return direct;

  if (typeof value === 'string' && value.trim()) {
    try {
      return readRecord(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }

  return null;
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
  const sourceId = readOptionalText(record.sourceId);
  const id = readOptionalText(record.id) ?? sourceId ?? (url ? undefined : String(index));
  const type = readOptionalText(record.type) ?? readOptionalText(record.category);
  const description = readOptionalText(record.description) ?? readOptionalText(readRecord(record.metadata)?.description);

  // Enriched fields
  const politicalBias = readOptionalText(record.politicalBias);
  const reliability = readOptionalText(record.reliability);
  const country = readOptionalText(record.country);
  const reputationScore = readOptionalNumber(record.reputationScore) ?? readNestedNumber(readRecord(record.metadata), ['reputationScore']);
  const analysisScore = readOptionalNumber(record.analysisScore) ?? readNestedNumber(readRecord(record.metadata), ['analysisScore']);
  const liveScore = readOptionalNumber(record.liveScore);
  const justification = readOptionalText(record.justification);

  const metricsRec = readRecord(record.metrics);
  const metrics = metricsRec && typeof metricsRec.transparency === 'number' ? {
    transparency: readOptionalNumber(metricsRec.transparency) ?? 50,
    editorial: readOptionalNumber(metricsRec.editorial) ?? 50,
    semantic: readOptionalNumber(metricsRec.semantic) ?? 50,
    logic: readOptionalNumber(metricsRec.logic) ?? readOptionalNumber((metricsRec as Record<string, unknown>).pluralism) ?? 50,
  } : undefined;

  const flagsRec = readRecord(record.flags);
  const flags = flagsRec ? {
    hasFactCheckFailures: flagsRec.hasFactCheckFailures === true,
    isClickbait: flagsRec.isClickbait === true,
    isAdsTxtValid: flagsRec.isAdsTxtValid !== false,
  } : undefined;

  return {
    ...(id ? { id } : {}),
    ...(sourceId ? { sourceId } : {}),
    name: domain,
    domain,
    ...(url ? { url } : {}),
    ...(trustScore !== undefined ? { trustScore } : {}),
    ...(type ? { type } : {}),
    ...(description ? { description } : {}),
    ...(politicalBias ? { politicalBias } : {}),
    ...(reliability ? { reliability } : {}),
    ...(country ? { country } : {}),
    ...(reputationScore !== undefined ? { reputationScore } : {}),
    ...(analysisScore !== undefined ? { analysisScore } : {}),
    ...(liveScore !== undefined ? { liveScore } : {}),
    ...(justification ? { justification } : {}),
    ...(metrics ? { metrics } : {}),
    ...(flags ? { flags } : {}),
  };
}

function normalizeArticleSources(sources: unknown, factCheckData: unknown): ArticleSource[] {
  return parsePotentialSources(sources, factCheckData)
    .map(normalizeArticleSource)
    .filter((source): source is ArticleSource => source !== null);
}

function readFactCheckScore(item: ArticleDetailApiItem): number | undefined {
  const factCheckData = readJsonRecord(item.factCheckData);
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
const EMPTY_OPINION_DISTRIBUTION: ArticleOpinionDistribution = {
  counts: {},
  total: 0,
  lacksContextCount: 0,
};

function normalizeValidationSummary(value: unknown): ArticleValidationSummary {
  const record = readRecord(value) ?? {};
  return {
    WELL_SOURCED: readOptionalNumber(record.WELL_SOURCED) ?? 0,
    ADDS_NUANCE: readOptionalNumber(record.ADDS_NUANCE) ?? 0,
    NEEDS_CHECK: readOptionalNumber(record.NEEDS_CHECK) ?? 0,
  };
}

function normalizeOpinionDistribution(value: unknown): ArticleOpinionDistribution {
  const record = readRecord(value);
  const countsRecord = readRecord(record?.counts);
  const counts: Record<string, number> = {};

  if (countsRecord) {
    for (const [key, count] of Object.entries(countsRecord)) {
      if (typeof count === 'number' && Number.isFinite(count)) {
        counts[key] = count;
      }
    }
  }

  return {
    counts,
    total: readOptionalNumber(record?.total) ?? EMPTY_OPINION_DISTRIBUTION.total,
    lacksContextCount: readOptionalNumber(record?.lacksContextCount) ?? EMPTY_OPINION_DISTRIBUTION.lacksContextCount,
  };
}

function normalizeContributionAuthor(value: unknown): ArticleContribution['author'] {
  const record = readRecord(value);
  if (!record) return null;

  const id = readOptionalText(record.id);
  if (!id) return null;

  const name = readOptionalText(record.name);
  const username = readOptionalText(record.username);
  const avatarUrl = readOptionalText(record.avatarUrl);

  return {
    id,
    ...(name ? { name } : {}),
    ...(username ? { username } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function normalizeContributionType(value: unknown): ArticleContributionType {
  const type = readOptionalText(value);
  if (type === 'SOURCE' || type === 'NUANCE' || type === 'CONTRADICTION' || type === 'QUESTION' || type === 'CORRECTION') {
    return type;
  }
  return 'NUANCE';
}

function normalizeValidationTypes(value: unknown): ArticleValidationType[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ArticleValidationType => item === 'WELL_SOURCED' || item === 'ADDS_NUANCE' || item === 'NEEDS_CHECK');
}

function normalizeContribution(item: unknown): ArticleContribution | null {
  const record = readRecord(item);
  if (!record) return null;

  const id = readOptionalText(record.id);
  if (!id) return null;

  const targetContributionId = readOptionalText(record.targetContributionId) ?? null;
  const rawStatus = readOptionalText(record.status);
  const status = rawStatus === 'DELETED' || rawStatus === 'HIDDEN' || rawStatus === 'STALE' ? rawStatus : 'ACTIVE';
  const text = typeof record.text === 'string' ? record.text : '';
  const sourceUrl = readOptionalText(record.sourceUrl) ?? null;
  const createdAt = readOptionalText(record.createdAt) ?? new Date(0).toISOString();
  const updatedAt = readOptionalText(record.updatedAt) ?? createdAt;
  const editedAt = readOptionalText(record.editedAt) ?? null;

  return {
    id,
    targetContributionId,
    status,
    type: normalizeContributionType(record.type),
    text,
    sourceUrl,
    bridgingScore: readOptionalNumber(record.bridgingScore) ?? 0,
    editedAt,
    editCount: readOptionalNumber(record.editCount) ?? 0,
    createdAt,
    updatedAt,
    author: normalizeContributionAuthor(record.author),
    validationSummary: normalizeValidationSummary(record.validationSummary),
    currentUserValidations: normalizeValidationTypes(record.currentUserValidations),
    children: Array.isArray(record.children) ? record.children.map(normalizeContribution).filter((child): child is ArticleContribution => child !== null) : [],
  };
}

function normalizeArticleInteractions(payload: unknown): ArticleInteractions {
  const record = readRecord(payload) ?? {};
  const questionRecord = readRecord(record.opinionQuestion);
  const currentPositionRecord = readRecord(record.currentUserOpinionPosition);

  return {
    opinionQuestion: questionRecord
      ? {
          id: readOptionalText(questionRecord.id) ?? '',
          articleId: readOptionalText(questionRecord.articleId) ?? '',
          question: readOptionalText(questionRecord.question) ?? '',
          thesisA: readOptionalText(questionRecord.thesisA) ?? '',
          thesisB: readOptionalText(questionRecord.thesisB) ?? '',
        }
      : null,
    allowedPositions: Array.isArray(record.allowedPositions) ? record.allowedPositions.filter((position): position is number => typeof position === 'number') : [-1, -0.6, -0.2, 0.2, 0.6, 1],
    currentUserOpinionPosition: currentPositionRecord
      ? {
          id: readOptionalText(currentPositionRecord.id) ?? '',
          selectedPosition: readOptionalNumber(currentPositionRecord.selectedPosition) ?? null,
          lacksContext: currentPositionRecord.lacksContext === true,
          confirmedAt: readOptionalText(currentPositionRecord.confirmedAt) ?? '',
          createdAt: readOptionalText(currentPositionRecord.createdAt) ?? '',
          updatedAt: readOptionalText(currentPositionRecord.updatedAt) ?? '',
        }
      : null,
    hasInsufficientContext: record.hasInsufficientContext === true,
    canContribute: record.canContribute === true,
    canValidateContributions: record.canValidateContributions === true,
    opinionDistribution: normalizeOpinionDistribution(record.opinionDistribution),
    contributions: Array.isArray(record.contributions) ? record.contributions.map(normalizeContribution).filter((contribution): contribution is ArticleContribution => contribution !== null) : [],
  };
}

function updateContributionTree(
  contributions: ArticleContribution[],
  contributionId: string,
  updater: (contribution: ArticleContribution) => ArticleContribution,
): ArticleContribution[] {
  return contributions.map((contribution) => {
    const children = contribution.children.length > 0 ? updateContributionTree(contribution.children, contributionId, updater) : contribution.children;
    const next = children === contribution.children ? contribution : { ...contribution, children };
    return next.id === contributionId ? updater(next) : next;
  });
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

function normalizeChatFolder(item: unknown): ChatFolder | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const record = item as Record<string, unknown>;
  const id = readOptionalText(record.id);
  const name = readOptionalText(record.name);

  if (!id || !name) {
    return null;
  }

  const createdAt = readOptionalText(record.createdAt);
  const updatedAt = readOptionalText(record.updatedAt);

  return {
    id,
    name,
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
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
  const parsed = parsePotentialSources(sources, factCheckData);
  return parsed.length > 0 ? parsed.length : undefined;
}

function readSupportLevel(factCheckData: unknown, score?: number): string | undefined {
  const factCheckRecord = readJsonRecord(factCheckData);
  const supportLevel = readOptionalText(factCheckRecord?.supportLevel);
  if (supportLevel) {
    return supportLevel;
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

function readLiveAnalysis(factCheckData: Record<string, unknown> | null): ArticleFactCheckDetail['liveAnalysis'] {
  if (!factCheckData) return null;
  const liveRec = readRecord(factCheckData.liveAnalysis);
  if (!liveRec) return null;

  const contentIntent = readOptionalText(liveRec.contentIntent) ?? 'INFORMATIVE';
  const intentReasoning = readOptionalText(liveRec.intentReasoning);
  const pillarRec = readRecord(liveRec.pillarScores);

  if (!pillarRec) return null;

  const readPillar = (key: string) => {
    const p = readRecord(pillarRec[key]);
    return {
      score: readOptionalNumber(p?.score) ?? 0,
      reasoning: readOptionalText(p?.reasoning) ?? '',
      ...(readOptionalText(p?.quote) ? { quote: readOptionalText(p?.quote) } : {}),
    };
  };

  const correctiveNotesRaw = liveRec.correctiveNotes;
  const correctiveNotes = Array.isArray(correctiveNotesRaw)
    ? correctiveNotesRaw.filter((n): n is string => typeof n === 'string')
    : undefined;

  return {
    contentIntent,
    ...(intentReasoning ? { intentReasoning } : {}),
    pillarScores: {
      transparency: readPillar('transparency'),
      editorial: readPillar('editorial'),
      semantic: readPillar('semantic'),
      logic: readPillar('logic'),
    },
    ...(correctiveNotes?.length ? { correctiveNotes } : {}),
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

  const factCheckScore = readFactCheckScore(item);
  const factCheckStatus = readOptionalText(item.factCheckStatus);
  const body = readOptionalText(item.content) ?? readOptionalText(item.body);
  const aiSummary = readOptionalText(item.aiSummary);
  const generationPrompt = readOptionalText(item.generationPrompt);
  const authorName = readAuthorName(item.author);
  const sources = normalizeArticleSources(item.sources, item.factCheckData);
  const sourcesCount = sources.length || countPotentialSources(item.sources, item.factCheckData);
  const supportLevel = readSupportLevel(item.factCheckData, factCheckScore);
  const structuredContent = normalizeStructuredContent(item.structuredContent);
  const sourceHighlights = normalizeSourceHighlights(item.sourceHighlights);

  // Build factCheckDetail from factCheckData
  const fcd = readJsonRecord(item.factCheckData);
  const calcRec = readRecord(fcd?.calculation);
  const rawSourceScore = readOptionalNumber(calcRec?.sourcesMean) ?? readOptionalNumber(fcd?.sourcesMean) ?? 0;
  const aiScore = readOptionalNumber(calcRec?.contentScore) ?? readOptionalNumber(calcRec?.liveScore) ?? readOptionalNumber(fcd?.liveScore) ?? 0;
  const globalScore = factCheckScore ?? Math.round(rawSourceScore * 0.75 + aiScore * 0.25);
  const liveAnalysis = readLiveAnalysis(fcd);
  const factCheckDetail: ArticleFactCheckDetail | undefined = fcd || globalScore > 0 ? {
    globalScore,
    rawSourceScore,
    aiScore,
    liveAnalysis: liveAnalysis ?? null,
  } : undefined;

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
    ...(structuredContent ? { structuredContent } : {}),
    ...(sourceHighlights ? { sourceHighlights } : {}),
    ...(factCheckDetail ? { factCheckDetail } : {}),
  };
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return items.length > 0 ? items : undefined;
}

function normalizeStructuredItems(value: unknown): StructuredArticleItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item): StructuredArticleItem | null => {
      const record = readRecord(item);
      const textValue = readOptionalText(record?.text);
      if (!record || !textValue) return null;
      return {
        ...(readOptionalText(record.id) ? { id: readOptionalText(record.id) } : {}),
        text: textValue,
        ...(readStringArray(record.claimIds) ? { claimIds: readStringArray(record.claimIds) } : {}),
        ...(readStringArray(record.sourceIds) ? { sourceIds: readStringArray(record.sourceIds) } : {}),
        ...(readStringArray(record.sourceUrls) ? { sourceUrls: readStringArray(record.sourceUrls) } : {}),
      };
    })
    .filter((item): item is StructuredArticleItem => item !== null);
  return items.length > 0 ? items : undefined;
}

function normalizeStructuredSections(value: unknown): StructuredArticleSection[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((section, index): StructuredArticleSection | null => {
      const record = readRecord(section);
      const title = readOptionalText(record?.title);
      if (!record || !title) return null;
      const sectionType = readOptionalText(record.type);
      return {
        id: readOptionalText(record.id) ?? `section_${index + 1}`,
        type: sectionType === 'summary' || sectionType === 'facts' || sectionType === 'context' || sectionType === 'analysis' || sectionType === 'limits' ? sectionType : 'analysis',
        title,
        ...(readOptionalText(record.body) ? { body: readOptionalText(record.body) } : {}),
        ...(normalizeStructuredItems(record.items) ? { items: normalizeStructuredItems(record.items) } : {}),
      };
    })
    .filter((section): section is StructuredArticleSection => section !== null);
}

function normalizeStructuredClaims(value: unknown): StructuredArticleClaim[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((claim, index): StructuredArticleClaim | null => {
      const record = readRecord(claim);
      const textValue = readOptionalText(record?.text);
      if (!record || !textValue) return null;
      const support = readOptionalText(record.support);
      return {
        id: readOptionalText(record.id) ?? `claim_${index + 1}`,
        text: textValue,
        ...(readOptionalText(record.sectionId) ? { sectionId: readOptionalText(record.sectionId) } : {}),
        ...(readStringArray(record.sourceIds) ? { sourceIds: readStringArray(record.sourceIds) } : {}),
        ...(readStringArray(record.sourceUrls) ? { sourceUrls: readStringArray(record.sourceUrls) } : {}),
        ...(support === 'strong' || support === 'medium' || support === 'limited' || support === 'unclear' ? { support } : {}),
      };
    })
    .filter((claim): claim is StructuredArticleClaim => claim !== null);
}

function normalizeStructuredContent(value: unknown): StructuredArticleContent | undefined {
  const record = readJsonRecord(value);
  if (!record || record.version !== 1 || record.format !== 'epion-article-v1') return undefined;
  const sections = normalizeStructuredSections(record.sections);
  if (sections.length === 0) return undefined;
  const lead = readRecord(record.lead);
  const sourceRefs = Array.isArray(record.sources)
    ? record.sources
        .map((source) => {
          const sourceRecord = readRecord(source);
          const id = readOptionalText(sourceRecord?.id);
          const url = readOptionalText(sourceRecord?.url);
          if (!id || !url) return null;
          return {
            id,
            url,
            ...(readOptionalText(sourceRecord?.title) ? { title: readOptionalText(sourceRecord?.title) } : {}),
            ...(readOptionalText(sourceRecord?.domain) ? { domain: readOptionalText(sourceRecord?.domain) } : {}),
          };
        })
        .filter((source): source is NonNullable<typeof source> => source !== null)
    : undefined;

  return {
    version: 1,
    format: 'epion-article-v1',
    ...(lead ? {
      lead: {
        ...(readOptionalText(lead.summary) ? { summary: readOptionalText(lead.summary) } : {}),
        ...(readStringArray(lead.keyTakeaways) ? { keyTakeaways: readStringArray(lead.keyTakeaways) } : {}),
      },
    } : {}),
    sections,
    claims: normalizeStructuredClaims(record.claims),
    ...(sourceRefs && sourceRefs.length > 0 ? { sources: sourceRefs } : {}),
  };
}

function normalizeSourceHighlights(value: unknown): ArticleSourceHighlight[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const highlights = value
    .map((highlight): ArticleSourceHighlight | null => {
      const record = readRecord(highlight);
      if (!record) return null;
      return {
        ...(readOptionalText(record.text) ? { text: readOptionalText(record.text) } : {}),
        ...(readOptionalText(record.sourceId) ? { sourceId: readOptionalText(record.sourceId) } : {}),
        ...(readOptionalText(record.sourceUrl) ? { sourceUrl: readOptionalText(record.sourceUrl) } : {}),
        ...(readStringArray(record.sourceIds) ? { sourceIds: readStringArray(record.sourceIds) } : {}),
        ...(readStringArray(record.sourceUrls) ? { sourceUrls: readStringArray(record.sourceUrls) } : {}),
      };
    })
    .filter((highlight): highlight is ArticleSourceHighlight => highlight !== null);
  return highlights.length > 0 ? highlights : undefined;
}

function readEditableArticleStatus(value: unknown): EditableArticleStatus {
  const status = readOptionalText(value);
  if (status === 'PUBLISHED' || status === 'ARCHIVED') return status;
  return 'DRAFT';
}

function normalizeEditableArticle(payload: unknown, fallbackId: string): EditableArticle | null {
  const item = getArticlePayload(payload);
  if (!item) return null;

  const id = readOptionalText(item.id) ?? fallbackId;
  const title = readOptionalText(item.title);

  if (!id || !title) {
    return null;
  }

  const category = readRecord(item.category);
  const author = readRecord(item.author);

  return {
    id,
    slug: readOptionalText(item.slug) ?? null,
    title,
    summary: readOptionalText(item.summary) ?? readOptionalText(item.description) ?? '',
    content: readOptionalText(item.content) ?? readOptionalText(item.body) ?? '',
    imageUrl: readOptionalText(item.imageUrl) ?? null,
    status: readEditableArticleStatus((item as Record<string, unknown>).status),
    categoryId: readOptionalText(category?.id) ?? null,
    categoryName: readOptionalText(category?.name) ?? null,
    categorySlug: readOptionalText(category?.slug) ?? null,
    authorId: readOptionalText(author?.id) ?? null,
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
  const primary = await fetch(`${API_BASE}/api/articles/slug/${encoded}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  let response = primary;

  if (primary.status === 404) {
    response = await fetch(`${API_BASE}/api/articles/${encoded}`, {
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

export async function fetchEditableArticle(idOrSlug: string): Promise<EditableArticle | null> {
  const encoded = encodeURIComponent(idOrSlug);
  const primary = await fetch(`${API_BASE}/api/articles/slug/${encoded}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  let response = primary;

  if (primary.status === 404) {
    response = await fetch(`${API_BASE}/api/articles/${encoded}`, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    });
  }

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }

  return normalizeEditableArticle(payload, idOrSlug);
}

export async function fetchArticleImageProposals(articleId: string): Promise<ImageProposal[]> {
  const response = await fetch(`${API_BASE}/api/articles/${encodeURIComponent(articleId)}/image-proposals`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }

  const record = readRecord(payload) ?? {};
  const proposals = Array.isArray(record.proposals) ? record.proposals : [];

  return proposals
    .map((proposal): ImageProposal | null => {
      const item = readRecord(proposal);
      const url = readOptionalText(item?.url);
      if (!url) return null;

      return {
        url,
        source: readOptionalText(item?.source) ?? '',
        credit: readOptionalText(item?.credit) ?? '',
        description: readOptionalText(item?.description) ?? '',
      };
    })
    .filter((proposal): proposal is ImageProposal => proposal !== null);
}

export async function updateEditableArticle(articleId: string, data: UpdateEditableArticleParams): Promise<{ id: string; slug: string | null }> {
  const response = await fetch(
    `${API_BASE}/api/articles/${encodeURIComponent(articleId)}`,
    await withCsrf({
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }),
  );

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }

  const record = readRecord(payload) ?? {};
  return {
    id: readOptionalText(record.id) ?? articleId,
    slug: readOptionalText(record.slug) ?? null,
  };
}

export async function deleteEditableArticle(articleId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/articles/${encodeURIComponent(articleId)}`,
    await withCsrf({
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
    }),
  );

  const payload = response.status === 204 ? null : await readJson(response);

  if (!response.ok && response.status !== 204) {
    throw buildApiError(response, payload);
  }
}

export async function editArticleWithAI(articleId: string, data: EditArticleWithAIParams): Promise<EditArticleWithAIResult> {
  const response = await fetch(
    `${API_BASE}/api/articles/${encodeURIComponent(articleId)}/edit-ai`,
    await withCsrf({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }),
  );

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }

  const record = readRecord(payload) ?? {};
  return { result: readOptionalText(record.result) ?? '' };
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

export async function toggleArticleRepost(articleId: string): Promise<{ reposted: boolean }> {
  const response = await fetch(
    `${API_BASE}/api/social/articles/${encodeURIComponent(articleId)}/repost`,
    await withCsrf({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: '{}',
    }),
  );

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }

  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  return { reposted: record.reposted === true };
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
export async function fetchArticleInteractions(articleSlug: string, sort: ArticleInteractionsSortMode = 'top'): Promise<ArticleInteractions> {
  const response = await fetch(`${API_BASE}/api/articles/${encodeURIComponent(articleSlug)}/interactions?sort=${sort}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return normalizeArticleInteractions(await readJson(response));
}

export async function submitArticleOpinionPosition(
  articleSlug: string,
  selectedPosition: number | null,
  lacksContext: boolean,
): Promise<{ position: ArticleInteractions['currentUserOpinionPosition']; canContribute: boolean; canValidateContributions: boolean }> {
  const response = await fetch(
    `${API_BASE}/api/articles/${encodeURIComponent(articleSlug)}/opinion-position`,
    await withCsrf({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ selectedPosition, lacksContext }),
    }),
  );

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }

  const normalized = normalizeArticleInteractions({ currentUserOpinionPosition: payload });
  const record = readRecord(payload) ?? {};
  return {
    position: normalized.currentUserOpinionPosition,
    canContribute: record.canContribute === true,
    canValidateContributions: record.canValidateContributions === true,
  };
}

export async function submitArticleContribution(
  articleSlug: string,
  type: ArticleContributionType,
  text: string,
  sourceUrl?: string,
  targetContributionId?: string,
): Promise<ArticleContribution> {
  const response = await fetch(
    `${API_BASE}/api/articles/${encodeURIComponent(articleSlug)}/contributions`,
    await withCsrf({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type, text, sourceUrl: sourceUrl || undefined, targetContributionId: targetContributionId || undefined }),
    }),
  );

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }

  const contribution = normalizeContribution(payload);
  if (!contribution) {
    throw new Error('Invalid contribution response');
  }

  return contribution;
}

export async function toggleArticleContributionValidation(
  contributionId: string,
  type: ArticleValidationType,
): Promise<{ action: 'ADDED' | 'REMOVED'; validationSummary: ArticleValidationSummary }> {
  const response = await fetch(
    `${API_BASE}/api/articles/contributions/${encodeURIComponent(contributionId)}/validations`,
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

  const record = readRecord(payload) ?? {};
  return {
    action: record.action === 'REMOVED' ? 'REMOVED' : 'ADDED',
    validationSummary: normalizeValidationSummary(record.validationSummary),
  };
}

export { updateContributionTree };
export async function generateArticleWithAI(data: GenerateArticleParams): Promise<GeneratedArticleResult> {
  const response = await fetch(
    `${API_BASE}/api/articles/generate`,
    await withCsrf({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }),
  );

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }

  const record = readRecord(payload) ?? {};
  const article = readRecord(record.article);
  const articleId = article ? readOptionalText(article.id) : undefined;
  const articleSlug = article ? readOptionalText(article.slug) : undefined;
  const message = readOptionalText(record.message);

  return {
    ...(article
      ? {
          article: {
            ...(articleId ? { id: articleId } : {}),
            ...(articleSlug ? { slug: articleSlug } : {}),
          },
        }
      : {}),
    ...(message ? { message } : {}),
  };
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


export async function fetchCategoryArticlesPage(slug: string, options?: { take?: number; cursor?: string | null }): Promise<ArticlePage> {
  const params = new URLSearchParams({
    take: String(Math.min(options?.take ?? 24, 50)),
  });
  if (options?.cursor) params.set('cursor', options.cursor);

  return fetchArticlePage(`/api/categories/${encodeURIComponent(slug)}/articles?${params.toString()}`);
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

export async function fetchChatSessions(options?: { take?: number; folderId?: string | null }): Promise<ChatSessionSummary[]> {
  const params = new URLSearchParams({
    take: String(Math.min(options?.take ?? 50, 50)),
  });
  if (options?.folderId) params.set('folderId', options.folderId);

  const response = await fetch(`${API_BASE}/api/chat/sessions?${params.toString()}`, {
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

export async function updateChatSession(
  sessionId: string,
  data: { title?: string; mode?: ChatRigor; folderId?: string | null },
): Promise<ChatSessionDetail> {
  const response = await fetch(
    `${API_BASE}/api/chat/sessions/${encodeURIComponent(sessionId)}`,
    await withCsrf({
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
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

export async function deleteChatSession(sessionId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/chat/sessions/${encodeURIComponent(sessionId)}`,
    await withCsrf({
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
    }),
  );

  if (!response.ok && response.status !== 204 && response.status !== 404) {
    throw buildApiError(response, await readJson(response));
  }
}

export async function fetchChatFolders(): Promise<ChatFolder[]> {
  const response = await fetch(`${API_BASE}/api/chat/folders`, {
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
    .map(normalizeChatFolder)
    .filter((folder): folder is ChatFolder => folder !== null);
}

export async function createChatFolder(name: string): Promise<ChatFolder> {
  const response = await fetch(
    `${API_BASE}/api/chat/folders`,
    await withCsrf({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    }),
  );

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }

  const folder = normalizeChatFolder(payload);
  if (!folder) {
    throw new Error('Invalid chat folder response');
  }

  return folder;
}

export async function renameChatFolder(folderId: string, name: string): Promise<ChatFolder> {
  const response = await fetch(
    `${API_BASE}/api/chat/folders/${encodeURIComponent(folderId)}`,
    await withCsrf({
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    }),
  );

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }

  const folder = normalizeChatFolder(payload);
  if (!folder) {
    throw new Error('Invalid chat folder response');
  }

  return folder;
}

export async function deleteChatFolder(folderId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/chat/folders/${encodeURIComponent(folderId)}`,
    await withCsrf({
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
    }),
  );

  if (!response.ok && response.status !== 204) {
    throw buildApiError(response, await readJson(response));
  }
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
    sourceRestricted?: boolean;
    neutralityForced?: boolean;
    timeRecent?: boolean;
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
        sourceRestricted: options?.sourceRestricted ?? true,
        neutralityForced: options?.neutralityForced ?? true,
        timeRecent: options?.timeRecent ?? false,
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

export type UpdateAccountProfileParams = {
  displayName: string;
  username: string;
  phone?: string | null;
  avatarUrl?: string | null;
};

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const response = await fetch(`${API_BASE}/api/me/username/available?u=${encodeURIComponent(username)}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await readJson(response);
  const record = readRecord(payload) ?? {};
  return record.available === true;
}

export async function updateAccountProfile(data: UpdateAccountProfileParams): Promise<import('@/types/user').AuthUser> {
  const response = await fetch(
    `${API_BASE}/api/me`,
    await withCsrf({
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }),
  );

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }

  return payload as import('@/types/user').AuthUser;
}

export async function deleteAccountSession(id: string): Promise<{ ok: boolean; current?: boolean }> {
  const response = await fetch(
    `${API_BASE}/api/me/sessions/${encodeURIComponent(id)}`,
    await withCsrf({
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
    }),
  );

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }

  const record = readRecord(payload) ?? {};
  return { ok: record.ok === true, current: record.current === true };
}

export async function deleteOtherAccountSessions(): Promise<{ ok: boolean; deleted: number }> {
  const response = await fetch(
    `${API_BASE}/api/me/sessions/others`,
    await withCsrf({
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
    }),
  );

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }

  const record = readRecord(payload) ?? {};
  return {
    ok: record.ok === true,
    deleted: readOptionalNumber(record.deleted) ?? 0,
  };
}

export async function requestAccountEmailChange(newEmail: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/change-email`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Origin: WEB_ORIGIN,
      Referer: `${WEB_ORIGIN}/`,
    },
    body: JSON.stringify({
      newEmail,
      callbackURL: AUTH_CALLBACK_URL,
    }),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }
}

export async function changeAccountPassword(currentPassword: string, newPassword: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/change-password`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Origin: WEB_ORIGIN,
      Referer: `${WEB_ORIGIN}/`,
    },
    body: JSON.stringify({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    }),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }
}

export async function requestAccountPasswordReset(email: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/request-password-reset`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Origin: WEB_ORIGIN,
      Referer: `${WEB_ORIGIN}/`,
    },
    body: JSON.stringify({
      email,
      redirectTo: `${WEB_ORIGIN}/reset-password`,
    }),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload);
  }
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

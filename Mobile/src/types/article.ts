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
  sources?: ArticleSource[];
  generationPrompt?: string;
  structuredContentAvailable?: boolean;
  viewsAll?: number;
  factCheckDetail?: ArticleFactCheckDetail;
};

export type ArticleSource = {
  id?: string;
  name: string;
  domain: string;
  url?: string;
  trustScore?: number;
  type?: string;
  description?: string;
  // Enriched fields (from factCheckData / source enrichment)
  politicalBias?: string;
  reliability?: string;
  country?: string;
  reputationScore?: number;
  analysisScore?: number;
  isEnriching?: boolean;
  metrics?: {
    transparency: number;
    editorial: number;
    semantic: number;
    logic: number;
  };
  flags?: {
    hasFactCheckFailures?: boolean;
    isClickbait?: boolean;
    isAdsTxtValid?: boolean;
  };
  justification?: string;
  liveScore?: number;
};

export type ArticleFactCheckDetail = {
  globalScore: number;
  rawSourceScore: number;
  aiScore: number;
  liveAnalysis?: {
    contentIntent: string;
    intentReasoning?: string;
    pillarScores: {
      transparency: { score: number; quote?: string; reasoning: string };
      editorial: { score: number; quote?: string; reasoning: string };
      semantic: { score: number; quote?: string; reasoning: string };
      logic: { score: number; quote?: string; reasoning: string };
    };
    correctiveNotes?: string[];
  } | null;
};

export type ArticleReactionSummary = {
  likes: number;
  dislikes: number;
  reposts: number;
  userReaction: 'LIKE' | 'DISLIKE' | null;
  userReposted: boolean;
};

export type ArticleComment = {
  id: string;
  content: string;
  createdAt: string;
  authorName?: string;
  repliesCount?: number;
};

export type ArticleCommentsPage = {
  items: ArticleComment[];
  nextCursor: string | null;
};
export type ArticleContributionType = 'SOURCE' | 'NUANCE' | 'CONTRADICTION' | 'QUESTION' | 'CORRECTION';
export type ArticleValidationType = 'WELL_SOURCED' | 'ADDS_NUANCE' | 'NEEDS_CHECK';
export type ArticleInteractionsSortMode = 'top' | 'recent';
export type ArticleContributionStatus = 'ACTIVE' | 'DELETED' | 'HIDDEN' | 'STALE';

export type ArticleOpinionQuestion = {
  id: string;
  articleId: string;
  question: string;
  thesisA: string;
  thesisB: string;
};

export type ArticleOpinionPosition = {
  id: string;
  selectedPosition: number | null;
  lacksContext: boolean;
  confirmedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ArticleOpinionDistribution = {
  counts: Record<string, number>;
  total: number;
  lacksContextCount: number;
};

export type ArticleContributionAuthor = {
  id: string;
  name?: string;
  username?: string;
  avatarUrl?: string;
};

export type ArticleValidationSummary = Record<ArticleValidationType, number>;

export type ArticleContribution = {
  id: string;
  targetContributionId: string | null;
  status: ArticleContributionStatus;
  type: ArticleContributionType;
  text: string;
  sourceUrl: string | null;
  bridgingScore: number;
  editedAt: string | null;
  editCount: number;
  createdAt: string;
  updatedAt: string;
  author: ArticleContributionAuthor | null;
  validationSummary: ArticleValidationSummary;
  currentUserValidations: ArticleValidationType[];
  children: ArticleContribution[];
};

export type ArticleInteractions = {
  opinionQuestion: ArticleOpinionQuestion | null;
  allowedPositions: number[];
  currentUserOpinionPosition: ArticleOpinionPosition | null;
  hasInsufficientContext: boolean;
  canContribute: boolean;
  canValidateContributions: boolean;
  opinionDistribution: ArticleOpinionDistribution;
  contributions: ArticleContribution[];
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

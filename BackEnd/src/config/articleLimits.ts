// BackEnd/src/config/articleLimits.ts

export type ArticleLimits = {
  maxTitleChars: number;
  maxSummaryChars: number;
  maxContentChars: number;
  maxArticlesPerUser: number;
  maxCreatesPerMinute: number;
};

export const ARTICLE_LIMITS: ArticleLimits = {
  // tailles max raisonnables pour un média
  maxTitleChars: 200,
  maxSummaryChars: 600,
  maxContentChars: 50_000,

  // quotas “hard”
  maxArticlesPerUser: 500,

  // anti-spam création d’articles
  maxCreatesPerMinute: 20,
};

export const ARTICLE_SECTION_TYPES = [
  'summary',
  'facts',
  'context',
  'analysis',
  'limits',
] as const;

export type ArticleSectionType = (typeof ARTICLE_SECTION_TYPES)[number];

export type ArticleClaimSupport = 'strong' | 'medium' | 'limited' | 'unclear';

export interface StructuredArticleItem {
  id?: string;
  text: string;
  claimIds?: string[];
  sourceIds?: string[];
  sourceUrls?: string[];
}

export interface StructuredArticleSection {
  id: string;
  type: ArticleSectionType;
  title: string;
  body?: string;
  items?: StructuredArticleItem[];
}

export interface StructuredArticleClaim {
  id: string;
  text: string;
  sectionId?: string;
  sourceIds?: string[];
  sourceUrls?: string[];
  support?: ArticleClaimSupport;
}

export interface StructuredArticleSourceRef {
  id: string;
  url: string;
  title?: string;
  domain?: string;
}

export interface StructuredArticleContent {
  version: 1;
  format: 'epion-article-v1';
  lead?: {
    summary?: string;
    keyTakeaways?: string[];
  };
  sections: StructuredArticleSection[];
  claims: StructuredArticleClaim[];
  sources?: StructuredArticleSourceRef[];
}

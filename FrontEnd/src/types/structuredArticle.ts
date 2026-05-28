export type ArticleSectionType = 'summary' | 'facts' | 'context' | 'analysis' | 'limits';

export type ArticleClaimSupport = 'strong' | 'medium' | 'limited' | 'unclear';

export type StructuredArticleItem = {
  id?: string;
  text: string;
  claimIds?: string[];
  sourceIds?: string[];
  sourceUrls?: string[];
};

export type StructuredArticleSection = {
  id: string;
  type: ArticleSectionType;
  title: string;
  body?: string;
  items?: StructuredArticleItem[];
};

export type StructuredArticleClaim = {
  id: string;
  text: string;
  sectionId?: string;
  sourceIds?: string[];
  sourceUrls?: string[];
  support?: ArticleClaimSupport;
};

export type StructuredArticleContent = {
  version: 1;
  format: 'epion-article-v1';
  lead?: {
    summary?: string;
    keyTakeaways?: string[];
  };
  sections: StructuredArticleSection[];
  claims: StructuredArticleClaim[];
  sources?: Array<{
    id: string;
    url: string;
    title?: string;
    domain?: string;
  }>;
};

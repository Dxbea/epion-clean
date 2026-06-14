import type { StructuredArticleClaim, StructuredArticleContent } from '@/types/structuredArticle';

export function stableSourceId(url: string, fallbackIndex = 0): string {
  let hash = 0;
  for (let i = 0; i < url.length; i += 1) {
    hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
  }
  return `src_${hash.toString(36) || fallbackIndex + 1}`;
}

export function getSourceKey(source: any, index = 0): string {
  if (typeof source?.sourceId === 'string' && source.sourceId) return source.sourceId;
  if (typeof source?.url === 'string' && source.url) return stableSourceId(source.url, index);
  if (typeof source?.id === 'number' || typeof source?.id === 'string') return String(source.id);
  return `source_${index + 1}`;
}

export function isStructuredArticleContent(value: unknown): value is StructuredArticleContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Partial<StructuredArticleContent>;
  return data.version === 1 && data.format === 'epion-article-v1' && Array.isArray(data.sections);
}

export function claimMatchesSource(claim: StructuredArticleClaim, source: any, index = 0): boolean {
  const sourceKey = getSourceKey(source, index);
  const sourceUrl = typeof source?.url === 'string' ? source.url : null;
  const sourceIds = claim.sourceIds || [];
  const sourceUrls = claim.sourceUrls || [];

  return (
    sourceIds.includes(sourceKey) ||
    (typeof source?.id !== 'undefined' && sourceIds.includes(String(source.id))) ||
    (sourceUrl !== null && sourceUrls.includes(sourceUrl))
  );
}

export function claimsForSource(
  claims: StructuredArticleClaim[] | undefined,
  source: any,
  index = 0,
): StructuredArticleClaim[] {
  if (!Array.isArray(claims)) return [];
  return claims.filter((claim) => claimMatchesSource(claim, source, index));
}

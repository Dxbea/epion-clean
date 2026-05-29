import {
  ARTICLE_SECTION_TYPES,
  type ArticleSectionType,
  type StructuredArticleClaim,
  type StructuredArticleContent,
  type StructuredArticleItem,
  type StructuredArticleSection,
  type StructuredArticleSourceRef,
} from '../types/structured-article';

const SECTION_TYPE_SET = new Set<string>(ARTICLE_SECTION_TYPES);

function asCleanString(value: unknown, maxLength = 4000): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

function asStringArray(value: unknown, maxItems = 8, maxLength = 500): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => asCleanString(item, maxLength))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
  return items.length > 0 ? items : undefined;
}

function normalizeSectionType(value: unknown, fallbackIndex: number): ArticleSectionType {
  if (typeof value === 'string' && SECTION_TYPE_SET.has(value)) {
    return value as ArticleSectionType;
  }
  return ARTICLE_SECTION_TYPES[Math.min(fallbackIndex, ARTICLE_SECTION_TYPES.length - 1)];
}

function normalizeItems(value: unknown): StructuredArticleItem[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const items = value
    .map((item, index): StructuredArticleItem | null => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const raw = item as Record<string, unknown>;
      const text = asCleanString(raw.text, 1000);
      if (!text) return null;

      return {
        id: asCleanString(raw.id, 80) || `item_${index + 1}`,
        text,
        claimIds: asStringArray(raw.claimIds, 8, 80),
        sourceIds: asStringArray(raw.sourceIds, 8, 80),
        sourceUrls: asStringArray(raw.sourceUrls, 8, 1000),
      };
    })
    .filter((item): item is StructuredArticleItem => item !== null)
    .slice(0, 12);

  return items.length > 0 ? items : undefined;
}

function normalizeSections(value: unknown): StructuredArticleSection[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((section, index): StructuredArticleSection | null => {
      if (!section || typeof section !== 'object' || Array.isArray(section)) return null;
      const raw = section as Record<string, unknown>;
      const type = normalizeSectionType(raw.type, index);
      const title = asCleanString(raw.title, 120) || defaultSectionTitle(type);
      const body = asCleanString(raw.body, 5000) || undefined;
      const items = normalizeItems(raw.items);

      if (!body && !items) return null;

      return {
        id: asCleanString(raw.id, 80) || type,
        type,
        title,
        body,
        items,
      };
    })
    .filter((section): section is StructuredArticleSection => section !== null)
    .slice(0, 5);
}

function normalizeClaims(value: unknown): StructuredArticleClaim[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((claim, index): StructuredArticleClaim | null => {
      if (!claim || typeof claim !== 'object' || Array.isArray(claim)) return null;
      const raw = claim as Record<string, unknown>;
      const text = asCleanString(raw.text, 1000);
      if (!text) return null;

      const support = asCleanString(raw.support, 20);
      const safeSupport =
        support === 'strong' || support === 'medium' || support === 'limited' || support === 'unclear'
          ? support
          : 'unclear';

      return {
        id: asCleanString(raw.id, 80) || `claim_${index + 1}`,
        text,
        sectionId: asCleanString(raw.sectionId, 80) || undefined,
        sourceIds: asStringArray(raw.sourceIds, 8, 80),
        sourceUrls: asStringArray(raw.sourceUrls, 8, 1000),
        support: safeSupport,
      };
    })
    .filter((claim): claim is StructuredArticleClaim => claim !== null)
    .slice(0, 80);
}

function normalizeSources(value: unknown): StructuredArticleSourceRef[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const sources = value
    .map((source, index): StructuredArticleSourceRef | null => {
      if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
      const raw = source as Record<string, unknown>;
      const url = asCleanString(raw.url, 1000);
      if (!url) return null;

      return {
        id: asCleanString(raw.id, 80) || stableSourceId(url, index),
        url,
        title: asCleanString(raw.title, 250) || undefined,
        domain: asCleanString(raw.domain, 120) || undefined,
      };
    })
    .filter((source): source is StructuredArticleSourceRef => source !== null)
    .slice(0, 50);

  return sources.length > 0 ? sources : undefined;
}

function defaultSectionTitle(type: ArticleSectionType): string {
  switch (type) {
    case 'summary':
      return "Ce qu'il faut retenir";
    case 'facts':
      return 'Ce qui est établi';
    case 'context':
      return 'Contexte';
    case 'analysis':
      return 'Analyse et perspectives';
    case 'limits':
      return 'Limites et questions ouvertes';
  }
}

export function stableSourceId(url: string, fallbackIndex = 0): string {
  let hash = 0;
  for (let i = 0; i < url.length; i += 1) {
    hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
  }
  return `src_${hash.toString(36) || fallbackIndex + 1}`;
}

export function buildSourceRefs(sources: Array<{ url: string; title?: string; domain?: string }>): StructuredArticleSourceRef[] {
  return sources
    .filter((source) => typeof source.url === 'string' && source.url.trim())
    .map((source, index) => ({
      id: stableSourceId(source.url, index),
      url: source.url,
      title: source.title,
      domain: source.domain,
    }));
}

export function normalizeStructuredArticle(input: unknown): StructuredArticleContent | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;

  const raw = input as Record<string, unknown>;
  const sections = normalizeSections(raw.sections);
  if (sections.length === 0) return null;

  const leadRaw = raw.lead && typeof raw.lead === 'object' && !Array.isArray(raw.lead)
    ? raw.lead as Record<string, unknown>
    : {};

  return {
    version: 1,
    format: 'epion-article-v1',
    lead: {
      summary: asCleanString(leadRaw.summary, 1200) || undefined,
      keyTakeaways: asStringArray(leadRaw.keyTakeaways, 5, 300),
    },
    sections,
    claims: normalizeClaims(raw.claims),
    sources: normalizeSources(raw.sources),
  };
}

export function structuredArticleToMarkdown(article: StructuredArticleContent): string {
  const lines: string[] = [];

  if (article.lead?.summary) {
    lines.push(article.lead.summary);
    lines.push('');
  }

  if (article.lead?.keyTakeaways?.length) {
    lines.push("## Ce qu'il faut retenir");
    article.lead.keyTakeaways.forEach((item) => lines.push(`- ${item}`));
    lines.push('');
  }

  for (const section of article.sections) {
    lines.push(`## ${section.title}`);
    if (section.body) {
      lines.push(section.body);
    }
    if (section.items?.length) {
      section.items.forEach((item) => lines.push(`- ${item.text}`));
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

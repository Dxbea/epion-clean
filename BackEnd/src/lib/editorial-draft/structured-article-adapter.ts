import type { EditorialClaimVerdict } from '@prisma/client';
import { normalizeArticleSourceUrl } from '../article-source-service.js';
import { stableSourceId } from '../structured-article.js';
import type {
  ArticleClaimSupport,
  ArticleSectionType,
  StructuredArticleContent,
  StructuredArticleSourceRef,
} from '../../types/structured-article.js';
import type { EditorialDraftArtifact } from './types.js';

export interface EditorialStructuredEvidenceRef {
  evidenceKey: string;
  url: string;
  title?: string | null;
  domain?: string | null;
  sourceId?: string | null;
}

export interface EditorialStructuredArticleOptions {
  evidence?: EditorialStructuredEvidenceRef[];
  claimVerdicts?: Record<string, EditorialClaimVerdict>;
}

export function editorialDraftArtifactToStructuredArticle(
  artifact: EditorialDraftArtifact,
  options: EditorialStructuredArticleOptions = {},
): StructuredArticleContent {
  const evidenceByKey = new Map(options.evidence?.map((evidence) => [evidence.evidenceKey, evidence]) ?? []);
  const sourceRefs = buildSourceRefs(options.evidence ?? []);
  const claimSectionIds = new Map<string, string>();

  const sections = artifact.sections.map((section, index) => {
    const id = `section_${index + 1}`;
    section.claimKeys.forEach((claimKey) => {
      if (!claimSectionIds.has(claimKey)) claimSectionIds.set(claimKey, id);
    });
    const claims = section.claimKeys
      .map((claimKey) => artifact.claims.find((claim) => claim.claimKey === claimKey))
      .filter((claim): claim is EditorialDraftArtifact['claims'][number] => Boolean(claim));

    return {
      id,
      type: sectionType(index, artifact.sections.length),
      title: section.heading,
      items: claims.map((claim) => {
        const refs = claimEvidenceRefs(claim.evidenceKeys, evidenceByKey);
        return {
          id: claim.claimKey,
          text: claim.text,
          claimIds: [claim.claimKey],
          ...(refs.sourceIds.length ? { sourceIds: refs.sourceIds } : {}),
          ...(refs.sourceUrls.length ? { sourceUrls: refs.sourceUrls } : {}),
        };
      }),
    };
  });

  const claims = artifact.claims.map((claim) => {
    const refs = claimEvidenceRefs(claim.evidenceKeys, evidenceByKey);
    return {
      id: claim.claimKey,
      text: claim.text,
      sectionId: claimSectionIds.get(claim.claimKey),
      ...(refs.sourceIds.length ? { sourceIds: refs.sourceIds } : {}),
      ...(refs.sourceUrls.length ? { sourceUrls: refs.sourceUrls } : {}),
      support: claimSupport(options.claimVerdicts?.[claim.claimKey]),
    };
  });

  return {
    version: 1,
    format: 'epion-article-v1',
    lead: {
      summary: artifact.summary,
      keyTakeaways: artifact.claims
        .filter((claim) => claim.importance === 'CORE')
        .slice(0, 5)
        .map((claim) => claim.text),
    },
    sections,
    claims,
    ...(sourceRefs.length ? { sources: sourceRefs } : {}),
  };
}

function buildSourceRefs(evidence: EditorialStructuredEvidenceRef[]): StructuredArticleSourceRef[] {
  const byUrl = new Map<string, StructuredArticleSourceRef>();
  for (const item of evidence) {
    const url = normalizeArticleSourceUrl(item.url);
    if (!url || byUrl.has(url)) continue;
    byUrl.set(url, {
      id: item.sourceId?.trim() || stableSourceId(url),
      url,
      ...(item.title?.trim() ? { title: item.title.trim() } : {}),
      ...(item.domain?.trim() ? { domain: item.domain.trim() } : {}),
    });
  }
  return [...byUrl.values()];
}

function claimEvidenceRefs(
  evidenceKeys: string[],
  evidenceByKey: Map<string, EditorialStructuredEvidenceRef>,
): { sourceIds: string[]; sourceUrls: string[] } {
  const sourceIds = new Set<string>();
  const sourceUrls = new Set<string>();
  for (const evidenceKey of evidenceKeys) {
    const evidence = evidenceByKey.get(evidenceKey);
    if (!evidence) continue;
    const url = normalizeArticleSourceUrl(evidence.url);
    if (!url) continue;
    sourceIds.add(evidence.sourceId?.trim() || stableSourceId(url));
    sourceUrls.add(url);
  }
  return { sourceIds: [...sourceIds], sourceUrls: [...sourceUrls] };
}

function claimSupport(verdict?: EditorialClaimVerdict): ArticleClaimSupport {
  switch (verdict) {
    case 'SUPPORTED': return 'strong';
    case 'PARTIALLY_SUPPORTED': return 'medium';
    case 'CONTRADICTED': return 'limited';
    default: return 'unclear';
  }
}

function sectionType(index: number, count: number): ArticleSectionType {
  if (index === 0) return 'facts';
  if (index === 1) return 'context';
  if (index === count - 1 && count > 3) return 'limits';
  return 'analysis';
}

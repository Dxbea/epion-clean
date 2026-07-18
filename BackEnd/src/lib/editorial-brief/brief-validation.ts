import { z } from 'zod';
import type {
  EditorialBriefContent,
  EditorialBriefDraft,
  EditorialBriefSourceSummary,
  EditorialEvidenceSnapshot,
} from './types.js';

const cleanText = (maximum: number) => z.string().trim().min(1).max(maximum);
const evidenceKeys = z.array(cleanText(80)).min(1).max(12);

const briefDraftSchema = z.object({
  summary: cleanText(2_000),
  centralFacts: z.array(z.object({
    id: cleanText(80),
    text: cleanText(1_000),
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    evidenceKeys,
  }).strict()).min(1).max(15),
  timeline: z.array(z.object({
    date: cleanText(80),
    event: cleanText(1_000),
    evidenceKeys,
  }).strict()).max(20),
  contradictions: z.array(z.object({
    id: cleanText(80),
    question: cleanText(1_000),
    sides: z.array(z.object({
      position: cleanText(1_000),
      evidenceKeys,
    }).strict()).min(2).max(4),
    assessment: cleanText(1_500),
  }).strict()).max(10),
  uncertainties: z.array(z.object({
    question: cleanText(1_000),
    evidenceKeys: z.array(cleanText(80)).max(12),
  }).strict()).max(15),
  missingAngles: z.array(z.object({
    angle: cleanText(500),
    reason: cleanText(1_000),
  }).strict()).max(15),
}).strict();

export function validateEditorialBriefDraft(
  input: unknown,
  knownEvidenceKeys: Set<string>,
  evidence: EditorialEvidenceSnapshot[] = [],
): EditorialBriefDraft {
  const draft = briefDraftSchema.parse(input) as EditorialBriefDraft;
  assertUniqueIds(draft.centralFacts.map((fact) => fact.id), 'central fact');
  assertUniqueIds(draft.contradictions.map((contradiction) => contradiction.id), 'contradiction');
  const referencedKeys = collectEvidenceKeys(draft);
  for (const key of referencedKeys) {
    if (!knownEvidenceKeys.has(key)) {
      throw new Error(`Editorial brief references unknown evidence key: ${key}`);
    }
  }
  if (evidence.length) {
    const domainsByKey = new Map(evidence.map((item) => [item.evidenceKey, item.domain]));
    for (const contradiction of draft.contradictions) {
      const domains = new Set(
        contradiction.sides.flatMap((side) => side.evidenceKeys)
          .map((key) => domainsByKey.get(key))
          .filter((domain): domain is string => Boolean(domain)),
      );
      if (domains.size < 2) {
        throw new Error(`Editorial contradiction requires at least two independent domains: ${contradiction.id}`);
      }
    }
  }
  return draft;
}

export function buildAuditableBriefContent(input: {
  draft: EditorialBriefDraft;
  topicLabel: string;
  dossierId: string;
  candidateId: string;
  evidenceHash: string;
  promptVersion: string;
  generatorModel: string;
  evidence: EditorialEvidenceSnapshot[];
}): EditorialBriefContent {
  return {
    schemaVersion: 1,
    topicLabel: input.topicLabel,
    ...input.draft,
    primarySources: sourceSummaries(input.evidence, 'PRIMARY'),
    contextSources: sourceSummaries(input.evidence, 'CONTEXT'),
    audit: {
      dossierId: input.dossierId,
      candidateId: input.candidateId,
      evidenceHash: input.evidenceHash,
      promptVersion: input.promptVersion,
      generatorModel: input.generatorModel,
    },
  };
}

function collectEvidenceKeys(draft: EditorialBriefDraft): Set<string> {
  const keys = new Set<string>();
  draft.centralFacts.forEach((fact) => fact.evidenceKeys.forEach((key) => keys.add(key)));
  draft.timeline.forEach((entry) => entry.evidenceKeys.forEach((key) => keys.add(key)));
  draft.contradictions.forEach((contradiction) =>
    contradiction.sides.forEach((side) => side.evidenceKeys.forEach((key) => keys.add(key))));
  draft.uncertainties.forEach((uncertainty) =>
    uncertainty.evidenceKeys.forEach((key) => keys.add(key)));
  return keys;
}

function assertUniqueIds(ids: string[], label: string): void {
  if (new Set(ids).size !== ids.length) throw new Error(`Editorial brief contains duplicate ${label} IDs`);
}

function sourceSummaries(
  evidence: EditorialEvidenceSnapshot[],
  role: EditorialEvidenceSnapshot['role'],
): EditorialBriefSourceSummary[] {
  const byDocument = new Map<string, EditorialBriefSourceSummary>();
  for (const item of evidence.filter((candidate) => candidate.role === role)) {
    const existing = byDocument.get(item.documentId);
    if (existing) {
      existing.evidenceKeys.push(item.evidenceKey);
      continue;
    }
    byDocument.set(item.documentId, {
      documentId: item.documentId,
      title: item.documentTitle,
      canonicalUrl: item.canonicalUrl,
      domain: item.domain,
      evidenceKeys: [item.evidenceKey],
    });
  }
  return [...byDocument.values()];
}

import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import {
  enqueueDocumentJob,
  type DocumentJobData,
} from '../document-corpus/document-queue.js';
import { buildEvidenceDossier } from './evidence-dossier.js';
import {
  persistWebEvidenceCandidates,
  type PersistWebEvidenceInput,
  type PersistWebEvidenceResult,
} from './evidence-gathering.js';
import { resolveArticleGenerationPolicy } from './policy.js';
import type {
  ArticleGenerationRequest,
  EvidenceDossier,
  EvidenceRole,
} from './types.js';

export interface PrepareEvidenceCorpusDependencies {
  client: PrismaClient;
  documentQueue: Pick<Queue<DocumentJobData>, 'add'>;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
}

export interface PrepareEvidenceCorpusInput {
  request: ArticleGenerationRequest;
  persistence: Omit<PersistWebEvidenceInput, 'mode'>;
  rolesByUrl?: Record<string, EvidenceRole>;
}

export interface PreparedEvidenceCorpus {
  persistence: PersistWebEvidenceResult;
  dossier: EvidenceDossier;
  queuedForCorpus: number;
  queueFailures: Array<{ documentId: string; error: string }>;
  indexingTimedOut: boolean;
}

export async function prepareEvidenceCorpus(
  dependencies: PrepareEvidenceCorpusDependencies,
  input: PrepareEvidenceCorpusInput,
): Promise<PreparedEvidenceCorpus> {
  const policy = resolveArticleGenerationPolicy(input.request.mode, input.request.policy);
  const persistence = await persistWebEvidenceCandidates(dependencies.client, {
    ...input.persistence,
    mode: input.request.mode,
    maxCandidates: Math.min(
      input.persistence.maxCandidates ?? policy.evidence.maximumSources,
      policy.evidence.maximumSources,
    ),
  });
  const queueFailures: Array<{ documentId: string; error: string }> = [];
  let queuedForCorpus = 0;
  const revision = `article-generation-core-${input.request.mode.toLowerCase()}-v1`;

  for (const item of persistence.persisted) {
    try {
      await enqueueDocumentJob(dependencies.documentQueue, {
        documentId: item.documentId,
        revision,
        requestedAt: (dependencies.now?.() ?? new Date()).toISOString(),
        trigger: 'DISCOVERY',
      });
      queuedForCorpus++;
    } catch (error) {
      queueFailures.push({
        documentId: item.documentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const documentIds = persistence.persisted.map((item) => item.documentId);
  const indexingTimedOut = input.request.mode === 'AUTO_EDITORIAL'
    && policy.latency.corpusWaitMs > 0
    ? !await waitForDocuments(dependencies, documentIds, policy.latency.corpusWaitMs)
    : false;
  const rolesByDocumentId = Object.fromEntries(persistence.persisted.map((item) => [
    item.documentId,
    input.rolesByUrl?.[item.requestedUrl] ?? 'CONTEXT',
  ]));
  const dossier = await buildEvidenceDossier(dependencies.client, {
    mode: input.request.mode,
    documentIds,
    usedDocumentIds: documentIds,
    rolesByDocumentId,
  });
  if (queueFailures.length > 0) {
    dossier.traceability = 'DEGRADED';
    dossier.degradedReasons.push('CORPUS_QUEUE_FAILURE');
  }
  if (indexingTimedOut) {
    dossier.traceability = 'DEGRADED';
    dossier.degradedReasons.push('CORPUS_INDEXING_TIMEOUT');
  }

  return {
    persistence,
    dossier,
    queuedForCorpus,
    queueFailures,
    indexingTimedOut,
  };
}

async function waitForDocuments(
  dependencies: PrepareEvidenceCorpusDependencies,
  documentIds: string[],
  timeoutMs: number,
): Promise<boolean> {
  if (documentIds.length === 0) return true;
  const sleep = dependencies.sleep ?? ((milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const documents = await dependencies.client.ingestedDocument.findMany({
      where: { id: { in: documentIds } },
      select: { id: true, status: true, isIndexed: true },
    });
    if (documents.length === documentIds.length
      && documents.every((document) => document.status === 'INDEXED' && document.isIndexed)) {
      return true;
    }
    if (documents.some((document) =>
      ['BLOCKED', 'FAILED'].includes(document.status))) {
      return false;
    }
    await sleep(Math.min(1_000, Math.max(1, deadline - Date.now())));
  }
  return false;
}

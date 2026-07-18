import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { EditorialBriefConfig, EditorialEvidenceSnapshot } from './types.js';

export interface EditorialEvidenceRow {
  topicRole: 'REPRESENTATIVE' | 'EVIDENCE';
  documentId: string;
  documentTitle: string | null;
  canonicalUrl: string;
  domain: string;
  publishedAt: Date | null;
  chunkId: string;
  chunkPosition: number;
  content: string;
  contentHash: string;
  similarity: number;
}

export interface EditorialEvidenceSelection {
  evidence: EditorialEvidenceSnapshot[];
  domains: string[];
  evidenceHash: string | null;
  blockedReason: string | null;
}

export async function loadEditorialEvidenceRows(
  client: PrismaClient,
  candidateId: string,
  maxChunksPerDocument: number,
): Promise<EditorialEvidenceRow[]> {
  return client.$queryRaw<EditorialEvidenceRow[]>(Prisma.sql`
    WITH ranked_chunks AS (
      SELECT
        etd.role::text AS "topicRole",
        d.id AS "documentId",
        d.title AS "documentTitle",
        d."canonicalUrl",
        d.domain,
        d."publishedAt",
        dc.id AS "chunkId",
        dc.position AS "chunkPosition",
        dc.content,
        dc."contentHash",
        (1 - (dc.embedding <=> et."centroidEmbedding"))::double precision AS similarity,
        ROW_NUMBER() OVER (
          PARTITION BY d.id
          ORDER BY dc.embedding <=> et."centroidEmbedding", dc.position ASC, dc.id ASC
        ) AS chunk_rank
      FROM "EditorialCandidate" ec
      JOIN "EditorialTopic" et ON et.id = ec."topicId"
      JOIN "EditorialTopicDocument" etd ON etd."topicId" = et.id
      JOIN "IngestedDocument" d ON d.id = etd."documentId"
      JOIN "DocumentChunk" dc ON dc."documentId" = d.id
      WHERE ec.id = ${candidateId}
        AND ec."shadowOnly" = true
        AND etd.role <> 'QUASI_DUPLICATE'
        AND et."centroidEmbedding" IS NOT NULL
        AND dc.embedding IS NOT NULL
        AND dc."embeddingModel" = et."centroidModel"
    )
    SELECT
      "topicRole", "documentId", "documentTitle", "canonicalUrl", domain,
      "publishedAt", "chunkId", "chunkPosition", content, "contentHash", similarity
    FROM ranked_chunks
    WHERE chunk_rank <= ${maxChunksPerDocument}
    ORDER BY
      CASE WHEN "topicRole" = 'REPRESENTATIVE' THEN 0 ELSE 1 END,
      similarity DESC,
      domain ASC,
      "documentId" ASC,
      "chunkPosition" ASC
  `);
}

export function selectEditorialEvidence(
  rows: EditorialEvidenceRow[],
  config: EditorialBriefConfig,
  requiredDomains: number,
): EditorialEvidenceSelection {
  const eligible = rows
    .filter((row) => Number.isFinite(row.similarity) && row.similarity >= config.minimumChunkSimilarity)
    .map((row) => ({ ...row, domain: row.domain.trim().toLowerCase() }))
    .filter((row) => row.domain && row.content.trim());
  const documents = groupDocuments(eligible, config.maximumChunksPerDocument);
  const selectedDocumentIds: string[] = [];
  const seenDomains = new Set<string>();

  for (const document of documents) {
    if (selectedDocumentIds.length >= config.maximumDocuments) break;
    if (!seenDomains.has(document.domain)) {
      selectedDocumentIds.push(document.documentId);
      seenDomains.add(document.domain);
    }
  }
  for (const document of documents) {
    if (selectedDocumentIds.length >= config.maximumDocuments) break;
    if (!selectedDocumentIds.includes(document.documentId)) selectedDocumentIds.push(document.documentId);
  }

  if (seenDomains.size < requiredDomains) {
    return {
      evidence: [],
      domains: [...seenDomains].sort(),
      evidenceHash: null,
      blockedReason: `Insufficient independent source diversity: ${seenDomains.size}/${requiredDomains} domains`,
    };
  }

  const primaryDocumentIds = new Set<string>();
  const primaryDomains = new Set<string>();
  for (const documentId of selectedDocumentIds) {
    const document = documents.find((item) => item.documentId === documentId)!;
    if (
      document.topicRole === 'REPRESENTATIVE' ||
      (primaryDomains.size < requiredDomains && !primaryDomains.has(document.domain))
    ) {
      primaryDocumentIds.add(documentId);
      primaryDomains.add(document.domain);
    }
  }
  const evidence: EditorialEvidenceSnapshot[] = [];
  for (const documentId of selectedDocumentIds) {
    const document = documents.find((item) => item.documentId === documentId)!;
    for (const row of document.rows) {
      if (evidence.length >= config.maximumEvidenceChunks) break;
      evidence.push({
        evidenceKey: buildEvidenceKey(row.chunkId),
        documentId: row.documentId,
        chunkId: row.chunkId,
        role: primaryDocumentIds.has(row.documentId) ? 'PRIMARY' : 'CONTEXT',
        position: evidence.length,
        similarity: row.similarity,
        documentTitle: row.documentTitle?.trim() || `Source ${row.domain}`,
        canonicalUrl: row.canonicalUrl,
        domain: row.domain,
        publishedAt: row.publishedAt,
        chunkPosition: row.chunkPosition,
        contentSnapshot: row.content.trim(),
        contentHash: row.contentHash,
      });
    }
  }
  const domains = [...new Set(evidence.map((item) => item.domain))].sort();
  const evidenceHash = createHash('sha256')
    .update(JSON.stringify(evidence.map((item) => ({
      evidenceKey: item.evidenceKey,
      documentId: item.documentId,
      chunkId: item.chunkId,
      contentHash: item.contentHash,
      role: item.role,
      position: item.position,
    }))))
    .digest('hex');
  return { evidence, domains, evidenceHash, blockedReason: null };
}

function groupDocuments(rows: EditorialEvidenceRow[], maxChunks: number) {
  const grouped = new Map<string, EditorialEvidenceRow[]>();
  for (const row of rows) {
    const group = grouped.get(row.documentId) ?? [];
    if (group.length < maxChunks) group.push(row);
    grouped.set(row.documentId, group);
  }
  return [...grouped.entries()].map(([documentId, documentRows]) => ({
    documentId,
    domain: documentRows[0].domain,
    topicRole: documentRows[0].topicRole,
    similarity: Math.max(...documentRows.map((row) => row.similarity)),
    rows: documentRows.sort((left, right) => right.similarity - left.similarity || left.chunkPosition - right.chunkPosition),
  })).sort((left, right) =>
    Number(right.topicRole === 'REPRESENTATIVE') - Number(left.topicRole === 'REPRESENTATIVE') ||
    right.similarity - left.similarity || left.domain.localeCompare(right.domain) ||
    left.documentId.localeCompare(right.documentId));
}

function buildEvidenceKey(chunkId: string): string {
  return `ev_${createHash('sha256').update(chunkId).digest('hex').slice(0, 20)}`;
}

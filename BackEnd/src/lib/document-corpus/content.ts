import { createHash } from 'node:crypto';

export const DOCUMENT_CHUNKING_VERSION = 1;
export const DOCUMENT_EXCERPT_MAX_CHARACTERS = 4_000;
export const DOCUMENT_CHUNK_MAX_CHARACTERS = 1_200;
export const DOCUMENT_CHUNK_OVERLAP_CHARACTERS = 160;
export const DOCUMENT_CHUNK_MIN_CHARACTERS = 80;
const DOCUMENT_CHUNK_TITLE_MAX_CHARACTERS = 240;

export interface DocumentChunkCandidate {
  position: number;
  content: string;
  contentHash: string;
  estimatedTokens: number;
}

export function normalizeDocumentContent(content: string): string {
  return content
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t\f\v ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function hashDocumentContent(content: string): string {
  return createHash('sha256').update(normalizeDocumentContent(content), 'utf8').digest('hex');
}

export function createDocumentExcerpt(
  content: string,
  maximumCharacters = DOCUMENT_EXCERPT_MAX_CHARACTERS,
): string {
  const normalized = normalizeDocumentContent(content);
  if (normalized.length <= maximumCharacters) return normalized;

  const candidate = normalized.slice(0, maximumCharacters + 1);
  const minimumReadableBoundary = Math.floor(maximumCharacters * 0.7);
  const sentenceBoundary = candidate.lastIndexOf('. ') + 1;
  const paragraphBoundary = candidate.lastIndexOf('\n');
  const wordBoundary = candidate.lastIndexOf(' ');
  const end = sentenceBoundary >= minimumReadableBoundary
    ? sentenceBoundary
    : paragraphBoundary >= minimumReadableBoundary
      ? paragraphBoundary
      : wordBoundary >= minimumReadableBoundary
        ? wordBoundary
        : maximumCharacters;
  return candidate.slice(0, end).trim();
}

export function chunkDocumentContent(
  title: string | null | undefined,
  content: string,
): DocumentChunkCandidate[] {
  const normalizedTitle = normalizeDocumentContent(title ?? '')
    .slice(0, DOCUMENT_CHUNK_TITLE_MAX_CHARACTERS)
    .trim();
  const normalizedContent = normalizeDocumentContent(content);
  if (!normalizedContent) return [];

  const prefix = normalizedTitle ? `${normalizedTitle}\n\n` : '';
  const chunks: DocumentChunkCandidate[] = [];
  let offset = 0;

  while (offset < normalizedContent.length) {
    const availableForBody = Math.max(
      DOCUMENT_CHUNK_MIN_CHARACTERS,
      DOCUMENT_CHUNK_MAX_CHARACTERS - prefix.length,
    );
    let end = Math.min(normalizedContent.length, offset + availableForBody);

    if (end < normalizedContent.length) {
      const candidate = normalizedContent.slice(offset, end);
      const boundary = bestChunkBoundary(candidate);
      if (boundary >= Math.floor(availableForBody * 0.6)) {
        end = offset + boundary;
      }
    }

    const body = normalizedContent.slice(offset, end).trim();
    if (body.length >= DOCUMENT_CHUNK_MIN_CHARACTERS || chunks.length === 0) {
      const chunkContent = `${prefix}${body}`.trim();
      chunks.push({
        position: chunks.length,
        content: chunkContent,
        contentHash: hashDocumentContent(chunkContent),
        estimatedTokens: Math.max(1, Math.ceil(chunkContent.length / 4)),
      });
    }

    if (end >= normalizedContent.length) break;
    const nextOffset = Math.max(offset + 1, end - DOCUMENT_CHUNK_OVERLAP_CHARACTERS);
    offset = advancePastWhitespace(normalizedContent, nextOffset);
  }

  return chunks;
}

function bestChunkBoundary(candidate: string): number {
  return Math.max(
    candidate.lastIndexOf('\n\n') + 2,
    candidate.lastIndexOf('. ') + 2,
    candidate.lastIndexOf(' '),
  );
}

function advancePastWhitespace(content: string, offset: number): number {
  let current = offset;
  while (current < content.length && /\s/.test(content[current])) current++;
  return current;
}

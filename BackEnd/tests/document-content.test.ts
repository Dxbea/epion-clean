import { describe, expect, it } from 'vitest';
import {
  chunkDocumentContent,
  createDocumentExcerpt,
  DOCUMENT_CHUNK_MAX_CHARACTERS,
  hashDocumentContent,
  normalizeDocumentContent,
} from '../src/lib/document-corpus/content.js';

describe('document corpus normalization, hashing and chunking', () => {
  it('creates the same exact-content identity despite line ending and spacing noise', () => {
    const left = 'Titre\r\n\r\nUne   phrase.\tSuite.';
    const right = 'Titre\n\nUne phrase. Suite.';
    expect(normalizeDocumentContent(left)).toBe(right);
    expect(hashDocumentContent(left)).toBe(hashDocumentContent(right));
    expect(hashDocumentContent(left)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('creates deterministic bounded chunks with hashes and token estimates', () => {
    const content = Array.from(
      { length: 80 },
      (_, index) => `Paragraphe ${index} apporte un fait vérifiable et suffisamment détaillé.`,
    ).join('\n\n');
    const first = chunkDocumentContent('Actualité', content);
    const second = chunkDocumentContent('Actualité', content);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(2);
    expect(first.every((chunk) => chunk.content.length <= DOCUMENT_CHUNK_MAX_CHARACTERS)).toBe(true);
    expect(first.map((chunk) => chunk.position)).toEqual(first.map((_, index) => index));
    expect(first.every((chunk) => chunk.estimatedTokens > 0)).toBe(true);
  });

  it('stores a bounded excerpt at a readable boundary', () => {
    const excerpt = createDocumentExcerpt('Une phrase. '.repeat(1_000), 400);
    expect(excerpt.length).toBeLessThanOrEqual(400);
    expect(excerpt.endsWith('.')).toBe(true);
  });
});

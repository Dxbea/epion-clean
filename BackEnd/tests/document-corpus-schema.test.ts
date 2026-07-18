import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('document corpus Prisma contract', () => {
  const schemaPath = fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url));
  const schema = readFileSync(schemaPath, 'utf8');

  it('uses a global exact-content primary key and a document-scoped chunk identity', () => {
    expect(schema).toMatch(/model DocumentContentIdentity[\s\S]*contentHash\s+String\s+@id/);
    expect(schema).toMatch(/model DocumentChunk[\s\S]*@@unique\(\[documentId, position\]\)/);
    expect(schema).toContain('embedding Unsupported("vector(1536)")?');
  });

  it('keeps document chunks related to IngestedDocument rather than Article', () => {
    const documentChunk = schema.match(/model DocumentChunk \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(documentChunk).toContain('IngestedDocument');
    expect(documentChunk).not.toContain('Article');
  });
});

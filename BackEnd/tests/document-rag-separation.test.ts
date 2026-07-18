import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('article and documentary RAG separation contract', () => {
  it('keeps the published Article filter in the existing RAG service', () => {
    const path = fileURLToPath(new URL('../src/lib/rag-service.ts', import.meta.url));
    const source = readFileSync(path, 'utf8');
    expect(source).toContain("a.status = 'PUBLISHED'");
    expect(source).not.toContain('DocumentChunk');
  });
});

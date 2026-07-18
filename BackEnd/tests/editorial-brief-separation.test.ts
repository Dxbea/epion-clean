import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('editorial brief strict shadow separation', () => {
  it('is not bootstrapped by the API or active worker registry', () => {
    const server = readFileSync(join(process.cwd(), 'src', 'server.ts'), 'utf8');
    const workers = readFileSync(join(process.cwd(), 'src', 'workers', 'index.ts'), 'utf8');
    expect(server).not.toContain('editorial-brief');
    expect(workers).not.toContain('editorial-brief');
  });

  it('does not create, update or publish Article records', () => {
    for (const file of ['dossier-service.ts', 'evidence-selection.ts', 'brief-generator.ts']) {
      const source = readFileSync(join(process.cwd(), 'src', 'lib', 'editorial-brief', file), 'utf8');
      expect(source).not.toMatch(/\barticle\.(create|update|upsert|publish)/i);
      expect(source).not.toContain('Article.status');
    }
  });
});

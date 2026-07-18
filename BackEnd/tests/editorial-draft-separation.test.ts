import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('controlled editorial draft separation', () => {
  it('adds no public endpoint and no automatic worker bootstrap', () => {
    const server = readFileSync(join(process.cwd(), 'src', 'server.ts'), 'utf8');
    const workers = readFileSync(join(process.cwd(), 'src', 'workers', 'index.ts'), 'utf8');
    expect(server).not.toContain('editorial-draft');
    expect(workers).not.toContain('editorial-draft');
  });

  it('isolates the only Article creation behind the human approval service', () => {
    const service = readFileSync(join(process.cwd(), 'src', 'lib', 'editorial-draft', 'draft-service.ts'), 'utf8');
    const worker = readFileSync(join(process.cwd(), 'src', 'workers', 'editorial-draft.worker.ts'), 'utf8');
    const approval = readFileSync(join(process.cwd(), 'src', 'lib', 'editorial-draft', 'approval-service.ts'), 'utf8');
    expect(service).not.toContain('article.create');
    expect(worker).not.toContain('article.create');
    expect(approval).toContain('reviewer.role !== \'ADMIN\'');
    expect(approval).toContain("automatedDecision !== 'PASSED'");
    expect(approval).toContain("status: 'DRAFT'");
    expect(approval).not.toContain("status: 'PUBLISHED'");
  });
});

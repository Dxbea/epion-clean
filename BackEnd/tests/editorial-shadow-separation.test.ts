import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('editorial shadow runtime separation', () => {
  it('is not imported by the API or the active worker bootstrap', () => {
    const server = readFileSync(
      fileURLToPath(new URL('../src/server.ts', import.meta.url)),
      'utf8',
    );
    const workerBootstrap = readFileSync(
      fileURLToPath(new URL('../src/workers/index.ts', import.meta.url)),
      'utf8',
    );
    expect(server).not.toContain('editorial-shadow');
    expect(workerBootstrap).not.toContain('editorial-shadow');
  });

  it('does not invoke article creation from the shadow service or worker', () => {
    const service = readFileSync(
      fileURLToPath(new URL('../src/lib/editorial-shadow/editorial-run-service.ts', import.meta.url)),
      'utf8',
    );
    const worker = readFileSync(
      fileURLToPath(new URL('../src/workers/editorial-shadow.worker.ts', import.meta.url)),
      'utf8',
    );
    expect(service).not.toMatch(/\.article\.(create|update|upsert)/);
    expect(worker).not.toMatch(/\.article\.(create|update|upsert)/);
  });
});

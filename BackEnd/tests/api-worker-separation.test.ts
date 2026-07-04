import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const backendRoot = process.cwd();

function readBackendFile(path: string): string {
  return readFileSync(join(backendRoot, path), 'utf8');
}

describe('API and worker process separation', () => {
  it('keeps worker and background startup out of the API entrypoint', () => {
    const serverSource = readBackendFile('src/server.ts');

    expect(serverSource).not.toMatch(/\.\/workers\//);
    expect(serverSource).not.toMatch(/\binitializeCron\b/);
    expect(serverSource).not.toMatch(/\bscheduleRecurringJobs\b/);
    expect(serverSource).not.toMatch(/\brecalculateBridgingScores\b/);
    expect(serverSource).not.toMatch(/\bsetInterval\b/);
  });

  it('requires each worker module to expose explicit start functions instead of top-level workers', () => {
    const workers = [
      ['src/workers/embedding.worker.ts', 'startEmbeddingWorker'],
      ['src/workers/source-enrichment.worker.ts', 'startSourceEnrichmentWorker'],
      ['src/workers/live-analysis.worker.ts', 'startLiveAnalysisWorker'],
      ['src/workers/news-worker.ts', 'startNewsWorker'],
    ] as const;

    for (const [path, startFunction] of workers) {
      const source = readBackendFile(path);

      expect(source).toContain(`export function ${startFunction}`);
      expect(source).not.toMatch(/export const \w+Worker\s*=\s*new Worker/);
    }
  });
});

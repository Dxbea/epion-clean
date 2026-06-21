import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readBackendFile(relativePath: string): string {
  return fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
}

describe('process architecture', () => {
  it('does not import workers from the API entrypoint', () => {
    const server = readBackendFile('src/server.ts');

    expect(server).not.toMatch(/import\s+['"].*workers\//);
    expect(server).not.toContain('createEmbeddingWorker');
    expect(server).not.toContain('createSourceEnrichmentWorker');
    expect(server).not.toContain('createLiveAnalysisWorker');
    expect(server).not.toContain('createNewsWorker');
  });

  it('keeps schedulers out of the API entrypoint', () => {
    const server = readBackendFile('src/server.ts');

    expect(server).not.toContain('initializeCron');
    expect(server).not.toContain('scheduleRecurringNewsJobs');
    expect(server).not.toContain('startBridgingScoreScheduler');
  });

  it('keeps worker modules free of top-level worker construction', () => {
    const workerFiles = [
      'src/workers/embedding.worker.ts',
      'src/workers/source-enrichment.worker.ts',
      'src/workers/live-analysis.worker.ts',
      'src/workers/news-worker.ts',
    ];

    for (const file of workerFiles) {
      const source = readBackendFile(file);
      const factoryIndex = source.indexOf('export function create');
      const firstWorkerIndex = source.indexOf('new Worker(');

      expect(factoryIndex).toBeGreaterThanOrEqual(0);
      expect(firstWorkerIndex).toBeGreaterThan(factoryIndex);
    }
  });

  it('wires every process entrypoint to graceful shutdown', () => {
    const entrypoints = [
      'src/server.ts',
      'src/scheduler.ts',
      'src/processes/embedding-worker.ts',
      'src/processes/source-enrichment-worker.ts',
      'src/processes/live-analysis-worker.ts',
      'src/processes/news-worker.ts',
    ];

    for (const entrypoint of entrypoints) {
      const source = readBackendFile(entrypoint);
      expect(source).toContain('createShutdownManager');
      expect(source).toContain('installSignalHandlers');
      expect(source).toContain('closeSentry');
    }
  });
});
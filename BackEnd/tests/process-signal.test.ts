import { describe, expect, it } from 'vitest';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiledEntrypoint = path.join(backendRoot, 'dist/processes/embedding-worker.js');
const compiledInstrument = path.join(backendRoot, 'dist/instrument.js');
const sourceFiles = [
  path.join(backendRoot, 'src/processes/embedding-worker.ts'),
  path.join(backendRoot, 'src/workers/embedding.worker.ts'),
  path.join(backendRoot, 'src/lib/shutdown.ts'),
  path.join(backendRoot, 'src/instrument.ts'),
];

const describeOnLinuxWithFreshDist = process.platform === 'linux' && hasFreshCompiledArtifacts()
  ? describe
  : describe.skip;

describeOnLinuxWithFreshDist('compiled process shutdown on Linux', () => {
  it('exits cleanly after SIGTERM', async () => {
    const child = spawn(process.execPath, [
      '--import',
      './dist/instrument.js',
      'dist/processes/embedding-worker.js',
    ], {
      cwd: backendRoot,
      env: {
        ...process.env,
        SHUTDOWN_TIMEOUT_MS: '5000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });

    await waitForOutput(() => output.includes('Embedding Worker started'), 8_000);
    child.kill('SIGTERM');

    const result = await waitForExit(child, 8_000);

    expect(result.signal).toBeNull();
    expect(result.code).toBe(0);
    expect(output).toContain('Shutdown completed');
  }, 20_000);
});

function hasFreshCompiledArtifacts(): boolean {
  if (!fs.existsSync(compiledEntrypoint) || !fs.existsSync(compiledInstrument)) {
    return false;
  }

  const oldestCompiledMtime = Math.min(
    fs.statSync(compiledEntrypoint).mtimeMs,
    fs.statSync(compiledInstrument).mtimeMs,
  );

  return sourceFiles.every((sourceFile) => (
    fs.existsSync(sourceFile) && fs.statSync(sourceFile).mtimeMs <= oldestCompiledMtime
  ));
}

function waitForOutput(predicate: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      if (predicate()) {
        clearInterval(interval);
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(interval);
        reject(new Error('Timed out waiting for process output'));
      }
    }, 50);
  });
}

function waitForExit(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Timed out waiting for process exit'));
    }, timeoutMs);

    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}
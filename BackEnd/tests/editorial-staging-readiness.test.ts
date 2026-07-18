import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertStagingShadowSafety, requireStagingWriteConfirmation } from '../src/lib/editorial-staging/safety.js';
import { evaluateStagingReadiness, type StagingReadinessInput } from '../src/scripts/editorial-staging-readiness.js';

const ready: StagingReadinessInput = {
  safetyPassed: true, migrationFilesValid: true, pendingMigrations: [], databaseConnected: true,
  pgvectorInstalled: true, redisConnected: true, adminCount: 1, adminHttpStatus: 200,
  discoverySourceCount: 1, calibrationEnabled: true, opsMutationsEnabled: false, opsKillSwitch: true,
  queues: ['editorial-discovery-queue', 'document-corpus-queue', 'editorial-shadow-queue', 'editorial-brief-queue', 'editorial-draft-queue', 'editorial-verification-queue']
    .map((name) => ({ name, workerCount: 1, waiting: 0, delayed: 0, failed: 0 })),
  flags: ['discovery', 'document-corpus', 'editorial-shadow', 'editorial-brief', 'editorial-draft', 'editorial-verification']
    .map((name) => ({ name, enabled: true, killSwitch: false })),
};

describe('editorial staging readiness safety', () => {
  it('accepts shadow staging while autopublication is disabled', () => {
    expect(assertStagingShadowSafety({ NODE_ENV: 'staging', EDITORIAL_AUTOPUBLISH_ENABLED: 'false' })).toMatchObject({ shadowOnly: true, autopublishEnabled: false });
    expect(() => requireStagingWriteConfirmation(['--confirm=EPION_STAGING_SHADOW'])).not.toThrow();
  });

  it('rejects production/development writes and every known autopublish alias', () => {
    expect(() => assertStagingShadowSafety({ NODE_ENV: 'production' })).toThrow('NODE_ENV=staging');
    expect(() => assertStagingShadowSafety({ NODE_ENV: 'staging', AUTO_PUBLISH_ENABLED: 'true' })).toThrow('Autopublication must remain disabled');
    expect(() => requireStagingWriteConfirmation([])).toThrow('--confirm=EPION_STAGING_SHADOW');
  });

  it('requires six separately registered workers and reports replay as optional during initial soak', () => {
    const checks = evaluateStagingReadiness(ready);
    expect(checks.filter((check) => check.level === 'FAIL')).toEqual([]);
    expect(checks.find((check) => check.code === 'OPS_REPLAY')?.level).toBe('WARN');
    const missingWorker = evaluateStagingReadiness({ ...ready, queues: ready.queues.map((queue, index) => index === 5 ? { ...queue, workerCount: 0 } : queue) });
    expect(missingWorker).toContainEqual(expect.objectContaining({ code: 'WORKER:editorial-verification-queue', level: 'FAIL' }));
  });

  it('documents workers as standalone and forbids automatic publication', () => {
    const runbook = fs.readFileSync(path.resolve('docs/editorial-shadow-staging-runbook.md'), 'utf8');
    expect(runbook).toContain('npm run worker:document-corpus');
    expect(runbook).toContain('npm run worker:editorial-verification');
    expect(runbook).toContain('EDITORIAL_AUTOPUBLISH_ENABLED=false');
    expect(runbook).toContain('WAITING_HUMAN_APPROVAL');
  });
});

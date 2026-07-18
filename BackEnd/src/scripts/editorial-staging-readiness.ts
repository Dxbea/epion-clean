import { fileURLToPath } from 'node:url';
import type { ConnectionOptions, Queue } from 'bullmq';
import { prisma } from '../lib/db.js';
import { createDiscoveryQueues, createDiscoveryRedisConnection } from '../lib/discovery/discovery-queue.js';
import { createDocumentQueues } from '../lib/document-corpus/document-queue.js';
import { createEditorialShadowQueues } from '../lib/editorial-shadow/editorial-queue.js';
import { createEditorialBriefQueues } from '../lib/editorial-brief/brief-queue.js';
import { createEditorialDraftQueues } from '../lib/editorial-draft/draft-queue.js';
import { createEditorialVerificationQueues } from '../lib/editorial-verification/verification-queue.js';
import { resolveDiscoveryRuntimeFlags } from '../lib/discovery/runtime-flags.js';
import { resolveDocumentPipelineRuntimeFlags } from '../lib/document-corpus/runtime-flags.js';
import { resolveEditorialShadowRuntimeFlags } from '../lib/editorial-shadow/runtime-flags.js';
import { resolveEditorialBriefRuntimeFlags } from '../lib/editorial-brief/runtime-flags.js';
import { resolveEditorialDraftRuntimeFlags } from '../lib/editorial-draft/runtime-flags.js';
import { resolveEditorialVerificationRuntimeFlags } from '../lib/editorial-verification/runtime-flags.js';
import { resolveEditorialShadowOpsFlags } from '../lib/editorial-verification/ops-flags.js';
import { assertStagingShadowSafety, STAGING_DISCOVERY_SOURCE_KEY } from '../lib/editorial-staging/safety.js';
import { runEditorialMigrationAudit } from './audit-editorial-migrations.js';

export type ReadinessLevel = 'PASS' | 'WARN' | 'FAIL';
export interface StagingReadinessCheck { code: string; level: ReadinessLevel; detail: string; }
export interface StagingReadinessInput {
  safetyPassed: boolean;
  migrationFilesValid: boolean;
  pendingMigrations: string[];
  databaseConnected: boolean;
  pgvectorInstalled: boolean;
  redisConnected: boolean;
  adminCount: number;
  adminHttpStatus: number | null;
  discoverySourceCount: number;
  queues: Array<{ name: string; workerCount: number; waiting: number; delayed: number; failed: number }>;
  flags: Array<{ name: string; enabled: boolean; killSwitch: boolean }>;
  calibrationEnabled: boolean;
  opsMutationsEnabled: boolean;
  opsKillSwitch: boolean;
}

export function evaluateStagingReadiness(input: StagingReadinessInput): StagingReadinessCheck[] {
  const checks: StagingReadinessCheck[] = [
    check('SHADOW_SAFETY', input.safetyPassed, 'Autopublication is disabled and NODE_ENV is staging'),
    check('MIGRATION_FILES', input.migrationFilesValid, 'PR1–PR14 migration files are ordered and dependencies are present'),
    check('MIGRATIONS_APPLIED', input.pendingMigrations.length === 0, input.pendingMigrations.length ? `Pending: ${input.pendingMigrations.join(', ')}` : 'All editorial migrations are applied'),
    check('POSTGRESQL', input.databaseConnected, 'PostgreSQL connection'),
    check('PGVECTOR', input.pgvectorInstalled, 'pgvector extension'),
    check('REDIS', input.redisConnected, 'Redis/BullMQ connection'),
    check('ADMIN_USER', input.adminCount > 0, `${input.adminCount} ADMIN user(s) available`),
    input.adminHttpStatus === null
      ? { code: 'ADMIN_HTTP', level: 'WARN', detail: 'Authenticated admin HTTP probe not configured' }
      : check('ADMIN_HTTP', input.adminHttpStatus === 200, `Admin overview returned HTTP ${input.adminHttpStatus}`),
    check('DISCOVERY_SOURCE', input.discoverySourceCount > 0, `${input.discoverySourceCount} enabled staging discovery source(s)`),
  ];
  for (const flag of input.flags) checks.push(check(`FLAG:${flag.name}`, flag.enabled && !flag.killSwitch, `${flag.name}: enabled=${flag.enabled}, killSwitch=${flag.killSwitch}`));
  for (const queue of input.queues) {
    checks.push(queue.workerCount > 0
      ? { code: `WORKER:${queue.name}`, level: 'PASS', detail: `${queue.workerCount} worker(s); waiting=${queue.waiting}; delayed=${queue.delayed}; failed=${queue.failed}` }
      : { code: `WORKER:${queue.name}`, level: 'FAIL', detail: 'No BullMQ worker registered' });
  }
  checks.push(check('SHADOW_CALIBRATION', input.calibrationEnabled, `calibrationEnabled=${input.calibrationEnabled}`));
  checks.push(input.opsMutationsEnabled && !input.opsKillSwitch
    ? { code: 'OPS_REPLAY', level: 'PASS', detail: 'Controlled replay operations enabled' }
    : { code: 'OPS_REPLAY', level: 'WARN', detail: `mutationsEnabled=${input.opsMutationsEnabled}, killSwitch=${input.opsKillSwitch}` });
  return checks;
}

export async function collectStagingReadiness(values: NodeJS.ProcessEnv = process.env) {
  let safetyPassed = false;
  try { assertStagingShadowSafety(values); safetyPassed = true; } catch { safetyPassed = false; }
  const migrationAudit = runEditorialMigrationAudit();
  let databaseConnected = false;
  let pgvectorInstalled = false;
  let pendingMigrations = [...migrationAudit.sequence];
  let adminCount = 0;
  let discoverySourceCount = 0;
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseConnected = true;
    const extensions = await prisma.$queryRaw<Array<{ exists: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS "exists"`;
    pgvectorInstalled = extensions[0]?.exists === true;
    const applied = await prisma.$queryRaw<Array<{ migration_name: string }>>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const appliedNames = new Set(applied.map((row) => row.migration_name));
    pendingMigrations = migrationAudit.sequence.filter((name) => !appliedNames.has(name));
    adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    discoverySourceCount = await prisma.discoverySource.count({ where: { key: STAGING_DISCOVERY_SOURCE_KEY, enabled: true, disabledReason: null, accessPolicy: { not: 'BLOCKED' } } });
  } catch { databaseConnected = false; }

  const connection = createDiscoveryRedisConnection();
  let redisConnected = false;
  const queueRuntimes: Array<{ close(): Promise<void>; queues: Queue[] }> = [];
  const queues: StagingReadinessInput['queues'] = [];
  try {
    redisConnected = await withTimeout(connection.ping(), 5_000) === 'PONG';
    if (redisConnected) {
      const options = connection as unknown as ConnectionOptions;
      const discovery = createDiscoveryQueues(options);
      const document = createDocumentQueues(options);
      const shadow = createEditorialShadowQueues(options);
      const brief = createEditorialBriefQueues(options);
      const draft = createEditorialDraftQueues(options);
      const verification = createEditorialVerificationQueues(options);
      const primaryQueues = [discovery.discoveryQueue, document.documentQueue, shadow.editorialQueue, brief.briefQueue, draft.draftQueue, verification.verificationQueue];
      const allQueues = [discovery.discoveryQueue, discovery.deadLetterQueue, document.documentQueue, document.deadLetterQueue, shadow.editorialQueue, shadow.deadLetterQueue, brief.briefQueue, brief.deadLetterQueue, draft.draftQueue, draft.deadLetterQueue, verification.verificationQueue, verification.deadLetterQueue];
      queueRuntimes.push({ queues: allQueues, close: async () => { await Promise.all(allQueues.map((queue) => queue.close())); } });
      for (const queue of primaryQueues) {
        const [counts, workers] = await Promise.all([queue.getJobCounts('waiting', 'delayed', 'failed'), queue.getWorkers()]);
        queues.push({ name: queue.name, workerCount: workers.length, waiting: counts.waiting ?? 0, delayed: counts.delayed ?? 0, failed: counts.failed ?? 0 });
      }
    }
  } catch { redisConnected = false; }
  finally {
    await Promise.all(queueRuntimes.map((runtime) => runtime.close().catch(() => undefined)));
    connection.disconnect();
  }

  const discoveryFlags = resolveDiscoveryRuntimeFlags(values);
  const documentFlags = resolveDocumentPipelineRuntimeFlags(values);
  const shadowFlags = resolveEditorialShadowRuntimeFlags(values);
  const briefFlags = resolveEditorialBriefRuntimeFlags(values);
  const draftFlags = resolveEditorialDraftRuntimeFlags(values);
  const verificationFlags = resolveEditorialVerificationRuntimeFlags(values);
  const opsFlags = resolveEditorialShadowOpsFlags(values);
  const input: StagingReadinessInput = {
    safetyPassed, migrationFilesValid: migrationAudit.valid, pendingMigrations, databaseConnected, pgvectorInstalled,
    redisConnected, adminCount, adminHttpStatus: await probeAdmin(values), discoverySourceCount, queues,
    flags: [
      { name: 'discovery', enabled: discoveryFlags.enabled, killSwitch: discoveryFlags.killSwitch },
      { name: 'document-corpus', enabled: documentFlags.enabled, killSwitch: documentFlags.killSwitch },
      { name: 'editorial-shadow', enabled: shadowFlags.enabled, killSwitch: shadowFlags.killSwitch },
      { name: 'editorial-brief', enabled: briefFlags.enabled, killSwitch: briefFlags.killSwitch },
      { name: 'editorial-draft', enabled: draftFlags.enabled, killSwitch: draftFlags.killSwitch },
      { name: 'editorial-verification', enabled: verificationFlags.enabled, killSwitch: verificationFlags.killSwitch },
    ],
    calibrationEnabled: opsFlags.calibrationEnabled,
    opsMutationsEnabled: opsFlags.mutationsEnabled,
    opsKillSwitch: opsFlags.killSwitch,
  };
  return { generatedAt: new Date().toISOString(), shadowOnly: true, input, checks: evaluateStagingReadiness(input) };
}

async function probeAdmin(values: NodeJS.ProcessEnv): Promise<number | null> {
  const url = values.STAGING_ADMIN_OVERVIEW_URL?.trim();
  const cookie = values.STAGING_ADMIN_SESSION_COOKIE?.trim();
  if (!url || !cookie) return null;
  try { return (await fetch(url, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(10_000) })).status; }
  catch { return 0; }
}

function check(code: string, passed: boolean, detail: string): StagingReadinessCheck { return { code, level: passed ? 'PASS' : 'FAIL', detail }; }
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Readiness dependency timeout')), timeoutMs);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  collectStagingReadiness().then((report) => {
    console.log(JSON.stringify(report, null, 2));
    const strict = process.argv.includes('--strict');
    const failed = report.checks.some((item) => item.level === 'FAIL' || (strict && item.level === 'WARN'));
    if (failed) process.exitCode = 1;
  }).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}

import { fileURLToPath } from 'node:url';
import type { ConnectionOptions, Queue } from 'bullmq';
import { prisma } from '../lib/db.js';
import { assertProdShadowSafety, PROD_SHADOW_DISCOVERY_SOURCE_KEY } from '../lib/editorial-prod-shadow/safety.js';
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
import { runEditorialMigrationAudit } from './audit-editorial-migrations.js';

type Level = 'PASS' | 'FAIL';
interface Check { code: string; level: Level; detail: string; }
const killSwitches = [
  'epion:discovery:kill-switch', 'epion:document-corpus:kill-switch', 'epion:editorial-shadow:kill-switch',
  'epion:editorial-brief:kill-switch', 'epion:editorial-draft:kill-switch', 'epion:editorial-verification:kill-switch',
] as const;

export async function collectProdShadowReadiness(values: NodeJS.ProcessEnv = process.env) {
  const checks: Check[] = [];
  try { assertProdShadowSafety(values); checks.push(pass('PROD_SHADOW_SAFETY', 'Production shadow guards are all explicit')); }
  catch (error) { checks.push(fail('PROD_SHADOW_SAFETY', message(error))); }
  const audit = runEditorialMigrationAudit();
  checks.push(audit.valid ? pass('MIGRATION_FILES', 'Editorial migrations are ordered') : fail('MIGRATION_FILES', 'Editorial migration audit failed'));

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push(pass('POSTGRESQL', 'PostgreSQL connection'));
    const vector = await prisma.$queryRaw<Array<{ exists: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS "exists"`;
    checks.push(vector[0]?.exists ? pass('PGVECTOR', 'pgvector extension') : fail('PGVECTOR', 'vector extension is missing'));
    const applied = await prisma.$queryRaw<Array<{ migration_name: string }>>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const appliedNames = new Set(applied.map((row) => row.migration_name));
    const pending = audit.sequence.filter((name) => !appliedNames.has(name));
    checks.push(pending.length === 0 ? pass('MIGRATIONS_APPLIED', 'All editorial migrations are applied') : fail('MIGRATIONS_APPLIED', `Pending: ${pending.join(', ')}`));
    const source = await prisma.discoverySource.findUnique({ where: { key: PROD_SHADOW_DISCOVERY_SOURCE_KEY }, select: { enabled: true, maxItemsPerRun: true, disabledReason: true } });
    checks.push(!source ? pass('CONTROLLED_SOURCE', 'No production shadow source injected yet') : source.enabled && source.maxItemsPerRun === 1 && !source.disabledReason ? pass('CONTROLLED_SOURCE', 'Exactly one controlled source is enabled with one item max') : fail('CONTROLLED_SOURCE', 'Controlled source must be enabled, unblocked and limited to one item'));
  } catch (error) {
    checks.push(fail('POSTGRESQL', message(error)));
  }

  const connection = createDiscoveryRedisConnection();
  const queues: Array<{ close(): Promise<void>; queue: Queue }> = [];
  try {
    const pong = await connection.ping();
    checks.push(pong === 'PONG' ? pass('REDIS', 'Redis/BullMQ connection') : fail('REDIS', `Unexpected ping: ${pong}`));
    const valuesByKey = await connection.mget(...killSwitches);
    checks.push(valuesByKey.every((value) => value === null) ? pass('REDIS_KILL_SWITCHES', 'No editorial Redis kill switch is active') : fail('REDIS_KILL_SWITCHES', `Active: ${killSwitches.filter((_, index) => valuesByKey[index] !== null).join(', ')}`));
    const options = connection as unknown as ConnectionOptions;
    const primaryQueues = [createDiscoveryQueues(options).discoveryQueue, createDocumentQueues(options).documentQueue, createEditorialShadowQueues(options).editorialQueue, createEditorialBriefQueues(options).briefQueue, createEditorialDraftQueues(options).draftQueue, createEditorialVerificationQueues(options).verificationQueue];
    for (const queue of primaryQueues) queues.push({ queue, close: () => queue.close() });
    for (const queue of primaryQueues) {
      const [workers, counts] = await Promise.all([queue.getWorkers(), queue.getJobCounts('failed')]);
      checks.push(workers.length > 0 ? pass(`WORKER:${queue.name}`, `${workers.length} worker(s); failed=${counts.failed ?? 0}`) : fail(`WORKER:${queue.name}`, 'No BullMQ worker registered'));
    }
  } catch (error) {
    checks.push(fail('REDIS', message(error)));
  } finally {
    await Promise.all(queues.map((item) => item.close().catch(() => undefined)));
    connection.disconnect();
  }

  const flags = [
    ['DISCOVERY', resolveDiscoveryRuntimeFlags(values)], ['DOCUMENT_PIPELINE', resolveDocumentPipelineRuntimeFlags(values)], ['EDITORIAL_SHADOW', resolveEditorialShadowRuntimeFlags(values)], ['EDITORIAL_BRIEF', resolveEditorialBriefRuntimeFlags(values)], ['EDITORIAL_DRAFT', resolveEditorialDraftRuntimeFlags(values)], ['EDITORIAL_VERIFICATION', resolveEditorialVerificationRuntimeFlags(values)],
  ] as const;
  for (const [name, flag] of flags) checks.push(flag.enabled && !flag.killSwitch ? pass(`FLAG:${name}`, 'enabled with environment kill switch off') : fail(`FLAG:${name}`, `enabled=${flag.enabled}, killSwitch=${flag.killSwitch}`));
  return { generatedAt: new Date().toISOString(), productionShadowOnly: true, checks, go: checks.every((check) => check.level === 'PASS') };
}

function pass(code: string, detail: string): Check { return { code, level: 'PASS', detail }; }
function fail(code: string, detail: string): Check { return { code, level: 'FAIL', detail }; }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  collectProdShadowReadiness().then((report) => {
    console.log(JSON.stringify(report, null, 2));
    if (!report.go) process.exitCode = 1;
  }).catch((error) => { console.error(message(error)); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}

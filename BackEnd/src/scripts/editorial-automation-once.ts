import { type ConnectionOptions } from 'bullmq';
import { fileURLToPath } from 'node:url';
import { createDiscoveryQueues } from '../lib/discovery/discovery-queue.js';
import { createDocumentQueues } from '../lib/document-corpus/document-queue.js';
import { createEditorialShadowQueues } from '../lib/editorial-shadow/editorial-queue.js';
import { createEditorialBriefQueues } from '../lib/editorial-brief/brief-queue.js';
import { createEditorialDraftQueues } from '../lib/editorial-draft/draft-queue.js';
import { createEditorialVerificationQueues, createEditorialVerificationRedisConnection } from '../lib/editorial-verification/verification-queue.js';
import { isRedisKillSwitchActive, type DiscoveryRedis } from '../lib/discovery/redis-lock.js';
import { EDITORIAL_AUTOMATION_REDIS_KILL_SWITCH_KEY, resolveEditorialVerificationRuntimeFlags } from '../lib/editorial-verification/runtime-flags.js';
import { runEditorialAutomationTick } from '../workers/editorial-automation.worker.js';

const CONFIRMATION = 'EPION_EDITORIAL_AUTOMATION';

export function assertEditorialAutomationOnceSafety(
  argumentsList: string[],
  flags = resolveEditorialVerificationRuntimeFlags(),
): void {
  if (!argumentsList.includes(`--confirm=${CONFIRMATION}`)) throw new Error(`Confirmation required: --confirm=${CONFIRMATION}`);
  if (!flags.automationEnabled || flags.automationKillSwitch) throw new Error('Editorial automation is disabled or kill-switched');
}

async function main() {
  const flags = resolveEditorialVerificationRuntimeFlags();
  assertEditorialAutomationOnceSafety(process.argv, flags);
  const waitArgument = process.argv.find((value) => value.startsWith('--wait-ms='));
  const waitMs = Math.max(0, Math.min(15 * 60_000, Number(waitArgument?.slice('--wait-ms='.length) || 60_000)));
  if (!Number.isFinite(waitMs)) throw new Error('--wait-ms must be a valid number');
  const connection = createEditorialVerificationRedisConnection();
  if (await isRedisKillSwitchActive(connection as unknown as DiscoveryRedis, EDITORIAL_AUTOMATION_REDIS_KILL_SWITCH_KEY)) throw new Error('Editorial automation Redis kill switch is active');
  const options = connection as unknown as ConnectionOptions;
  const discovery = createDiscoveryQueues(options); const documents = createDocumentQueues(options); const editorial = createEditorialShadowQueues(options); const briefs = createEditorialBriefQueues(options); const drafts = createEditorialDraftQueues(options); const verification = createEditorialVerificationQueues(options);
  const queues = { discoveryQueue: discovery.discoveryQueue, documentQueue: documents.documentQueue, editorialQueue: editorial.editorialQueue, briefQueue: briefs.briefQueue, draftQueue: drafts.draftQueue, verificationQueue: verification.verificationQueue };
  try {
    let report = await runEditorialAutomationTick(flags, queues);
    if (waitMs > 0 && report.documentsQueuedForIndexing > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      report = await runEditorialAutomationTick(flags, queues);
    }
    process.stdout.write(`${JSON.stringify({ mode: 'one-shot', waitMs, ...report }, null, 2)}\n`);
  } finally {
    await Promise.all([discovery.discoveryQueue.close(), documents.documentQueue.close(), editorial.editorialQueue.close(), briefs.briefQueue.close(), drafts.draftQueue.close(), verification.verificationQueue.close(), connection.quit()]);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exit(1); });
}

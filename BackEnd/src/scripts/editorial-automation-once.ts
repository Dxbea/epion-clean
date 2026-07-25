import { type ConnectionOptions } from 'bullmq';
import { fileURLToPath } from 'node:url';
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/db.js';
import { createDiscoveryQueues } from '../lib/discovery/discovery-queue.js';
import { createDocumentQueues } from '../lib/document-corpus/document-queue.js';
import { createEditorialShadowQueues } from '../lib/editorial-shadow/editorial-queue.js';
import { createEditorialBriefQueues } from '../lib/editorial-brief/brief-queue.js';
import { createEditorialDraftQueues } from '../lib/editorial-draft/draft-queue.js';
import { createEditorialVerificationQueues, createEditorialVerificationRedisConnection } from '../lib/editorial-verification/verification-queue.js';
import { isRedisKillSwitchActive, type DiscoveryRedis } from '../lib/discovery/redis-lock.js';
import { EDITORIAL_AUTOMATION_REDIS_KILL_SWITCH_KEY, EDITORIAL_AUTOPUBLISH_REDIS_KILL_SWITCH_KEY, resolveEditorialVerificationRuntimeFlags } from '../lib/editorial-verification/runtime-flags.js';
import {
  runEditorialAutomationTick,
  type EditorialAutomationReport,
} from '../workers/editorial-automation.worker.js';

const CONFIRMATION = 'EPION_EDITORIAL_AUTOMATION';

export function assertEditorialAutomationOnceSafety(
  argumentsList: string[],
  flags = resolveEditorialVerificationRuntimeFlags(),
): void {
  if (!argumentsList.includes(`--confirm=${CONFIRMATION}`)) throw new Error(`Confirmation required: --confirm=${CONFIRMATION}`);
  if (!flags.automationEnabled || flags.automationKillSwitch) throw new Error('Editorial automation is disabled or kill-switched');
}

export interface EditorialAutomationOneShotResult extends EditorialAutomationReport {
  automationPasses: number;
}

export async function runEditorialAutomationPasses(
  runTick: () => Promise<EditorialAutomationReport>,
  options: {
    waitMs: number;
    pollMs?: number;
    sleep?: (milliseconds: number) => Promise<void>;
    now?: () => number;
  },
): Promise<EditorialAutomationOneShotResult> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((milliseconds) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const startedAt = now();
  const deadline = startedAt + Math.max(0, options.waitMs);
  const pollMs = Math.max(250, Math.min(30_000, options.pollMs ?? 10_000));
  const initial = await runTick();
  let current = initial;
  let passes = 1;
  const dispatched = {
    clusters: initial.clusters,
    briefs: initial.briefs,
    drafts: initial.drafts,
    verifications: initial.verifications,
  };

  while (options.waitMs > 0 && automationPassNeedsFollowUp(current) && now() < deadline) {
    await sleep(Math.min(pollMs, Math.max(1, deadline - now())));
    current = await runTick();
    passes++;
    dispatched.clusters = Math.max(dispatched.clusters, current.clusters);
    dispatched.briefs = Math.max(dispatched.briefs, current.briefs);
    dispatched.drafts = Math.max(dispatched.drafts, current.drafts);
    dispatched.verifications = Math.max(dispatched.verifications, current.verifications);
  }

  return {
    ...current,
    ...dispatched,
    documentsIndexedThisRun: Math.max(
      current.documentsIndexedThisRun,
      current.documentsAlreadyIndexed - initial.documentsAlreadyIndexed,
    ),
    automationPasses: passes,
  };
}

function automationPassNeedsFollowUp(report: EditorialAutomationReport): boolean {
  return report.documentsQueuedForIndexing > 0
    || report.clusters > 0
    || report.briefs > 0
    || report.drafts > 0
    || report.verifications > 0
    || Boolean(report.existingRun && report.existingRun.status !== 'COMPLETED');
}

async function main() {
  const flags = resolveEditorialVerificationRuntimeFlags();
  assertEditorialAutomationOnceSafety(process.argv, flags);
  const waitArgument = process.argv.find((value) => value.startsWith('--wait-ms='));
  const lookbackArgument = process.argv.find((value) => value.startsWith('--indexed-lookback-hours='));
  const noPublish = process.argv.includes('--no-publish');
  const waitMs = Math.max(0, Math.min(15 * 60_000, Number(waitArgument?.slice('--wait-ms='.length) || 60_000)));
  const indexedLookbackHours = Math.max(1, Math.min(168, Number(lookbackArgument?.slice('--indexed-lookback-hours='.length) || flags.automationIndexedLookbackHours)));
  if (!Number.isFinite(waitMs)) throw new Error('--wait-ms must be a valid number');
  if (!Number.isFinite(indexedLookbackHours)) throw new Error('--indexed-lookback-hours must be a valid number');
  const connection = createEditorialVerificationRedisConnection();
  if (await isRedisKillSwitchActive(connection as unknown as DiscoveryRedis, EDITORIAL_AUTOMATION_REDIS_KILL_SWITCH_KEY)) {
    await connection.quit();
    await prisma.$disconnect();
    await Sentry.close(2_000);
    throw new Error('Editorial automation Redis kill switch is active');
  }
  if (noPublish && !await isRedisKillSwitchActive(connection as unknown as DiscoveryRedis, EDITORIAL_AUTOPUBLISH_REDIS_KILL_SWITCH_KEY)) {
    await connection.quit();
    await prisma.$disconnect();
    await Sentry.close(2_000);
    throw new Error('--no-publish requires the editorial autopublish Redis kill switch to be active');
  }
  const options = connection as unknown as ConnectionOptions;
  const discovery = createDiscoveryQueues(options); const documents = createDocumentQueues(options); const editorial = createEditorialShadowQueues(options); const briefs = createEditorialBriefQueues(options); const drafts = createEditorialDraftQueues(options); const verification = createEditorialVerificationQueues(options);
  const queues = { discoveryQueue: discovery.discoveryQueue, documentQueue: documents.documentQueue, editorialQueue: editorial.editorialQueue, briefQueue: briefs.briefQueue, draftQueue: drafts.draftQueue, verificationQueue: verification.verificationQueue };
  try {
    const report = await runEditorialAutomationPasses(
      () => runEditorialAutomationTick(flags, queues, new Date(), { indexedLookbackHours }),
      { waitMs },
    );
    process.stdout.write(`${JSON.stringify({ mode: 'one-shot', waitMs, indexedLookbackHours, noPublish, autopublishBlockedReason: noPublish ? 'KILL_SWITCH' : null, ...report }, null, 2)}\n`);
  } finally {
    await Promise.all([discovery.discoveryQueue.close(), documents.documentQueue.close(), editorial.editorialQueue.close(), briefs.briefQueue.close(), drafts.draftQueue.close(), verification.verificationQueue.close(), connection.quit(), prisma.$disconnect(), Sentry.close(2_000)]);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => {
    // Last-resort CLI boundary: resources are awaited above; this only handles third-party handles that remain open.
    setTimeout(() => process.exit(0), 0);
  }).catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exit(1); });
}

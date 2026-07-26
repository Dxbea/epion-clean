import { fileURLToPath } from 'node:url';
import type { ConnectionOptions, Queue } from 'bullmq';
import { prisma } from '../lib/db.js';
import {
  evaluateEditorialOperationalReadiness,
  isOperationalKillSwitchActiveValue,
  normalizePublicApiBaseUrl,
  type EditorialOperationalReadinessEvidence,
  type EditorialOperationalReadinessReport,
} from '../lib/editorial-automation/operational-readiness.js';
import { createDiscoveryQueues, createDiscoveryRedisConnection } from '../lib/discovery/discovery-queue.js';
import { DISCOVERY_REDIS_KILL_SWITCH_KEY } from '../lib/discovery/runtime-flags.js';
import { createDocumentQueues } from '../lib/document-corpus/document-queue.js';
import { DOCUMENT_PIPELINE_REDIS_KILL_SWITCH_KEY } from '../lib/document-corpus/runtime-flags.js';
import { createEditorialShadowQueues } from '../lib/editorial-shadow/editorial-queue.js';
import { EDITORIAL_SHADOW_REDIS_KILL_SWITCH_KEY } from '../lib/editorial-shadow/runtime-flags.js';
import { createEditorialBriefQueues } from '../lib/editorial-brief/brief-queue.js';
import { EDITORIAL_BRIEF_REDIS_KILL_SWITCH_KEY } from '../lib/editorial-brief/runtime-flags.js';
import { createEditorialDraftQueues } from '../lib/editorial-draft/draft-queue.js';
import { EDITORIAL_DRAFT_REDIS_KILL_SWITCH_KEY } from '../lib/editorial-draft/runtime-flags.js';
import { createEditorialVerificationQueues } from '../lib/editorial-verification/verification-queue.js';
import {
  EDITORIAL_AUTOMATION_REDIS_KILL_SWITCH_KEY,
  EDITORIAL_AUTOPUBLISH_REDIS_KILL_SWITCH_KEY,
  EDITORIAL_VERIFICATION_REDIS_KILL_SWITCH_KEY,
  resolveEditorialVerificationRuntimeFlags,
} from '../lib/editorial-verification/runtime-flags.js';

const KILL_SWITCH_KEYS = [
  DISCOVERY_REDIS_KILL_SWITCH_KEY,
  DOCUMENT_PIPELINE_REDIS_KILL_SWITCH_KEY,
  EDITORIAL_SHADOW_REDIS_KILL_SWITCH_KEY,
  EDITORIAL_BRIEF_REDIS_KILL_SWITCH_KEY,
  EDITORIAL_DRAFT_REDIS_KILL_SWITCH_KEY,
  EDITORIAL_VERIFICATION_REDIS_KILL_SWITCH_KEY,
  EDITORIAL_AUTOMATION_REDIS_KILL_SWITCH_KEY,
  EDITORIAL_AUTOPUBLISH_REDIS_KILL_SWITCH_KEY,
] as const;

export async function collectEditorialAutomationReadiness(
  values: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): Promise<EditorialOperationalReadinessReport> {
  let configuredSourceKeys: string[] = [];
  let systemUserId: string | null = null;
  try {
    const flags = resolveEditorialVerificationRuntimeFlags(values);
    configuredSourceKeys = flags.automationSourceKeys;
    systemUserId = flags.autoPublishSystemUserId;
  } catch (error) {
    return configurationFailure(now, error);
  }

  const evidence: EditorialOperationalReadinessEvidence = {
    database: { ok: false, detail: 'PostgreSQL was not checked' },
    redis: { ok: false, detail: 'Redis was not checked', activeKillSwitches: [] },
    publicApi: { ok: false, detail: 'Public API was not checked' },
    workers: [],
    systemUser: null,
    publicationsToday: 0,
    configuredSources: [],
    availableRadarTypes: [],
  };
  const dayStart = startOfUtcDay(now);

  try {
    await prisma.$queryRaw`SELECT 1`;
    const [systemUser, publicationsToday, sources, radars] = await Promise.all([
      systemUserId
        ? prisma.user.findUnique({ where: { id: systemUserId }, select: { id: true, role: true } })
        : null,
      prisma.editorialReviewAuditLog.count({
        where: {
          action: 'ARTICLE_PUBLISHED',
          operationKey: { startsWith: 'editorial-autopublish:' },
          createdAt: { gte: dayStart },
        },
      }),
      prisma.discoverySource.findMany({
        where: { key: { in: configuredSourceKeys } },
        select: {
          key: true,
          enabled: true,
          disabledReason: true,
          categoryId: true,
          sourceId: true,
          source: { select: { domain: true } },
        },
      }),
      prisma.discoverySource.findMany({
        where: {
          connectorType: { in: ['GDELT', 'GOOGLE_NEWS_RSS'] },
          enabled: true,
          disabledReason: null,
        },
        select: { connectorType: true },
      }),
    ]);
    evidence.database = { ok: true, detail: 'PostgreSQL connection and editorial state are readable' };
    evidence.systemUser = systemUser;
    evidence.publicationsToday = publicationsToday;
    evidence.configuredSources = sources.map((source) => ({
      key: source.key,
      enabled: source.enabled,
      disabledReason: source.disabledReason,
      categoryId: source.categoryId,
      sourceId: source.sourceId,
      sourceDomain: source.source?.domain ?? null,
    }));
    evidence.availableRadarTypes = [...new Set(radars.map((radar) => radar.connectorType))].sort();
  } catch (error) {
    evidence.database = { ok: false, detail: message(error) };
  }

  const connection = createDiscoveryRedisConnection();
  const queues: Queue[] = [];
  try {
    const pong = await connection.ping();
    const valuesByKey = await connection.mget(...KILL_SWITCH_KEYS);
    evidence.redis = {
      ok: pong === 'PONG',
      detail: pong === 'PONG' ? 'Redis/BullMQ connection' : `Unexpected ping: ${pong}`,
      activeKillSwitches: KILL_SWITCH_KEYS.filter((_, index) =>
        isOperationalKillSwitchActiveValue(valuesByKey[index])),
    };
    const options = connection as unknown as ConnectionOptions;
    queues.push(
      createDiscoveryQueues(options).discoveryQueue,
      createDocumentQueues(options).documentQueue,
      createEditorialShadowQueues(options).editorialQueue,
      createEditorialBriefQueues(options).briefQueue,
      createEditorialDraftQueues(options).draftQueue,
      createEditorialVerificationQueues(options).verificationQueue,
    );
    evidence.workers = await Promise.all(queues.map(async (queue) => {
      const [workers, counts] = await Promise.all([
        queue.getWorkers(),
        queue.getJobCounts('failed'),
      ]);
      return {
        queue: queue.name,
        count: workers.length,
        failedJobs: counts.failed ?? 0,
      };
    }));
  } catch (error) {
    evidence.redis = { ok: false, detail: message(error), activeKillSwitches: [] };
  } finally {
    await Promise.all(queues.map((queue) => queue.close().catch(() => undefined)));
    await connection.quit().catch(() => undefined);
  }

  const publicApiBaseUrl = normalizePublicApiBaseUrl(values.EDITORIAL_PUBLIC_API_BASE_URL);
  if (publicApiBaseUrl) {
    try {
      const response = await fetch(`${publicApiBaseUrl}/api/healthz`, {
        method: 'GET',
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      evidence.publicApi = response.ok
        ? { ok: true, detail: `HTTP ${response.status} ${publicApiBaseUrl}/api/healthz` }
        : { ok: false, detail: `HTTP ${response.status} ${publicApiBaseUrl}/api/healthz` };
    } catch (error) {
      evidence.publicApi = { ok: false, detail: message(error) };
    }
  } else {
    evidence.publicApi = {
      ok: false,
      detail: 'EDITORIAL_PUBLIC_API_BASE_URL is missing or invalid',
    };
  }

  try {
    return evaluateEditorialOperationalReadiness(values, evidence, now);
  } catch (error) {
    return configurationFailure(now, error);
  }
}

function configurationFailure(now: Date, error: unknown): EditorialOperationalReadinessReport {
  return {
    generatedAt: now.toISOString(),
    mode: 'EDITORIAL_PRODUCTION',
    go: false,
    checks: [{ code: 'CONFIGURATION', level: 'FAIL', detail: message(error) }],
    publicationsToday: 0,
    remainingDailyPublicationQuota: 0,
  };
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  collectEditorialAutomationReadiness()
    .then((report) => {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      if (!report.go) process.exitCode = 1;
    })
    .catch((error) => {
      process.stderr.write(`${message(error)}\n`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

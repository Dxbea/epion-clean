import { fileURLToPath } from 'node:url';
import type { ConnectionOptions } from 'bullmq';
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/db.js';
import { collectEditorialPipelineDiagnostics } from '../lib/editorial-automation/pipeline-diagnostics.js';
import { runEditorialPublicationSmoke } from '../lib/editorial-automation/publication-smoke.js';
import { createDiscoveryQueues } from '../lib/discovery/discovery-queue.js';
import { createDocumentQueues } from '../lib/document-corpus/document-queue.js';
import { createEditorialShadowQueues } from '../lib/editorial-shadow/editorial-queue.js';
import { createEditorialBriefQueues } from '../lib/editorial-brief/brief-queue.js';
import { createEditorialDraftQueues } from '../lib/editorial-draft/draft-queue.js';
import {
  createEditorialVerificationQueues,
  createEditorialVerificationRedisConnection,
} from '../lib/editorial-verification/verification-queue.js';
import { resolveEditorialVerificationRuntimeFlags } from '../lib/editorial-verification/runtime-flags.js';
import {
  editorialAutomationWindow,
  runEditorialAutomationTick,
} from '../workers/editorial-automation.worker.js';
import { runEditorialAutomationPasses } from './editorial-automation-once.js';
import { collectEditorialAutomationReadiness } from './editorial-automation-readiness.js';

const CONFIRMATION = 'EPION_EDITORIAL_PUBLISH_ONE';

export function parseControlledPublicationOptions(argv: string[]) {
  if (!argv.includes(`--confirm=${CONFIRMATION}`)) {
    throw new Error(`Confirmation required: --confirm=${CONFIRMATION}`);
  }
  if (argv.includes('--no-publish')) {
    throw new Error('--no-publish is incompatible with the controlled publication command');
  }
  const waitMs = boundedInteger(argv, '--wait-ms', 15 * 60_000, 60_000, 30 * 60_000);
  const indexedLookbackHours = boundedInteger(argv, '--indexed-lookback-hours', 24, 1, 168);
  return { waitMs, indexedLookbackHours };
}

export async function runControlledEditorialPublication(
  argv: string[],
  values: NodeJS.ProcessEnv = process.env,
) {
  const options = parseControlledPublicationOptions(argv);
  const startedAt = new Date();
  const readiness = await collectEditorialAutomationReadiness(values, startedAt);
  if (!readiness.go) {
    return {
      mode: 'CONTROLLED_PUBLICATION',
      validated: false,
      outcome: 'REFUSED_UNSAFE_CONFIGURATION',
      readiness,
      automation: null,
      pipeline: null,
      smoke: null,
    };
  }

  const flags = resolveEditorialVerificationRuntimeFlags(values);
  const connection = createEditorialVerificationRedisConnection();
  const connectionOptions = connection as unknown as ConnectionOptions;
  const discovery = createDiscoveryQueues(connectionOptions);
  const documents = createDocumentQueues(connectionOptions);
  const editorial = createEditorialShadowQueues(connectionOptions);
  const briefs = createEditorialBriefQueues(connectionOptions);
  const drafts = createEditorialDraftQueues(connectionOptions);
  const verification = createEditorialVerificationQueues(connectionOptions);
  const queues = {
    discoveryQueue: discovery.discoveryQueue,
    documentQueue: documents.documentQueue,
    editorialQueue: editorial.editorialQueue,
    briefQueue: briefs.briefQueue,
    draftQueue: drafts.draftQueue,
    verificationQueue: verification.verificationQueue,
  };

  try {
    const automation = await runEditorialAutomationPasses(
      () => runEditorialAutomationTick(flags, queues, new Date(), {
        indexedLookbackHours: options.indexedLookbackHours,
      }),
      {
        waitMs: options.waitMs,
        until: (report) => report.publications > readiness.publicationsToday,
      },
    );
    const { windowStart, windowEnd } = editorialAutomationWindow(startedAt);
    const pipeline = await collectEditorialPipelineDiagnostics(prisma, { windowStart, windowEnd });
    const publicationAudits = await prisma.editorialReviewAuditLog.findMany({
      where: {
        action: 'ARTICLE_PUBLISHED',
        operationKey: { startsWith: 'editorial-autopublish:' },
        createdAt: { gte: startedAt },
      },
      orderBy: { createdAt: 'asc' },
      select: { articleId: true, createdAt: true, operationKey: true },
    });
    if (publicationAudits.length > 1) {
      throw new Error(`Controlled publication invariant violated: ${publicationAudits.length} articles were published`);
    }
    const publication = publicationAudits[0] ?? null;
    const publicApiBaseUrl = values.EDITORIAL_PUBLIC_API_BASE_URL?.trim() ?? '';
    const smoke = publication?.articleId
      ? await runEditorialPublicationSmoke(prisma, {
          articleId: publication.articleId,
          publicApiBaseUrl,
        })
      : null;
    const missingStageReasons = [
      ...(pipeline.stages.briefs === 0 ? ['BRIEFS_NOT_CREATED'] : []),
      ...(pipeline.stages.drafts === 0 ? ['DRAFTS_NOT_CREATED'] : []),
      ...(pipeline.stages.verifications === 0 ? ['VERIFICATIONS_NOT_CREATED'] : []),
      ...(publication ? [] : ['NO_ARTICLE_PUBLISHED']),
    ];
    const validated = Boolean(
      publication
      && pipeline.validated
      && smoke?.go
      && missingStageReasons.length === 0,
    );
    return {
      mode: 'CONTROLLED_PUBLICATION',
      validated,
      outcome: validated
        ? 'PUBLISHED_AND_PUBLICLY_VALIDATED'
        : publication
          ? 'PUBLISHED_BUT_SMOKE_FAILED'
          : 'NO_PUBLICATION',
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      maximumPublications: 1,
      readiness,
      automation,
      pipeline,
      publication,
      smoke,
      missingStageReasons,
      blockingReasons: publication
        ? smoke?.checks.filter((check) => check.level === 'FAIL') ?? []
        : [
            ...automation.briefBlockages,
            ...pipeline.blockingReasons,
          ],
    };
  } finally {
    await Promise.all([
      discovery.discoveryQueue.close(),
      documents.documentQueue.close(),
      editorial.editorialQueue.close(),
      briefs.briefQueue.close(),
      drafts.draftQueue.close(),
      verification.verificationQueue.close(),
      connection.quit(),
    ]);
  }
}

function boundedInteger(
  argv: string[],
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const prefix = `${name}=`;
  const raw = argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runControlledEditorialPublication(process.argv.slice(2))
    .then((report) => {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      if (!report.validated) process.exitCode = 1;
    })
    .catch((error) => {
      process.stderr.write(`${message(error)}\n`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
      await Sentry.close(2_000);
    });
}

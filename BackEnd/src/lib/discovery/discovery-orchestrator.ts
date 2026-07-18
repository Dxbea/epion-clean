import type { DiscoverySource, Prisma } from '@prisma/client';
import logger from '../logger.js';
import {
  persistDiscoveryBatch,
  type CorpusPersistenceClient,
  type CorpusUpsertResult,
} from './corpus-service.js';
import { DiscoveryMetrics } from './discovery-metrics.js';
import {
  calculateDiscoveryFailureRetry,
  calculateNextDiscoveryRun,
} from './discovery-schedule.js';
import type { DiscoveryConnectorRegistry } from './connector-registry.js';
import type {
  DiscoveryBatch,
  DiscoverySourceConfig,
} from './types.js';

const orchestrationLog = logger.child({ module: 'DiscoveryOrchestrator' });
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 5;

type DiscoverySourceDelegate = Pick<
  Prisma.TransactionClient['discoverySource'],
  'findUnique' | 'update'
>;

export interface DiscoveryOrchestratorClient extends CorpusPersistenceClient {
  discoverySource: DiscoverySourceDelegate;
}

export interface DiscoveryOrchestratorOptions {
  dryRun?: boolean;
  allowDisabled?: boolean;
  now?: Date;
  signal?: AbortSignal;
}

export interface DiscoveryRunResult {
  sourceId: string;
  connectorType: DiscoverySource['connectorType'];
  dryRun: boolean;
  candidatesDiscovered: number;
  corpusResults: CorpusUpsertResult[];
  nextRunAt: Date;
  durationMs: number;
}

export interface DiscoveryOrchestratorDependencies {
  client: DiscoveryOrchestratorClient;
  registry: DiscoveryConnectorRegistry;
  metrics?: DiscoveryMetrics;
  persistBatch?: typeof persistDiscoveryBatch;
}

export class DiscoverySourceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscoverySourceUnavailableError';
  }
}

export async function runDiscoverySource(
  dependencies: DiscoveryOrchestratorDependencies,
  discoverySourceId: string,
  options: DiscoveryOrchestratorOptions = {},
): Promise<DiscoveryRunResult> {
  const startedAtMs = Date.now();
  const now = validNow(options.now ?? new Date());
  const source = await dependencies.client.discoverySource.findUnique({
    where: { id: discoverySourceId },
  });
  if (!source) {
    throw new DiscoverySourceUnavailableError(`Discovery source not found: ${discoverySourceId}`);
  }
  if ((!source.enabled || source.disabledReason) && !(options.dryRun && options.allowDisabled)) {
    throw new DiscoverySourceUnavailableError(`Discovery source is disabled: ${source.key}`);
  }

  const sourceConfig = toSourceConfig(source);
  const connector = dependencies.registry.require(source.connectorType);
  connector.validateConfig(sourceConfig);
  const nextRunAt = calculateNextDiscoveryRun(source.schedule, source.connectorType, now);
  const metrics = dependencies.metrics;
  metrics?.increment('runsStarted');

  if (!options.dryRun) {
    await dependencies.client.discoverySource.update({
      where: { id: source.id },
      data: { lastRunAt: now },
    });
  }

  orchestrationLog.info('Discovery source run started', {
    sourceId: source.id,
    sourceKey: source.key,
    connectorType: source.connectorType,
    dryRun: options.dryRun === true,
  });

  try {
    throwIfAborted(options.signal);
    const batch = await connector.discover({ source: sourceConfig, now, signal: options.signal });
    throwIfAborted(options.signal);
    const persistBatch = dependencies.persistBatch ?? persistDiscoveryBatch;
    const corpusResults = await persistBatch(
      dependencies.client,
      sourceConfig,
      batch,
      { dryRun: options.dryRun, now },
    );
    throwIfAborted(options.signal);

    if (!options.dryRun) {
      await persistSuccessfulRun(dependencies.client, source, batch, now, nextRunAt);
    }

    const durationMs = Date.now() - startedAtMs;
    metrics?.increment('runsSucceeded');
    metrics?.increment('candidatesDiscovered', batch.candidates.length);
    metrics?.increment('documentsPersisted', corpusResults.length);
    metrics?.recordDuration(durationMs);

    orchestrationLog.info('Discovery source run completed', {
      sourceId: source.id,
      sourceKey: source.key,
      connectorType: source.connectorType,
      dryRun: options.dryRun === true,
      candidatesDiscovered: batch.candidates.length,
      corpusWrites: corpusResults.length,
      nextRunAt: nextRunAt.toISOString(),
      durationMs,
    });

    return {
      sourceId: source.id,
      connectorType: source.connectorType,
      dryRun: options.dryRun === true,
      candidatesDiscovered: batch.candidates.length,
      corpusResults,
      nextRunAt,
      durationMs,
    };
  } catch (error) {
    metrics?.increment('runsFailed');
    metrics?.recordDuration(Date.now() - startedAtMs);
    orchestrationLog.warn('Discovery source run failed', {
      sourceId: source.id,
      sourceKey: source.key,
      connectorType: source.connectorType,
      dryRun: options.dryRun === true,
      error: errorMessage(error),
    });
    throw error;
  }
}

export interface DiscoveryFailureState {
  consecutiveFailures: number;
  disabled: boolean;
  nextRunAt: Date | null;
  disabledReason: string | null;
}

export async function recordDiscoveryFailure(
  client: Pick<DiscoveryOrchestratorClient, 'discoverySource'>,
  discoverySourceId: string,
  error: unknown,
  now = new Date(),
): Promise<DiscoveryFailureState> {
  const source = await client.discoverySource.findUnique({
    where: { id: discoverySourceId },
  });
  if (!source) {
    throw new DiscoverySourceUnavailableError(`Discovery source not found: ${discoverySourceId}`);
  }

  const observedAt = validNow(now);
  const consecutiveFailures = source.consecutiveFailures + 1;
  const maxFailures = maxConsecutiveFailures(source);
  const disabled = consecutiveFailures >= maxFailures;
  const disabledReason = disabled
    ? `AUTO_DISABLED_AFTER_${consecutiveFailures}_FAILURES: ${errorMessage(error).slice(0, 400)}`
    : null;
  const nextRunAt = disabled
    ? null
    : calculateDiscoveryFailureRetry(consecutiveFailures, observedAt);

  await client.discoverySource.update({
    where: { id: source.id },
    data: {
      consecutiveFailures,
      lastRunAt: observedAt,
      nextRunAt,
      enabled: disabled ? false : source.enabled,
      disabledReason,
    },
  });

  orchestrationLog.warn('Discovery source failure state persisted', {
    sourceId: source.id,
    sourceKey: source.key,
    consecutiveFailures,
    maxFailures,
    disabled,
    nextRunAt: nextRunAt?.toISOString() ?? null,
    error: errorMessage(error),
  });

  return { consecutiveFailures, disabled, nextRunAt, disabledReason };
}

async function persistSuccessfulRun(
  client: Pick<DiscoveryOrchestratorClient, 'discoverySource'>,
  source: DiscoverySource,
  batch: DiscoveryBatch,
  now: Date,
  nextRunAt: Date,
): Promise<void> {
  await client.discoverySource.update({
    where: { id: source.id },
    data: {
      cursor: batch.nextCursor ?? source.cursor,
      etag: batch.etag ?? source.etag,
      lastModified: batch.lastModified ?? source.lastModified,
      lastRunAt: now,
      nextRunAt,
      lastSuccessAt: now,
      consecutiveFailures: 0,
      disabledReason: null,
    },
  });
}

function toSourceConfig(source: DiscoverySource): DiscoverySourceConfig {
  return {
    id: source.id,
    key: source.key,
    name: source.name,
    connectorType: source.connectorType,
    endpoint: source.endpoint,
    enabled: source.enabled,
    priority: source.priority,
    language: source.language,
    country: source.country,
    sourceId: source.sourceId,
    maxItemsPerRun: source.maxItemsPerRun,
    requestTimeoutMs: source.requestTimeoutMs,
    rateLimitPerHour: source.rateLimitPerHour,
    configuration: jsonConfiguration(source.configuration),
    cursor: source.cursor,
    etag: source.etag,
    lastModified: source.lastModified,
    accessPolicy: source.accessPolicy,
    storagePolicy: source.storagePolicy,
  };
}

function jsonConfiguration(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function maxConsecutiveFailures(source: DiscoverySource): number {
  const configuration = jsonConfiguration(source.configuration);
  const configured = configuration?.maxConsecutiveFailures;
  return Number.isInteger(configured) && (configured as number) >= 1 && (configured as number) <= 100
    ? configured as number
    : DEFAULT_MAX_CONSECUTIVE_FAILURES;
}

function validNow(value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('Discovery run time must be a valid Date');
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('Discovery run aborted');
}

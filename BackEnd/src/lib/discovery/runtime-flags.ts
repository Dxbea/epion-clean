export const DISCOVERY_REDIS_KILL_SWITCH_KEY = 'epion:discovery:kill-switch';

export interface DiscoveryRuntimeFlags {
  enabled: boolean;
  schedulerEnabled: boolean;
  killSwitch: boolean;
  workerConcurrency: number;
  schedulerPollMs: number;
  schedulerLockTtlMs: number;
  sourceLockTtlMs: number;
}

export function resolveDiscoveryRuntimeFlags(
  values: NodeJS.ProcessEnv = process.env,
): DiscoveryRuntimeFlags {
  return {
    enabled: booleanFlag(values.DISCOVERY_ENABLED, false, 'DISCOVERY_ENABLED'),
    schedulerEnabled: booleanFlag(
      values.DISCOVERY_SCHEDULER_ENABLED,
      false,
      'DISCOVERY_SCHEDULER_ENABLED',
    ),
    killSwitch: booleanFlag(
      values.DISCOVERY_KILL_SWITCH,
      true,
      'DISCOVERY_KILL_SWITCH',
    ),
    workerConcurrency: integerFlag(
      values.DISCOVERY_WORKER_CONCURRENCY,
      1,
      1,
      10,
      'DISCOVERY_WORKER_CONCURRENCY',
    ),
    schedulerPollMs: integerFlag(
      values.DISCOVERY_SCHEDULER_POLL_MS,
      60_000,
      10_000,
      15 * 60_000,
      'DISCOVERY_SCHEDULER_POLL_MS',
    ),
    schedulerLockTtlMs: integerFlag(
      values.DISCOVERY_SCHEDULER_LOCK_TTL_MS,
      55_000,
      5_000,
      15 * 60_000,
      'DISCOVERY_SCHEDULER_LOCK_TTL_MS',
    ),
    sourceLockTtlMs: integerFlag(
      values.DISCOVERY_SOURCE_LOCK_TTL_MS,
      15 * 60_000,
      30_000,
      60 * 60_000,
      'DISCOVERY_SOURCE_LOCK_TTL_MS',
    ),
  };
}

function booleanFlag(raw: string | undefined, fallback: boolean, name: string): boolean {
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be "true" or "false"`);
}

function integerFlag(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export const EDITORIAL_SHADOW_REDIS_KILL_SWITCH_KEY = 'epion:editorial-shadow:kill-switch';

export interface EditorialShadowRuntimeFlags {
  enabled: boolean;
  killSwitch: boolean;
  workerConcurrency: number;
  runLockTtlMs: number;
  pausedJobDelayMs: number;
}

export function resolveEditorialShadowRuntimeFlags(
  values: NodeJS.ProcessEnv = process.env,
): EditorialShadowRuntimeFlags {
  return {
    enabled: booleanFlag(values.EDITORIAL_SHADOW_ENABLED, false, 'EDITORIAL_SHADOW_ENABLED'),
    killSwitch: booleanFlag(
      values.EDITORIAL_SHADOW_KILL_SWITCH,
      true,
      'EDITORIAL_SHADOW_KILL_SWITCH',
    ),
    workerConcurrency: integerFlag(
      values.EDITORIAL_SHADOW_WORKER_CONCURRENCY,
      1,
      1,
      4,
      'EDITORIAL_SHADOW_WORKER_CONCURRENCY',
    ),
    runLockTtlMs: integerFlag(
      values.EDITORIAL_SHADOW_RUN_LOCK_TTL_MS,
      20 * 60_000,
      60_000,
      60 * 60_000,
      'EDITORIAL_SHADOW_RUN_LOCK_TTL_MS',
    ),
    pausedJobDelayMs: integerFlag(
      values.EDITORIAL_SHADOW_PAUSED_JOB_DELAY_MS,
      60_000,
      10_000,
      15 * 60_000,
      'EDITORIAL_SHADOW_PAUSED_JOB_DELAY_MS',
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

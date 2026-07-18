export const EDITORIAL_BRIEF_REDIS_KILL_SWITCH_KEY = 'epion:editorial-brief:kill-switch';

export interface EditorialBriefRuntimeFlags {
  enabled: boolean;
  killSwitch: boolean;
  workerConcurrency: number;
  runLockTtlMs: number;
  pausedJobDelayMs: number;
}

export function resolveEditorialBriefRuntimeFlags(
  values: NodeJS.ProcessEnv = process.env,
): EditorialBriefRuntimeFlags {
  return {
    enabled: booleanFlag(values.EDITORIAL_BRIEF_ENABLED, false, 'EDITORIAL_BRIEF_ENABLED'),
    killSwitch: booleanFlag(values.EDITORIAL_BRIEF_KILL_SWITCH, true, 'EDITORIAL_BRIEF_KILL_SWITCH'),
    workerConcurrency: integerFlag(values.EDITORIAL_BRIEF_WORKER_CONCURRENCY, 1, 1, 2, 'EDITORIAL_BRIEF_WORKER_CONCURRENCY'),
    runLockTtlMs: integerFlag(values.EDITORIAL_BRIEF_RUN_LOCK_TTL_MS, 20 * 60_000, 60_000, 60 * 60_000, 'EDITORIAL_BRIEF_RUN_LOCK_TTL_MS'),
    pausedJobDelayMs: integerFlag(values.EDITORIAL_BRIEF_PAUSED_JOB_DELAY_MS, 60_000, 10_000, 15 * 60_000, 'EDITORIAL_BRIEF_PAUSED_JOB_DELAY_MS'),
  };
}

function booleanFlag(raw: string | undefined, fallback: boolean, name: string): boolean {
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be "true" or "false"`);
}

function integerFlag(raw: string | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

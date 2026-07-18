export const EDITORIAL_DRAFT_REDIS_KILL_SWITCH_KEY = 'epion:editorial-draft:kill-switch';

export interface EditorialDraftRuntimeFlags {
  enabled: boolean;
  killSwitch: boolean;
  workerConcurrency: number;
  runLockTtlMs: number;
  pausedJobDelayMs: number;
}

export function resolveEditorialDraftRuntimeFlags(values: NodeJS.ProcessEnv = process.env): EditorialDraftRuntimeFlags {
  return {
    enabled: booleanFlag(values.EDITORIAL_DRAFT_ENABLED, false, 'EDITORIAL_DRAFT_ENABLED'),
    killSwitch: booleanFlag(values.EDITORIAL_DRAFT_KILL_SWITCH, true, 'EDITORIAL_DRAFT_KILL_SWITCH'),
    workerConcurrency: integerFlag(values.EDITORIAL_DRAFT_WORKER_CONCURRENCY, 1, 1, 2, 'EDITORIAL_DRAFT_WORKER_CONCURRENCY'),
    runLockTtlMs: integerFlag(values.EDITORIAL_DRAFT_RUN_LOCK_TTL_MS, 25 * 60_000, 60_000, 60 * 60_000, 'EDITORIAL_DRAFT_RUN_LOCK_TTL_MS'),
    pausedJobDelayMs: integerFlag(values.EDITORIAL_DRAFT_PAUSED_JOB_DELAY_MS, 60_000, 10_000, 15 * 60_000, 'EDITORIAL_DRAFT_PAUSED_JOB_DELAY_MS'),
  };
}

function booleanFlag(raw: string | undefined, fallback: boolean, name: string): boolean {
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be "true" or "false"`);
}

function integerFlag(raw: string | undefined, fallback: number, min: number, max: number, name: string): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}

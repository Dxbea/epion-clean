export const EDITORIAL_VERIFICATION_REDIS_KILL_SWITCH_KEY = 'epion:editorial-verification:kill-switch';

export interface EditorialVerificationRuntimeFlags {
  enabled: boolean;
  killSwitch: boolean;
  workerConcurrency: number;
  runLockTtlMs: number;
  pausedJobDelayMs: number;
  reconciliationIntervalMs: number;
  maxVerificationsPerDay: number;
  maxSerperRequestsPerDay: number;
  maxMistralRequestsPerDay: number;
  maxOpenAIRequestsPerDay: number;
  maxEstimatedCostMicrosPerDay: number;
  serperEstimatedCostMicros: number;
  mistralEstimatedCostMicros: number;
  openAIEstimatedCostMicros: number;
}

export function resolveEditorialVerificationRuntimeFlags(
  values: NodeJS.ProcessEnv = process.env,
): EditorialVerificationRuntimeFlags {
  return {
    enabled: booleanFlag(values.EDITORIAL_VERIFICATION_WORKER_ENABLED, false, 'EDITORIAL_VERIFICATION_WORKER_ENABLED'),
    killSwitch: booleanFlag(values.EDITORIAL_VERIFICATION_KILL_SWITCH, true, 'EDITORIAL_VERIFICATION_KILL_SWITCH'),
    workerConcurrency: integerFlag(values.EDITORIAL_VERIFICATION_WORKER_CONCURRENCY, 1, 1, 3, 'EDITORIAL_VERIFICATION_WORKER_CONCURRENCY'),
    runLockTtlMs: integerFlag(values.EDITORIAL_VERIFICATION_LOCK_TTL_MS, 30 * 60_000, 60_000, 2 * 60 * 60_000, 'EDITORIAL_VERIFICATION_LOCK_TTL_MS'),
    pausedJobDelayMs: integerFlag(values.EDITORIAL_VERIFICATION_PAUSED_JOB_DELAY_MS, 60_000, 10_000, 15 * 60_000, 'EDITORIAL_VERIFICATION_PAUSED_JOB_DELAY_MS'),
    reconciliationIntervalMs: integerFlag(values.EDITORIAL_VERIFICATION_RECONCILIATION_INTERVAL_MS, 5 * 60_000, 60_000, 60 * 60_000, 'EDITORIAL_VERIFICATION_RECONCILIATION_INTERVAL_MS'),
    maxVerificationsPerDay: integerFlag(values.EDITORIAL_VERIFICATION_MAX_DAILY_RUNS, 20, 1, 10_000, 'EDITORIAL_VERIFICATION_MAX_DAILY_RUNS'),
    maxSerperRequestsPerDay: integerFlag(values.EDITORIAL_VERIFICATION_MAX_DAILY_SERPER, 100, 0, 100_000, 'EDITORIAL_VERIFICATION_MAX_DAILY_SERPER'),
    maxMistralRequestsPerDay: integerFlag(values.EDITORIAL_VERIFICATION_MAX_DAILY_MISTRAL, 25, 0, 100_000, 'EDITORIAL_VERIFICATION_MAX_DAILY_MISTRAL'),
    maxOpenAIRequestsPerDay: integerFlag(values.EDITORIAL_VERIFICATION_MAX_DAILY_OPENAI, 200, 0, 100_000, 'EDITORIAL_VERIFICATION_MAX_DAILY_OPENAI'),
    maxEstimatedCostMicrosPerDay: integerFlag(values.EDITORIAL_VERIFICATION_MAX_DAILY_COST_MICROS, 5_000_000, 0, 2_000_000_000, 'EDITORIAL_VERIFICATION_MAX_DAILY_COST_MICROS'),
    serperEstimatedCostMicros: integerFlag(values.EDITORIAL_VERIFICATION_SERPER_COST_MICROS, 1_000, 0, 10_000_000, 'EDITORIAL_VERIFICATION_SERPER_COST_MICROS'),
    mistralEstimatedCostMicros: integerFlag(values.EDITORIAL_VERIFICATION_MISTRAL_COST_MICROS, 20_000, 0, 10_000_000, 'EDITORIAL_VERIFICATION_MISTRAL_COST_MICROS'),
    openAIEstimatedCostMicros: integerFlag(values.EDITORIAL_VERIFICATION_OPENAI_COST_MICROS, 15_000, 0, 10_000_000, 'EDITORIAL_VERIFICATION_OPENAI_COST_MICROS'),
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
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

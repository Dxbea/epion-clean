export const DOCUMENT_PIPELINE_REDIS_KILL_SWITCH_KEY = 'epion:document-corpus:kill-switch';

export interface DocumentPipelineRuntimeFlags {
  enabled: boolean;
  killSwitch: boolean;
  workerConcurrency: number;
  documentLockTtlMs: number;
  pausedJobDelayMs: number;
}

export function resolveDocumentPipelineRuntimeFlags(
  values: NodeJS.ProcessEnv = process.env,
): DocumentPipelineRuntimeFlags {
  return {
    enabled: booleanFlag(
      values.DOCUMENT_PIPELINE_ENABLED,
      false,
      'DOCUMENT_PIPELINE_ENABLED',
    ),
    killSwitch: booleanFlag(
      values.DOCUMENT_PIPELINE_KILL_SWITCH,
      true,
      'DOCUMENT_PIPELINE_KILL_SWITCH',
    ),
    workerConcurrency: integerFlag(
      values.DOCUMENT_PIPELINE_WORKER_CONCURRENCY,
      1,
      1,
      10,
      'DOCUMENT_PIPELINE_WORKER_CONCURRENCY',
    ),
    documentLockTtlMs: integerFlag(
      values.DOCUMENT_PIPELINE_LOCK_TTL_MS,
      15 * 60_000,
      30_000,
      60 * 60_000,
      'DOCUMENT_PIPELINE_LOCK_TTL_MS',
    ),
    pausedJobDelayMs: integerFlag(
      values.DOCUMENT_PIPELINE_PAUSED_JOB_DELAY_MS,
      60_000,
      10_000,
      15 * 60_000,
      'DOCUMENT_PIPELINE_PAUSED_JOB_DELAY_MS',
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

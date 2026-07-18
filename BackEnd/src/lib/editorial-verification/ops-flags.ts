export interface EditorialShadowOpsFlags {
  calibrationEnabled: boolean;
  mutationsEnabled: boolean;
  killSwitch: boolean;
  budgetWarningRatio: number;
  failClosedWarningRatio: number;
  pendingDocumentsWarningCount: number;
  queueBacklogWarningCount: number;
  oldestJobWarningMs: number;
}

export function resolveEditorialShadowOpsFlags(values: NodeJS.ProcessEnv = process.env): EditorialShadowOpsFlags {
  return {
    calibrationEnabled: booleanFlag(values.EDITORIAL_SHADOW_CALIBRATION_ENABLED, false, 'EDITORIAL_SHADOW_CALIBRATION_ENABLED'),
    mutationsEnabled: booleanFlag(values.EDITORIAL_SHADOW_OPS_MUTATIONS_ENABLED, false, 'EDITORIAL_SHADOW_OPS_MUTATIONS_ENABLED'),
    killSwitch: booleanFlag(values.EDITORIAL_SHADOW_OPS_KILL_SWITCH, true, 'EDITORIAL_SHADOW_OPS_KILL_SWITCH'),
    budgetWarningRatio: ratioFlag(values.EDITORIAL_SHADOW_BUDGET_WARNING_RATIO, 0.8, 'EDITORIAL_SHADOW_BUDGET_WARNING_RATIO'),
    failClosedWarningRatio: ratioFlag(values.EDITORIAL_SHADOW_FAIL_CLOSED_WARNING_RATIO, 0.4, 'EDITORIAL_SHADOW_FAIL_CLOSED_WARNING_RATIO'),
    pendingDocumentsWarningCount: integerFlag(values.EDITORIAL_SHADOW_PENDING_DOCUMENTS_WARNING, 25, 'EDITORIAL_SHADOW_PENDING_DOCUMENTS_WARNING'),
    queueBacklogWarningCount: integerFlag(values.EDITORIAL_SHADOW_QUEUE_BACKLOG_WARNING, 20, 'EDITORIAL_SHADOW_QUEUE_BACKLOG_WARNING'),
    oldestJobWarningMs: integerFlag(values.EDITORIAL_SHADOW_OLDEST_JOB_WARNING_MS, 30 * 60_000, 'EDITORIAL_SHADOW_OLDEST_JOB_WARNING_MS'),
  };
}

function booleanFlag(raw: string | undefined, fallback: boolean, name: string): boolean {
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be "true" or "false"`);
}

function ratioFlag(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 1) throw new Error(`${name} must be greater than 0 and at most 1`);
  return value;
}

function integerFlag(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 86_400_000) throw new Error(`${name} must be a positive bounded integer`);
  return value;
}

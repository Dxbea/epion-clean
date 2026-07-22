export type EditorialValidationMode = 'human_review' | 'quality_gate';

export const EDITORIAL_VALIDATION_MODE_ENV = 'EDITORIAL_VALIDATION_MODE';

export function resolveEditorialValidationMode(values: NodeJS.ProcessEnv = process.env): EditorialValidationMode {
  const raw = values[EDITORIAL_VALIDATION_MODE_ENV]?.trim().toLowerCase();
  if (!raw || raw === 'human_review') return 'human_review';
  if (raw === 'quality_gate') return 'quality_gate';
  throw new Error(`${EDITORIAL_VALIDATION_MODE_ENV} must be "human_review" or "quality_gate"`);
}

export function isQualityGateValidationMode(values: NodeJS.ProcessEnv = process.env): boolean {
  return resolveEditorialValidationMode(values) === 'quality_gate';
}

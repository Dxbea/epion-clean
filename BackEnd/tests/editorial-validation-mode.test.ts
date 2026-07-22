import { describe, expect, it } from 'vitest';
import { resolveEditorialValidationMode } from '../src/lib/editorial-draft/validation-mode.js';

describe('editorial validation mode', () => {
  it('keeps human review as the compatibility default', () => {
    expect(resolveEditorialValidationMode({})).toBe('human_review');
  });

  it('accepts the explicit quality-gate mode and rejects unknown values', () => {
    expect(resolveEditorialValidationMode({ EDITORIAL_VALIDATION_MODE: 'quality_gate' })).toBe('quality_gate');
    expect(() => resolveEditorialValidationMode({ EDITORIAL_VALIDATION_MODE: 'anything_else' })).toThrow('EDITORIAL_VALIDATION_MODE');
  });
});

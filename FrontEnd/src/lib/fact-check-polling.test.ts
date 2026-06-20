import { describe, expect, it } from 'vitest';
import { getFactCheckFailureMessage, isFactCheckFailedPollResponse } from './fact-check-polling';

describe('fact-check polling helpers', () => {
  it('detects the legacy failed polling status', () => {
    expect(isFactCheckFailedPollResponse({ status: 'failed' })).toBe(true);
  });

  it('detects the terminal FAILED fact-check status', () => {
    expect(isFactCheckFailedPollResponse({ factCheckStatus: 'FAILED' })).toBe(true);
  });

  it('prefers factCheckError over the legacy error field', () => {
    expect(getFactCheckFailureMessage({
      factCheckError: 'SOURCE_ENRICHMENT_DISPATCH_FAILED',
      error: 'Unknown error',
    })).toBe('SOURCE_ENRICHMENT_DISPATCH_FAILED');
  });
});

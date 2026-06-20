import { describe, expect, it } from 'vitest';
import { isCsrfExemptRequest } from '../src/lib/csrf.js';

describe('CSRF exemptions', () => {
  it('exempts only public article view registration mutations', () => {
    expect(isCsrfExemptRequest('POST', '/articles/article-1/view')).toBe(true);
    expect(isCsrfExemptRequest('post', '/articles/slug-with-dashes/view')).toBe(true);

    expect(isCsrfExemptRequest('DELETE', '/articles/article-1/view')).toBe(false);
    expect(isCsrfExemptRequest('POST', '/articles/article-1')).toBe(false);
    expect(isCsrfExemptRequest('POST', '/ai/summarize')).toBe(false);
    expect(isCsrfExemptRequest('POST', '/ai/fact-check')).toBe(false);
  });

  it('keeps explicit auth compatibility exemptions', () => {
    expect(isCsrfExemptRequest('POST', '/auth/verify-invite')).toBe(true);
  });
});

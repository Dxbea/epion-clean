import { describe, expect, it } from 'vitest';

import { DEFAULT_AUTHENTICATED_DESTINATION, sanitizePostAuthRedirect } from './auth-navigation';

describe('auth navigation helpers', () => {
  it('falls back safely for stale auth-only destinations', () => {
    expect(sanitizePostAuthRedirect('/verify-email')).toBe(DEFAULT_AUTHENTICATED_DESTINATION);
    expect(sanitizePostAuthRedirect('/login')).toBe(DEFAULT_AUTHENTICATED_DESTINATION);
    expect(sanitizePostAuthRedirect('/signup')).toBe(DEFAULT_AUTHENTICATED_DESTINATION);
    expect(sanitizePostAuthRedirect('/forgot-password')).toBe(DEFAULT_AUTHENTICATED_DESTINATION);
    expect(sanitizePostAuthRedirect('/reset-password')).toBe(DEFAULT_AUTHENTICATED_DESTINATION);
  });

  it('keeps normal same-origin destinations', () => {
    expect(sanitizePostAuthRedirect('/settings#account')).toBe('/settings#account');
    expect(sanitizePostAuthRedirect('/news?tab=saved')).toBe('/news?tab=saved');
  });

  it('rejects cross-origin destinations', () => {
    expect(sanitizePostAuthRedirect('https://example.com/verify-email')).toBe(DEFAULT_AUTHENTICATED_DESTINATION);
  });
});

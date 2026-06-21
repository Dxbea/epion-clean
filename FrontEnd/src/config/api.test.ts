import { describe, expect, it } from 'vitest';

import { resolveApiBase } from './api';

describe('resolveApiBase', () => {
  it('uses localhost only outside production when VITE_API_URL is absent', () => {
    expect(resolveApiBase({ PROD: false })).toBe('http://localhost:5175');
  });

  it('requires VITE_API_URL in production', () => {
    expect(() => resolveApiBase({ PROD: true })).toThrow(/VITE_API_URL is required/);
  });

  it('normalizes the configured API origin', () => {
    expect(resolveApiBase({ PROD: true, VITE_API_URL: 'https://api.epion.test/' })).toBe(
      'https://api.epion.test',
    );
  });

  it('rejects localhost and non-https API bases in production', () => {
    expect(() =>
      resolveApiBase({ PROD: true, VITE_API_URL: 'http://localhost:5175' }),
    ).toThrow(/https|localhost/);

    expect(() =>
      resolveApiBase({ PROD: true, VITE_API_URL: 'http://api.epion.test' }),
    ).toThrow(/https/);
  });

  it('rejects API bases with paths in production', () => {
    expect(() =>
      resolveApiBase({ PROD: true, VITE_API_URL: 'https://api.epion.test/v1' }),
    ).toThrow(/origin only/);
  });
});

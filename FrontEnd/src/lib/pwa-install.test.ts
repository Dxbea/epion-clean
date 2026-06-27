import { describe, expect, it } from 'vitest';

import { getPwaInstallFallbackMessage } from './pwa-install';

describe('PWA install fallback messages', () => {
  it('explains the iOS Safari home screen flow', () => {
    expect(
      getPwaInstallFallbackMessage({
        isInstalled: false,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        locale: 'en',
      }),
    ).toContain('Share');
  });

  it('explains the browser menu install flow for desktop Chromium browsers', () => {
    expect(
      getPwaInstallFallbackMessage({
        isInstalled: false,
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
        locale: 'en',
      }),
    ).toContain('browser menu');
  });

  it('returns an installed message when the app is already standalone', () => {
    expect(
      getPwaInstallFallbackMessage({
        isInstalled: true,
        userAgent: 'Mozilla/5.0',
        locale: 'en',
      }),
    ).toBe('Epion is already installed on this device.');
  });
});

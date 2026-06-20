import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const vercelMocks = vi.hoisted(() => ({
  inject: vi.fn(),
}));

const sentryMocks = vi.hoisted(() => ({
  init: vi.fn(),
  addIntegration: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
  replayIntegration: vi.fn(() => ({ name: 'Replay' })),
  startReplay: vi.fn(),
  stopReplay: vi.fn(() => Promise.resolve()),
}));

vi.mock('@vercel/analytics', () => ({
  inject: vercelMocks.inject,
}));

vi.mock('@sentry/react', () => ({
  init: sentryMocks.init,
  addIntegration: sentryMocks.addIntegration,
  browserTracingIntegration: sentryMocks.browserTracingIntegration,
  replayIntegration: sentryMocks.replayIntegration,
  getReplay: () => ({
    start: sentryMocks.startReplay,
    stop: sentryMocks.stopReplay,
  }),
}));

import {
  __resetTrackingServicesForTests,
  applyTrackingConsent,
  initSentryErrorMonitoring,
  sendGoogleAnalyticsPageView,
} from './tracking-services';

function gaScripts(): HTMLScriptElement[] {
  return [...document.querySelectorAll<HTMLScriptElement>('script[src*="googletagmanager.com/gtag/js"]')];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  __resetTrackingServicesForTests();
  document.head.innerHTML = '';
  document.cookie = '_ga=test; path=/';
  document.cookie = '_ga_CUSTOM=test; path=/';
  delete window.gtag;
  delete window.dataLayer;
  delete window['ga-disable-G-NX59W4PKLR'];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('tracking services consent gate', () => {
  it('does not initialize analytics on a first visit without a choice', () => {
    initSentryErrorMonitoring();
    applyTrackingConsent('unknown');

    expect(vercelMocks.inject).not.toHaveBeenCalled();
    expect(sentryMocks.init).not.toHaveBeenCalled();
    expect(sentryMocks.addIntegration).not.toHaveBeenCalled();
    expect(sentryMocks.startReplay).not.toHaveBeenCalled();
    expect(window.gtag).toBeUndefined();
    expect(gaScripts()).toHaveLength(0);
  });

  it('keeps Sentry error monitoring minimal before consent', () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.com/1');

    initSentryErrorMonitoring();
    applyTrackingConsent('unknown');

    expect(sentryMocks.init).toHaveBeenCalledTimes(1);
    const options = sentryMocks.init.mock.calls[0][0];
    expect(options.sendDefaultPii).toBe(false);
    expect(options.replaysSessionSampleRate).toBe(0);
    expect(options.replaysOnErrorSampleRate).toBe(0);
    expect(sentryMocks.browserTracingIntegration).not.toHaveBeenCalled();
    expect(sentryMocks.replayIntegration).not.toHaveBeenCalled();
    expect(options.beforeSend({ user: { id: 'user-1', email: 'user@example.com' } })).toEqual({ user: { id: 'user-1' } });
    expect(options.beforeSendTransaction({ type: 'transaction' })).toBeNull();
  });

  it('initializes accepted analytics only once', () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.com/1');

    initSentryErrorMonitoring();
    applyTrackingConsent('granted');
    applyTrackingConsent('granted');

    expect(sentryMocks.init).toHaveBeenCalledTimes(1);
    expect(vercelMocks.inject).toHaveBeenCalledTimes(1);
    expect(sentryMocks.addIntegration).toHaveBeenCalledTimes(2);
    expect(sentryMocks.browserTracingIntegration).toHaveBeenCalledTimes(1);
    expect(sentryMocks.replayIntegration).toHaveBeenCalledTimes(1);
    expect(sentryMocks.startReplay).toHaveBeenCalledTimes(1);
    expect(gaScripts()).toHaveLength(1);
  });

  it('keeps analytics disabled after refusal', () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.com/1');

    initSentryErrorMonitoring();
    applyTrackingConsent('denied');
    sendGoogleAnalyticsPageView('/blocked');

    expect(sentryMocks.init).toHaveBeenCalledTimes(1);
    expect(vercelMocks.inject).not.toHaveBeenCalled();
    expect(sentryMocks.addIntegration).not.toHaveBeenCalled();
    expect(sentryMocks.startReplay).not.toHaveBeenCalled();
    expect(window.gtag).toBeUndefined();
    expect(window['ga-disable-G-NX59W4PKLR']).toBe(true);
    expect(gaScripts()).toHaveLength(0);
  });

  it('stops new analytics, replay, and Sentry transaction events after revocation', () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.com/1');

    initSentryErrorMonitoring();
    const sentryOptions = sentryMocks.init.mock.calls[0][0];
    applyTrackingConsent('granted');
    const beforeSend = vercelMocks.inject.mock.calls[0][0].beforeSend;
    const gtag = vi.fn();
    window.gtag = gtag;

    expect(sentryOptions.beforeSendTransaction({ type: 'transaction' })).toEqual({ type: 'transaction' });
    sendGoogleAnalyticsPageView('/allowed');
    applyTrackingConsent('denied');
    sendGoogleAnalyticsPageView('/blocked');

    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith('config', 'G-NX59W4PKLR', {
      anonymize_ip: true,
      page_path: '/allowed',
    });
    expect(beforeSend({ type: 'pageview', url: 'https://epion.test/blocked' })).toBeNull();
    expect(sentryOptions.beforeSendTransaction({ type: 'transaction' })).toBeNull();
    expect(sentryMocks.stopReplay).toHaveBeenCalledTimes(1);
    expect(window['ga-disable-G-NX59W4PKLR']).toBe(true);
    expect(document.cookie).not.toContain('_ga=');
    expect(document.cookie).not.toContain('_ga_CUSTOM=');
  });

  it('does not double-initialize after several consent changes', () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.com/1');

    initSentryErrorMonitoring();
    applyTrackingConsent('granted');
    applyTrackingConsent('denied');
    applyTrackingConsent('granted');
    applyTrackingConsent('denied');
    applyTrackingConsent('granted');

    expect(vercelMocks.inject).toHaveBeenCalledTimes(1);
    expect(sentryMocks.addIntegration).toHaveBeenCalledTimes(2);
    expect(sentryMocks.browserTracingIntegration).toHaveBeenCalledTimes(1);
    expect(sentryMocks.replayIntegration).toHaveBeenCalledTimes(1);
    expect(sentryMocks.startReplay).toHaveBeenCalledTimes(3);
    expect(sentryMocks.stopReplay).toHaveBeenCalledTimes(2);
    expect(gaScripts()).toHaveLength(1);
  });

  it('does not crash when analytics environment variables are absent', () => {
    expect(() => {
      initSentryErrorMonitoring();
      applyTrackingConsent('granted');
      sendGoogleAnalyticsPageView('/safe');
    }).not.toThrow();

    expect(sentryMocks.init).not.toHaveBeenCalled();
    expect(vercelMocks.inject).toHaveBeenCalledTimes(1);
  });
});
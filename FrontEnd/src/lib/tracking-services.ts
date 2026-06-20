import { inject as injectVercelAnalytics } from '@vercel/analytics';
import * as Sentry from '@sentry/react';

import type { TrackingConsent } from './tracking-consent';

const DEFAULT_GA_MEASUREMENT_ID = 'G-NX59W4PKLR';
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || DEFAULT_GA_MEASUREMENT_ID;

type SentryEventWithUser = {
  user?: Record<string, unknown>;
  [key: string]: unknown;
};

let currentConsent: TrackingConsent = 'unknown';
let vercelAnalyticsInitialized = false;
let googleAnalyticsInitialized = false;
let sentryErrorMonitoringInitialized = false;
let sentryTracingInitialized = false;
let sentryReplayInitialized = false;
let sentryReplayRunning = false;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    va?: (event: 'beforeSend' | 'event' | 'pageview', properties?: unknown) => void;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

function hasConsent(): boolean {
  return currentConsent === 'granted';
}

function canUseDocument(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function setGoogleAnalyticsDisabled(disabled: boolean): void {
  if (typeof window === 'undefined' || !GA_MEASUREMENT_ID) return;
  window[`ga-disable-${GA_MEASUREMENT_ID}`] = disabled;
}

function loadGoogleAnalytics(): void {
  if (!canUseDocument() || !GA_MEASUREMENT_ID || googleAnalyticsInitialized) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };

  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, {
    anonymize_ip: true,
    send_page_view: false,
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  document.head.appendChild(script);

  googleAnalyticsInitialized = true;
}

function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;

  const expires = 'Thu, 01 Jan 1970 00:00:00 GMT';
  const hostname = window.location.hostname;
  const domainParts = hostname.split('.');
  const domains = new Set<string>([hostname]);

  if (domainParts.length > 1) {
    domains.add(`.${domainParts.slice(-2).join('.')}`);
  }

  document.cookie = `${name}=; expires=${expires}; path=/`;
  for (const domain of domains) {
    document.cookie = `${name}=; expires=${expires}; path=/; domain=${domain}`;
  }
}

function clearGoogleAnalyticsCookies(): void {
  deleteCookie('_ga');
  deleteCookie('_gid');
  deleteCookie('_gat');

  if (typeof document !== 'undefined') {
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.split('=')[0]?.trim();
      if (name?.startsWith('_ga_')) {
        deleteCookie(name);
      }
    }
  }

  if (GA_MEASUREMENT_ID) {
    deleteCookie(`_ga_${GA_MEASUREMENT_ID.replace(/^G-/, '')}`);
  }
}

function initVercelAnalytics(): void {
  if (vercelAnalyticsInitialized) return;

  injectVercelAnalytics({
    beforeSend: (event) => (hasConsent() ? event : null),
  });
  vercelAnalyticsInitialized = true;
}

function sanitizeSentryErrorEvent(event: SentryEventWithUser): SentryEventWithUser {
  if (!event.user) return event;

  const { email, ...safeUser } = event.user;
  return {
    ...event,
    user: safeUser,
  };
}

export function initSentryErrorMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || sentryErrorMonitoringInitialized) return;

  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend: (event) => sanitizeSentryErrorEvent(event as SentryEventWithUser) as typeof event,
    beforeSendTransaction: (event) => (hasConsent() ? event : null),
  });

  sentryErrorMonitoringInitialized = true;
}

function startSentryReplay(): void {
  if (sentryReplayRunning) return;
  Sentry.getReplay()?.start();
  sentryReplayRunning = true;
}

function initSentryNonEssentialTracking(): void {
  if (!sentryErrorMonitoringInitialized || !hasConsent()) return;

  if (!sentryTracingInitialized) {
    Sentry.addIntegration(Sentry.browserTracingIntegration());
    sentryTracingInitialized = true;
  }

  if (!sentryReplayInitialized) {
    Sentry.addIntegration(Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }));
    sentryReplayInitialized = true;
  }

  startSentryReplay();
}

function stopSentryReplay(): void {
  if (!sentryReplayRunning) return;
  Sentry.getReplay()?.stop().catch(() => undefined);
  sentryReplayRunning = false;
}

export function applyTrackingConsent(consent: TrackingConsent): void {
  currentConsent = consent;

  if (consent !== 'granted') {
    setGoogleAnalyticsDisabled(true);
    clearGoogleAnalyticsCookies();
    stopSentryReplay();
    return;
  }

  setGoogleAnalyticsDisabled(false);
  initVercelAnalytics();
  loadGoogleAnalytics();
  initSentryNonEssentialTracking();
}

export function sendGoogleAnalyticsPageView(path: string): void {
  if (!hasConsent() || typeof window === 'undefined' || typeof window.gtag !== 'function') return;

  window.gtag('config', GA_MEASUREMENT_ID, {
    anonymize_ip: true,
    page_path: path,
  });
}

export function __resetTrackingServicesForTests(): void {
  currentConsent = 'unknown';
  vercelAnalyticsInitialized = false;
  googleAnalyticsInitialized = false;
  sentryErrorMonitoringInitialized = false;
  sentryTracingInitialized = false;
  sentryReplayInitialized = false;
  sentryReplayRunning = false;
}
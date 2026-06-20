import * as React from 'react';

export type TrackingConsent = 'unknown' | 'granted' | 'denied';
export type StoredTrackingConsent = Exclude<TrackingConsent, 'unknown'>;

type StoredTrackingConsentPayload = {
  version: number;
  choice: StoredTrackingConsent;
};

export const TRACKING_CONSENT_STORAGE_KEY = 'epion:tracking-consent';
export const TRACKING_CONSENT_VERSION = 1;

const CONSENT_CHANGE_EVENT = 'epion:tracking-consent-change';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeConsent(payload: string | null): TrackingConsent {
  if (!payload) return 'unknown';

  try {
    const parsed = JSON.parse(payload) as Partial<StoredTrackingConsentPayload>;
    if (parsed.version !== TRACKING_CONSENT_VERSION) return 'unknown';
    if (parsed.choice === 'granted' || parsed.choice === 'denied') return parsed.choice;
  } catch {
    return 'unknown';
  }

  return 'unknown';
}

export function getTrackingConsent(): TrackingConsent {
  if (!canUseStorage()) return 'unknown';

  try {
    return normalizeConsent(window.localStorage.getItem(TRACKING_CONSENT_STORAGE_KEY));
  } catch {
    return 'unknown';
  }
}

export function setTrackingConsent(consent: StoredTrackingConsent): void {
  if (!canUseStorage()) return;

  try {
    const payload: StoredTrackingConsentPayload = {
      version: TRACKING_CONSENT_VERSION,
      choice: consent,
    };
    window.localStorage.setItem(TRACKING_CONSENT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    return;
  }

  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
}

export function subscribeToTrackingConsent(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const onStorage = (event: StorageEvent) => {
    if (event.key === TRACKING_CONSENT_STORAGE_KEY) callback();
  };

  window.addEventListener(CONSENT_CHANGE_EVENT, callback);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(CONSENT_CHANGE_EVENT, callback);
    window.removeEventListener('storage', onStorage);
  };
}

export function useTrackingConsent(): TrackingConsent {
  return React.useSyncExternalStore(
    subscribeToTrackingConsent,
    getTrackingConsent,
    () => 'unknown',
  );
}

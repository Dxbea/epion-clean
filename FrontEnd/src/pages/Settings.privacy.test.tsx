import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TRACKING_CONSENT_STORAGE_KEY, TRACKING_CONSENT_VERSION, getTrackingConsent } from '@/lib/tracking-consent';
import { PrivacySection } from './Settings';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const pushMock = vi.hoisted(() => vi.fn());

vi.mock('@/i18n/I18nContext', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string) =>
      ({
        privacy: 'Privacy',
        privacy_desc: 'Control visibility and analytics.',
        cancel: 'Cancel',
        save: 'Save',
        saved: 'Saved',
        profile_visibility: 'Profile visibility',
        profile_visibility_desc: 'Profile visibility description',
        visibility_public: 'Public',
        visibility_private: 'Private',
        analytics_tracking: 'Analytics tracking',
        analytics_tracking_desc: 'Analytics description',
        analytics_allow: 'Allow audience measurement',
        analytics_allow_desc: 'Consent can be revoked.',
      })[key] || key,
  }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ push: pushMock }),
}));

vi.mock('@/contexts/MeContext', () => ({
  useMe: () => ({ me: { id: 'user-1' } }),
}));

vi.mock('@/hooks/useUnsavedChanges', () => ({
  useUnsavedChanges: () => undefined,
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderPrivacySection() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<PrivacySection />);
  });

  return container;
}

function switchButton(): HTMLButtonElement {
  return container!.querySelector('[role="switch"]') as HTMLButtonElement;
}

function saveButton(): HTMLButtonElement {
  return [...container!.querySelectorAll('button')].find((button) => button.textContent === 'Save') as HTMLButtonElement;
}

beforeEach(() => {
  localStorage.clear();
  pushMock.mockClear();
});

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  localStorage.clear();
});

describe('PrivacySection tracking consent', () => {
  it('treats legacy or outdated consent as unknown so the choice can be requested again', () => {
    localStorage.setItem(TRACKING_CONSENT_STORAGE_KEY, 'granted');
    expect(getTrackingConsent()).toBe('unknown');

    localStorage.setItem(TRACKING_CONSENT_STORAGE_KEY, JSON.stringify({
      version: TRACKING_CONSENT_VERSION + 1,
      choice: 'granted',
    }));
    expect(getTrackingConsent()).toBe('unknown');
  });

  it('modifies analytics consent from settings and allows revocation', async () => {
    await renderPrivacySection();

    expect(getTrackingConsent()).toBe('unknown');
    expect(switchButton().getAttribute('aria-checked')).toBe('false');

    await act(async () => {
      switchButton().click();
    });
    await act(async () => {
      saveButton().click();
    });

    expect(getTrackingConsent()).toBe('granted');
    expect(JSON.parse(localStorage.getItem(TRACKING_CONSENT_STORAGE_KEY) || '{}')).toEqual({
      version: TRACKING_CONSENT_VERSION,
      choice: 'granted',
    });
    expect(JSON.parse(localStorage.getItem('privacy:user-1') || '{}')).toMatchObject({ tracking: true });

    await act(async () => {
      switchButton().click();
    });
    await act(async () => {
      saveButton().click();
    });

    expect(getTrackingConsent()).toBe('denied');
    expect(JSON.parse(localStorage.getItem(TRACKING_CONSENT_STORAGE_KEY) || '{}')).toEqual({
      version: TRACKING_CONSENT_VERSION,
      choice: 'denied',
    });
    expect(JSON.parse(localStorage.getItem('privacy:user-1') || '{}')).toMatchObject({ tracking: false });
  });
});

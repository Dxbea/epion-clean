// src/pages/Settings.tsx
import * as React from 'react';
import PageContainer from '@/components/ui/PageContainer';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { H3, Body, Button } from '@/components/ui';
import FormSection from '@/components/settings/FormSection';
import ToggleRow from '@/components/settings/ToggleRow';
import { ThemeToggle } from '@/components/ThemeToggle';
import SelectLang from '@/components/settings/SelectLang';
import AccountAuthBox from '@/components/settings/AccountAuthBox';
import AccountProfileForm from '@/components/account/AccountProfileForm';

// sous-blocs sécurité existants
import ChangePasswordForm from '@/components/settings/ChangePasswordForm';
import TwoFAPlaceholder from '@/components/settings/TwoFAPlaceholder';
import SessionsList from '@/components/settings/SessionsList';

import DataComplianceSection from '@/components/settings/DataComplianceSection';
import AccessibilitySection from '@/components/settings/AccessibilitySection';
import SettingsSidebarNav from '@/components/settings/SettingsSidebarNav';
import { useI18n } from '@/i18n/I18nContext';

import { useToast } from '@/components/ui/Toast';
import { useMe } from '@/contexts/MeContext';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { authClient, getEmailVerificationCallbackURL } from '@/lib/better-auth-client';
import { getTrackingConsent, setTrackingConsent, useTrackingConsent } from '@/lib/tracking-consent';

function resolveLabel(
  t: (key: string) => string,
  key: string,
  fallback: string
) {
  const value = t(key);
  return value === key ? fallback : value;
}

//
// ─────────────────────────────────────────────────────────────
// Helpers locaux (Email & verification UI pour le bloc Security)
// ─────────────────────────────────────────────────────────────
// On garde cette mini vue inline ici parce que c'est très spécifique à Security.
//
// 🔁 remplace ENTIEREMENT EmailAndVerificationBlock dans Settings.tsx

function EmailAndVerificationBlock(): React.JSX.Element {
  const { me } = useMe();
  const { push } = useToast();
  const { t } = useI18n();
  const emailVerificationLabel = resolveLabel(t, 'settings_email_verification', 'Email verification');
  const changeEmailLabel = resolveLabel(t, 'settings_change_email', 'Change email');
  const sendLinkLabel = resolveLabel(t, 'settings_send_link', 'Send secure link');
  const emailHelpLabel = resolveLabel(
    t,
    'settings_email_help',
    "We'll send a confirmation link to the new address before applying the change."
  );

  // change email form local state
  const [newEmail, setNewEmail] = React.useState('');
  const [busyChangeEmail, setBusyChangeEmail] = React.useState(false);

  async function requestEmailChange() {
    if (!newEmail.trim()) return;
    try {
      setBusyChangeEmail(true);
      const res = await authClient.changeEmail({
        newEmail: newEmail.trim().toLowerCase(),
        callbackURL: getEmailVerificationCallbackURL(),
      });
      if (res.error) throw new Error(res.error.message || `HTTP ${res.error.status || 400}`);
      push('If this address is valid, we sent a verification link.', 'success');
      setNewEmail('');
    } catch {
      push('Could not send verification email. Try again.', 'error');
    } finally {
      setBusyChangeEmail(false);
    }
  }

  const verified = Boolean(me?.emailVerified);

  return (
    <div className="space-y-4">
      {/* Titre de sous-section */}
      <H3 as="div" className="text-base font-semibold">
        {emailVerificationLabel}
      </H3>

      {/* Ligne email actuelle + badge + resend */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center rounded-xl border border-black/10 bg-[var(--bg)] px-3 py-1 text-sm dark:border-white/10">
          {me?.email || 'unknown@email.com'}
        </span>

        <span
          className={
            'inline-flex items-center rounded-xl border px-2 py-1 text-[11px] leading-none ' +
            (verified
              ? 'border-green-600 text-green-700 dark:border-green-400 dark:text-green-400'
              : 'border-yellow-600 text-yellow-700 dark:border-yellow-400 dark:text-yellow-400')
          }
        >
          {verified ? t('verified') : t('unverified')}
        </span>

      </div>

      {/* Change email */}
      <div className="grid gap-2 text-sm md:max-w-md">
        <label className="text-sm font-medium">{changeEmailLabel}</label>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@email.com"
            className="form-input"
          />

          <Button
            variant="primary"
            size="auto"
            onClick={requestEmailChange}
            disabled={!newEmail || busyChangeEmail}
            className="shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium"
          >
            {busyChangeEmail ? t('sending') : sendLinkLabel}
          </Button>
        </div>

        <p className="text-[11px] opacity-70">
          {emailHelpLabel}
        </p>
      </div>
    </div>
  );
}


//
// ─────────────────────────────────────────────
// NotificationsSection (inchangé sauf placement)
// ─────────────────────────────────────────────
//
function NotificationsSection({ id }: { id?: string }): React.JSX.Element {
  const { t } = useI18n();
  const { push } = useToast();
  const { me } = useMe();
  const pushNotSupportedLabel = resolveLabel(
    t,
    'push_not_supported',
    'Push notifications are not supported on this browser.'
  );
  const pushDeniedLabel = resolveLabel(
    t,
    'push_denied',
    'Browser permission is disabled. You can re-enable it in browser settings.'
  );

  type NotifState = {
    emailNews: boolean;
    emailMentions: boolean;
    pushAll: boolean;
  };

  const storageKey = React.useMemo(
    () => (me?.id ? `notif:${me.id}` : 'notif'),
    [me?.id]
  );

  const [state, setState] = React.useState<NotifState>(() => {
    const raw = localStorage.getItem(storageKey);
    return raw
      ? (JSON.parse(raw) as NotifState)
      : { emailNews: true, emailMentions: false, pushAll: false };
  });

  React.useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    setState(
      raw
        ? (JSON.parse(raw) as NotifState)
        : { emailNews: true, emailMentions: false, pushAll: false }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const [initial, setInitial] = React.useState<NotifState>(state);
  const dirty = JSON.stringify(state) !== JSON.stringify(initial);
  useUnsavedChanges(dirty);
  const [saved, setSaved] = React.useState(false);

  const pushSupported =
    typeof window !== 'undefined' && 'Notification' in window;
  const permission = pushSupported ? Notification.permission : 'denied';

  async function togglePush(next: boolean) {
    if (!pushSupported) {
      push('Push notifications not supported on this browser.', 'error');
      return;
    }
    if (next === false) {
      setState((s) => ({ ...s, pushAll: false }));
      return;
    }
    if (permission === 'granted') {
      setState((s) => ({ ...s, pushAll: true }));
      return;
    }
    try {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        setState((s) => ({ ...s, pushAll: true }));
        push('Notifications enabled on this device.', 'success');
      } else {
        setState((s) => ({ ...s, pushAll: false }));
        push('Permission denied.', 'error');
      }
    } catch {
      setState((s) => ({ ...s, pushAll: false }));
      push('Could not enable notifications.', 'error');
    }
  }

  const update = <K extends keyof NotifState>(
    k: K,
    v: NotifState[K]
  ): void => {
    if (k === 'pushAll') return void togglePush(Boolean(v));
    setState((s) => ({ ...s, [k]: v }));
  };

  function onSave() {
    localStorage.setItem(storageKey, JSON.stringify(state));
    setInitial(state);
    setSaved(true);
    push('Saved', 'success');
    setTimeout(() => setSaved(false), 1500);
  }

  const pushDisabled = !pushSupported;

  return (
    <FormSection
      id={id}
      title={t('notifications')}
      description={t('notifications_desc')}
      footer={
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => setState(initial)}
            disabled={!dirty}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={onSave}
            disabled={!dirty}
          >
            {t('save')}
          </Button>
          {saved && (
            <span className="text-sm text-green-600 dark:text-green-400">
              {t('saved')}
            </span>
          )}
        </div>
      }
    >
      <ul className="divide-y divide-surface-200 dark:divide-neutral-800">
        <li className="py-4">
          <ToggleRow
            label={t('notif_email_news')}
            sublabel={t('notif_email_news_desc')}
            value={state.emailNews}
            onChange={(v) => update('emailNews', v)}
          />
        </li>
        <li className="py-4">
          <ToggleRow
            label={t('notif_email_mentions')}
            sublabel={t('notif_email_mentions_desc')}
            value={state.emailMentions}
            onChange={(v) => update('emailMentions', v)}
          />
        </li>
        <li className="py-4">
          <ToggleRow
            label={t('notif_push_all')}
            sublabel={t('notif_push_all_desc')}
            value={state.pushAll && permission === 'granted'}
            onChange={(v) => update('pushAll', v)}
            disabled={pushDisabled}
          />
          {!pushSupported && (
            <div className="mt-1 text-xs text-neutral-500">
              {pushNotSupportedLabel}
            </div>
          )}
          {pushSupported && permission === 'denied' && (
            <div className="mt-1 text-xs text-neutral-500">
              {pushDeniedLabel}
            </div>
          )}
        </li>
      </ul>
    </FormSection>
  );
}

//
// ─────────────────────────────────────────────
// PrivacySection (inchangé)
// ─────────────────────────────────────────────
//
function readPrivacyState(storageKey: string): { profileVisibility: 'public' | 'private'; tracking: boolean } {
  const fallback = {
    profileVisibility: 'public' as const,
    tracking: getTrackingConsent() === 'granted',
  };

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      profileVisibility: parsed.profileVisibility === 'private' ? 'private' : 'public',
      tracking: getTrackingConsent() === 'granted',
    };
  } catch {
    return fallback;
  }
}

export function PrivacySection({ id }: { id?: string }): React.JSX.Element {
  const { t } = useI18n();
  const { push } = useToast();
  const { me } = useMe();
  const consent = useTrackingConsent();

  type Visibility = 'public' | 'private';
  type PrivacyState = { profileVisibility: Visibility; tracking: boolean };

  const storageKey = React.useMemo(
    () => (me?.id ? `privacy:${me.id}` : 'privacy'),
    [me?.id]
  );

  const [state, setState] = React.useState<PrivacyState>(() => readPrivacyState(storageKey));
  const [initial, setInitial] = React.useState<PrivacyState>(() => readPrivacyState(storageKey));

  React.useEffect(() => {
    const next = readPrivacyState(storageKey);
    setState(next);
    setInitial(next);
  }, [storageKey, consent]);

  const dirty = JSON.stringify(state) !== JSON.stringify(initial);
  useUnsavedChanges(dirty);
  const [saved, setSaved] = React.useState(false);

  function onSave() {
    const nextConsent = state.tracking ? 'granted' : 'denied';
    setTrackingConsent(nextConsent);
    localStorage.setItem(storageKey, JSON.stringify(state));
    setInitial(state);
    setSaved(true);
    push('Saved', 'success');
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <FormSection
      id={id}
      title={t('privacy')}
      description={t('privacy_desc')}
      footer={
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => setState(initial)}
            disabled={!dirty}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={onSave}
            disabled={!dirty}
          >
            {t('save')}
          </Button>
          {saved && (
            <span className="text-sm text-green-600 dark:text-green-400">
              {t('saved')}
            </span>
          )}
        </div>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <H3 as="div" className="mb-2 text-base">
            {t('profile_visibility')}
          </H3>
          <Body className="mb-3">
            {t('profile_visibility_desc')}
          </Body>
          <div className="grid gap-2">
            {(['public', 'private'] as Visibility[]).map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-3 rounded-xl border border-surface-200 p-3 hover:bg-surface-100 dark:border-neutral-800 dark:hover:bg-neutral-900"
              >
                <input
                  type="radio"
                  name="visibility"
                  value={opt}
                  checked={state.profileVisibility === opt}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      profileVisibility: e.target.value as Visibility,
                    }))
                  }
                />
                <span className="capitalize">
                  {t(
                    opt === 'public'
                      ? 'visibility_public'
                      : 'visibility_private'
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <H3 as="div" className="mb-2 text-base">
            {t('analytics_tracking')}
          </H3>
          <Body className="mb-3">
            {t('analytics_tracking_desc')}
          </Body>
          <ToggleRow
            label={t('analytics_allow')}
            sublabel={t('analytics_allow_desc')}
            value={state.tracking}
            onChange={(v: boolean) =>
              setState((s) => ({ ...s, tracking: v }))
            }
          />
        </div>
      </div>
    </FormSection>
  );
}
function GeneralSection({ id }: { id?: string }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <FormSection
      id={id}
      title={t('general')}
      description={t('general_desc')}
    >
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Theme */}
        <div className="rounded-2xl border border-surface-200 p-4 dark:border-neutral-800">
          <H3 as="div" className="mb-2 text-base">
            {t('theme')}
          </H3>
          <Body className="mb-3">{t('theme_desc')}</Body>
          <ThemeToggle />
        </div>

        {/* Language */}
        <div className="rounded-2xl border border-surface-200 p-4 dark:border-neutral-800">
          <H3 as="div" className="mb-2 text-base">
            {t('language')}
          </H3>
          <Body className="mb-1">
            {t('language_desc')}
          </Body>
          <Body className="mb-3 text-xs opacity-70">
            {t('changes_apply_immediately') ||
              'Changes apply immediately.'}
          </Body>
          <SelectLang />
        </div>
      </div>
    </FormSection>
  );
}

//
// ─────────────────────────────────────────────
// SecurityBlock = notre GROS bloc fusionné
// ─────────────────────────────────────────────
//
// 🔁 remplace ENTIEREMENT SecurityBlock dans Settings.tsx

function SecurityBlock({ id }: { id?: string }): React.JSX.Element {
  const { t } = useI18n();
  const securityTitle = resolveLabel(t, 'settings_security', 'Security');
  const securityDesc = resolveLabel(
    t,
    'settings_security_desc',
    'Email verification, password, sessions and account protection.'
  );
  return (
    <FormSection
      id={id}
      title={securityTitle}
      description={securityDesc}
    >
      <div className="space-y-5">
        {/* 1. Email & verification (on garde la carte ici car c'est du contenu inline) */}
        <div className="settings-subcard">
          <EmailAndVerificationBlock />
        </div>

        {/* 2. Change password
            -> TON ChangePasswordForm contient déjà sa propre carte/border
            et le bloc 'Can't remember your current password?'
            donc pas de wrapper supplémentaire */}
        <ChangePasswordForm />

        {/* 3. Two-factor auth (déjà avec sa propre carte dans ton UI) */}
        <TwoFAPlaceholder />

        {/* 4. Active sessions (déjà carte + header) */}
        <SessionsList />
      </div>
    </FormSection>
  );
}

//
// ─────────────────────────────────────────────
// PAGE SETTINGS PRINCIPALE
// ─────────────────────────────────────────────
//
export default function Settings(): React.JSX.Element {
  const { t, locale } = useI18n();
  const { push } = useToast();
  const { me, loading } = useMe();
  const signedIn = Boolean(me);

  // items pour la nav latérale / menu mobile
  const items = React.useMemo(
    () =>
      signedIn
        ? [
            { id: 'general', label: t('general') },
            { id: 'account', label: t('account') },
            { id: 'security', label: t('security') },
            { id: 'notifications', label: t('notifications') },
            { id: 'privacy', label: t('privacy') },
            { id: 'data', label: t('data') },
            { id: 'accessibility', label: t('accessibility') },
          ]
        : [{ id: 'account', label: t('account') }],
    [t, locale, signedIn]
  );

  // scroll to hash on mount (unchanged)
  React.useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const el = document.getElementById(hash);
      if (el)
        setTimeout(
          () => el.scrollIntoView({ behavior: 'smooth' }),
          0
        );
    }
  }, []);


  return (
    <PageContainer className="py-10">
      <Breadcrumbs />

      {/* Mobile jump */}
      {signedIn && (
      <div className="mb-6 lg:hidden">
        <label htmlFor="settings-jump" className="sr-only">
          {t('jump_to')}
        </label>
        <select
          id="settings-jump"
          className="form-select min-h-[44px] text-sm"
          onChange={(e) => {
            const id = e.target.value;
            document
              .getElementById(id)
              ?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.label}
            </option>
          ))}
        </select>
      </div>
      )}

      <div className={`grid grid-cols-1 gap-8 ${signedIn ? 'lg:grid-cols-[240px_1fr]' : ''}`}>
        {/* sidebar */}
        {signedIn && (
        <aside className="sticky top-24 hidden h-max lg:block">
          <SettingsSidebarNav items={items} />
        </aside>
        )}

        {/* main content */}
        <div className={signedIn ? 'space-y-8 sm:space-y-10' : 'mx-auto w-full max-w-xl'}>
          {loading && !me ? (
            <div className="settings-subcard animate-pulse space-y-4">
              <div className="h-5 w-32 rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-10 rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-10 rounded bg-neutral-200 dark:bg-neutral-800" />
            </div>
          ) : (
          <>
          {/* GENERAL */}
          {signedIn && <GeneralSection id="general" />}



          {/* ACCOUNT (connexion / signup / logout / go to my account) */}
          <section id="account" className="anchor-section space-y-5">
            {signedIn && <AccountProfileForm />}
            <AccountAuthBox />
          </section>

          {/* BIG SECURITY BLOCK FUSIONNÉ */}
          {signedIn && <SecurityBlock id="security" />}

          {/* Notifications */}
          {signedIn && <NotificationsSection id="notifications" />}

          {/* Privacy */}
          {signedIn && <PrivacySection id="privacy" />}

          {/* Data / export / delete (ton bloc DataComplianceSection existant) */}
          {signedIn && <DataComplianceSection id="data" />}

          {/* Accessibility */}
          {signedIn && <AccessibilitySection id="accessibility" />}
          </>
          )}
        </div>
      </div>
    </PageContainer>
  );
}

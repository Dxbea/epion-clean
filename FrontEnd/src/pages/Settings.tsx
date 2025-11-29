// src/pages/Settings.tsx
import * as React from 'react';
import { Link } from 'react-router-dom';

import PageContainer from '@/components/ui/PageContainer';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { H2, H3, Body, Button } from '@/components/ui';
import FormSection from '@/components/settings/FormSection';
import ToggleRow from '@/components/settings/ToggleRow';
import { ThemeToggle } from '@/components/ThemeToggle';
import SelectLang from '@/components/settings/SelectLang';
import AccountAuthBox from '@/components/settings/AccountAuthBox';

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
import { API_BASE } from '@/config/api';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import VerifyEmailBanner from '@/components/account/VerifyEmailBanner';

//
// ─────────────────────────────────────────────────────────────
// Helpers locaux (Email & verification UI pour le bloc Security)
// ─────────────────────────────────────────────────────────────
// On garde cette mini vue inline ici parce que c'est très spécifique à Security.
//
// 🔁 remplace ENTIEREMENT EmailAndVerificationBlock dans Settings.tsx

function EmailAndVerificationBlock(): React.JSX.Element {
  const { me, refresh } = useMe();
  const { push } = useToast();

  // change email form local state
  const [newEmail, setNewEmail] = React.useState('');
  const [busyChangeEmail, setBusyChangeEmail] = React.useState(false);

  async function requestEmailChange() {
    if (!newEmail.trim()) return;
    try {
      setBusyChangeEmail(true);
      const res = await fetch(`${API_BASE}/api/auth/change-email-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newEmail: newEmail.trim().toLowerCase() }),
      });

      const j = await res.json().catch(() => ({}));
      if (j?.verifyUrl) {
        // dev helper: copie le lien dans le presse‐papier pour test
        await navigator.clipboard.writeText(j.verifyUrl).catch(() => {});
      }

      push('If this address is valid, we sent a verification link.', 'success');
      setNewEmail('');
    } catch {
      push('If this address is valid, we sent a verification link.', 'success');
    } finally {
      setBusyChangeEmail(false);
    }
  }

  // resend verification email
  const [busyResend, setBusyResend] = React.useState(false);
  async function resendVerification() {
    if (!me?.email) return;
    try {
      setBusyResend(true);
      const res = await fetch(`${API_BASE}/api/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: me.email }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      push('Verification email sent.', 'success');
    } catch {
      push('Verification email sent (if possible).', 'success');
    } finally {
      setBusyResend(false);
    }
  }

  const verified = Boolean(me?.emailVerifiedAt);

  return (
    <div className="space-y-4">
      {/* Titre de sous-section */}
      <H3 as="div" className="text-base font-semibold">
        Email & verification
      </H3>

      {/* Ligne email actuelle + badge + resend */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center rounded-xl border border-black/10 bg-white px-3 py-1 text-sm dark:border-white/10 dark:bg-neutral-950">
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
          {verified ? 'Verified' : 'Unverified'}
        </span>

        {!verified && (
          <button
            onClick={resendVerification}
            disabled={busyResend}
            className="
              inline-flex items-center rounded-xl
              bg-black px-3 py-1 text-sm font-medium text-white
              dark:bg-white dark:text-black
              disabled:opacity-50
            "
          >
            {busyResend ? 'Sending…' : 'Resend email'}
          </button>
        )}
      </div>

      {/* Change email */}
      <div className="grid gap-2 text-sm md:max-w-md">
        <label className="text-sm font-medium">Change email</label>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
  <input
    type="email"
    value={newEmail}
    onChange={(e) => setNewEmail(e.target.value)}
    placeholder="new@email.com"
    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none
               focus:ring-2 focus:ring-brand-blue
               dark:border-white/10 dark:bg-neutral-950"
  />

  <button
    onClick={requestEmailChange}
    disabled={!newEmail || busyChangeEmail}
    className="
      shrink-0 whitespace-nowrap
      rounded-xl bg-neutral-700 px-4 py-2 text-sm font-medium text-white
      dark:bg-neutral-300 dark:text-black
      disabled:opacity-50
    "
  >
    {busyChangeEmail ? 'Sending…' : 'Send link'}
  </button>
</div>

        <p className="text-[11px] opacity-70">
          We’ll email a confirmation link to the new address.
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
              Push not supported on this browser.
            </div>
          )}
          {pushSupported && permission === 'denied' && (
            <div className="mt-1 text-xs text-neutral-500">
              Permission previously denied in browser settings.
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
function PrivacySection({ id }: { id?: string }): React.JSX.Element {
  const { t } = useI18n();
  const { push } = useToast();
  const { me } = useMe();

  type Visibility = 'public' | 'private';
  type PrivacyState = { profileVisibility: Visibility; tracking: boolean };

  const storageKey = React.useMemo(
    () => (me?.id ? `privacy:${me.id}` : 'privacy'),
    [me?.id]
  );

  const [state, setState] = React.useState<PrivacyState>(() => {
    const raw = localStorage.getItem(storageKey);
    return raw
      ? (JSON.parse(raw) as PrivacyState)
      : { profileVisibility: 'public', tracking: false };
  });

  React.useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    setState(
      raw
        ? (JSON.parse(raw) as PrivacyState)
        : { profileVisibility: 'public', tracking: false }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const [initial, setInitial] = React.useState<PrivacyState>(state);
  const dirty = JSON.stringify(state) !== JSON.stringify(initial);
  useUnsavedChanges(dirty);
  const [saved, setSaved] = React.useState(false);

  function onSave() {
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

//
// ─────────────────────────────────────────────
// GeneralSection (inchangé visuellement)
// ─────────────────────────────────────────────
//
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
  return (
    <FormSection
      id={id}
      title="Security"
      description="Manage your email & verification status, change your password, enable two-factor auth and review active sessions."
    >
      <div className="space-y-8">
        {/* 1. Email & verification (on garde la carte ici car c'est du contenu inline) */}
        <div className="rounded-2xl border border-surface-200 p-4 dark:border-neutral-800">
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
  const { refresh } = useMe();

  // items pour la nav latérale / menu mobile
  const items = React.useMemo(
    () => [
      { id: 'general', label: t('general') },
      { id: 'account', label: t('account') },
      { id: 'security', label: t('security') },
      { id: 'notifications', label: t('notifications') },
      { id: 'privacy', label: t('privacy') },
      { id: 'data', label: t('data') },
      { id: 'accessibility', label: t('accessibility') },
    ],
    [t, locale]
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

  // handle verifyToken and changeEmailToken in URL
  React.useEffect(() => {
    const url = new URL(window.location.href);

    // 1. confirm-email-change
    const changeEmailToken = url.searchParams.get('changeEmailToken');
    if (changeEmailToken) {
      (async () => {
        try {
          const res = await fetch(
            `${API_BASE}/api/auth/confirm-email-change`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ token: changeEmailToken }),
            }
          );
          if (!res.ok) {
            push(
              res.status === 409
                ? 'This email is already in use.'
                : 'Invalid or expired link.',
              'error'
            );
          } else {
            await refresh();
            push(
              'Email updated & verified. You’re all set!',
              'success'
            );
          }
        } catch {
          push('Invalid or expired link.', 'error');
        } finally {
          // cleanup URL
          url.searchParams.delete('changeEmailToken');
          window.location.replace(url.toString());
        }
      })();
    }

    // 2. verify-email
    const verifyToken = url.searchParams.get('verifyToken');
    if (verifyToken) {
      (async () => {
        try {
          const res = await fetch(
            `${API_BASE}/api/auth/verify-email`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ token: verifyToken }),
            }
          );

          if (!res.ok) throw new Error('HTTP ' + res.status);
          await refresh();
          push('Email verified. Thanks!', 'success');

          // nettoyer l’URL
          url.searchParams.delete('verifyToken');
          window.location.replace(url.toString());
        } catch {
          push('Invalid or expired verification link.', 'error');
          url.searchParams.delete('verifyToken');
          history.replaceState(null, '', url.toString());
        }
      })();
    }
  }, [push, refresh]);

  return (
    <PageContainer className="py-10">
      <Breadcrumbs />

      {/* Bannière "verify your email" globale en haut */}
      <VerifyEmailBanner />

      {/* Mobile jump */}
      <div className="mb-6 lg:hidden">
        <label htmlFor="settings-jump" className="sr-only">
          Jump to
        </label>
        <select
          id="settings-jump"
          className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
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

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        {/* sidebar */}
        <aside className="sticky top-24 hidden h-max lg:block">
          <SettingsSidebarNav items={items} />
        </aside>

        {/* main content */}
        <div className="space-y-10">
          {/* GENERAL */}
          <GeneralSection id="general" />

          {/* ACCOUNT (connexion / signup / logout / go to my account) */}
          <section id="account" className="space-y-4">
            <AccountAuthBox />
          </section>

          {/* BIG SECURITY BLOCK FUSIONNÉ */}
          <SecurityBlock id="security" />

          {/* Notifications */}
          <NotificationsSection id="notifications" />

          {/* Privacy */}
          <PrivacySection id="privacy" />

          {/* Data / export / delete (ton bloc DataComplianceSection existant) */}
          <DataComplianceSection id="data" />

          {/* Accessibility */}
          <AccessibilitySection id="accessibility" />
        </div>
      </div>
    </PageContainer>
  );
}

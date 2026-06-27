// src/pages/Settings.tsx
import * as React from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  Lock,
  Palette,
  Shield,
  UserCircle,
} from 'lucide-react';

import PageContainer from '@/components/ui/PageContainer';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { H3, Body, Button } from '@/components/ui';
import FormSection from '@/components/settings/FormSection';
import ToggleRow from '@/components/settings/ToggleRow';
import { ThemeToggle } from '@/components/ThemeToggle';
import SelectLang from '@/components/settings/SelectLang';
import AccountAuthBox from '@/components/settings/AccountAuthBox';
import AccountProfileForm from '@/components/account/AccountProfileForm';

import ChangePasswordForm from '@/components/settings/ChangePasswordForm';
import TwoFAPlaceholder from '@/components/settings/TwoFAPlaceholder';
import SessionsList from '@/components/settings/SessionsList';

import DataComplianceSection from '@/components/settings/DataComplianceSection';
import AccessibilitySection from '@/components/settings/AccessibilitySection';
import { useI18n } from '@/i18n/I18nContext';

import { useToast } from '@/components/ui/Toast';
import { useMe } from '@/contexts/MeContext';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { authClient, getEmailVerificationCallbackURL } from '@/lib/better-auth-client';

type SettingsCategoryId =
  | 'account'
  | 'security'
  | 'privacy'
  | 'data'
  | 'appearance'
  | 'notifications'
  | 'accessibility';

type SettingsCategory = {
  id: SettingsCategoryId;
  path: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

function resolveLabel(t: (key: string) => string, key: string, fallback: string) {
  const value = t(key);
  return value === key ? fallback : value;
}

function getSettingsCategories(t: (key: string) => string, signedIn: boolean): SettingsCategory[] {
  const accountOnly: SettingsCategory[] = [
    {
      id: 'account',
      path: '/settings/account',
      label: t('account'),
      description: t('settings_category_account_desc'),
      icon: UserCircle,
    },
  ];

  if (!signedIn) return accountOnly;

  return [
    ...accountOnly,
    {
      id: 'security',
      path: '/settings/security',
      label: t('security'),
      description: t('settings_category_security_desc'),
      icon: Shield,
    },
    {
      id: 'privacy',
      path: '/settings/privacy',
      label: t('privacy'),
      description: t('settings_category_privacy_desc'),
      icon: Lock,
    },
    {
      id: 'data',
      path: '/settings/data',
      label: t('data'),
      description: t('settings_category_data_desc'),
      icon: Database,
    },
    {
      id: 'appearance',
      path: '/settings/appearance',
      label: t('appearance'),
      description: t('settings_category_appearance_desc'),
      icon: Palette,
    },
    {
      id: 'notifications',
      path: '/settings/notifications',
      label: t('notifications'),
      description: t('settings_category_notifications_desc'),
      icon: Bell,
    },
    {
      id: 'accessibility',
      path: '/settings/accessibility',
      label: t('accessibility'),
      description: t('settings_category_accessibility_desc'),
      icon: Eye,
    },
  ];
}

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
      <H3 as="div" className="text-base font-semibold">
        {emailVerificationLabel}
      </H3>

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

        <p className="text-[11px] opacity-70">{emailHelpLabel}</p>
      </div>
    </div>
  );
}

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

  const storageKey = React.useMemo(() => (me?.id ? `notif:${me.id}` : 'notif'), [me?.id]);

  const [state, setState] = React.useState<NotifState>(() => {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as NotifState) : { emailNews: true, emailMentions: false, pushAll: false };
  });

  React.useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    setState(raw ? (JSON.parse(raw) as NotifState) : { emailNews: true, emailMentions: false, pushAll: false });
  }, [storageKey]);

  const [initial, setInitial] = React.useState<NotifState>(state);
  const dirty = JSON.stringify(state) !== JSON.stringify(initial);
  useUnsavedChanges(dirty);
  const [saved, setSaved] = React.useState(false);

  const pushSupported = typeof window !== 'undefined' && 'Notification' in window;
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

  const update = <K extends keyof NotifState>(k: K, v: NotifState[K]): void => {
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
          <Button variant="ghost" onClick={() => setState(initial)} disabled={!dirty}>
            {t('cancel')}
          </Button>
          <Button variant="primary" onClick={onSave} disabled={!dirty}>
            {t('save')}
          </Button>
          {saved && <span className="text-sm text-green-600 dark:text-green-400">{t('saved')}</span>}
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
          {!pushSupported && <div className="mt-1 text-xs text-neutral-500">{pushNotSupportedLabel}</div>}
          {pushSupported && permission === 'denied' && <div className="mt-1 text-xs text-neutral-500">{pushDeniedLabel}</div>}
        </li>
      </ul>
    </FormSection>
  );
}

function PrivacySection({ id }: { id?: string }): React.JSX.Element {
  const { t } = useI18n();
  const { push } = useToast();
  const { me } = useMe();

  type Visibility = 'public' | 'private';
  type PrivacyState = { profileVisibility: Visibility; tracking: boolean };

  const storageKey = React.useMemo(() => (me?.id ? `privacy:${me.id}` : 'privacy'), [me?.id]);

  const [state, setState] = React.useState<PrivacyState>(() => {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as PrivacyState) : { profileVisibility: 'public', tracking: false };
  });

  React.useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    setState(raw ? (JSON.parse(raw) as PrivacyState) : { profileVisibility: 'public', tracking: false });
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
          <Button variant="ghost" onClick={() => setState(initial)} disabled={!dirty}>
            {t('cancel')}
          </Button>
          <Button variant="primary" onClick={onSave} disabled={!dirty}>
            {t('save')}
          </Button>
          {saved && <span className="text-sm text-green-600 dark:text-green-400">{t('saved')}</span>}
        </div>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <H3 as="div" className="mb-2 text-base">
            {t('profile_visibility')}
          </H3>
          <Body className="mb-3">{t('profile_visibility_desc')}</Body>
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
                  onChange={(e) => setState((s) => ({ ...s, profileVisibility: e.target.value as Visibility }))}
                />
                <span className="capitalize">{t(opt === 'public' ? 'visibility_public' : 'visibility_private')}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <H3 as="div" className="mb-2 text-base">
            {t('analytics_tracking')}
          </H3>
          <Body className="mb-3">{t('analytics_tracking_desc')}</Body>
          <ToggleRow label={t('analytics_allow')} value={state.tracking} onChange={(v: boolean) => setState((s) => ({ ...s, tracking: v }))} />
        </div>
      </div>
    </FormSection>
  );
}

function AppearanceSection({ id }: { id?: string }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <FormSection id={id} title={t('appearance')} description={t('settings_category_appearance_desc')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-surface-200 p-4 dark:border-neutral-800">
          <H3 as="div" className="mb-2 text-base">
            {t('theme')}
          </H3>
          <Body className="mb-3">{t('theme_desc')}</Body>
          <ThemeToggle />
        </div>

        <div className="rounded-xl border border-surface-200 p-4 dark:border-neutral-800">
          <H3 as="div" className="mb-2 text-base">
            {t('language')}
          </H3>
          <Body className="mb-1">{t('language_desc')}</Body>
          <Body className="mb-3 text-xs opacity-70">{t('changes_apply_immediately') || 'Changes apply immediately.'}</Body>
          <SelectLang />
        </div>
      </div>
    </FormSection>
  );
}

function SecurityBlock({ id }: { id?: string }): React.JSX.Element {
  const { t } = useI18n();
  const securityTitle = resolveLabel(t, 'settings_security', 'Security');
  const securityDesc = resolveLabel(t, 'settings_security_desc', 'Email verification, password, sessions and account protection.');
  return (
    <FormSection id={id} title={securityTitle} description={securityDesc}>
      <div className="space-y-5">
        <div className="settings-subcard">
          <EmailAndVerificationBlock />
        </div>
        <ChangePasswordForm />
        <TwoFAPlaceholder />
        <SessionsList />
      </div>
    </FormSection>
  );
}

function SettingsIndex({ categories, loading }: { categories: SettingsCategory[]; loading: boolean }): React.JSX.Element {
  const { t } = useI18n();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6">
        <H3 as="h1" className="text-2xl sm:text-3xl">
          {t('settings_title')}
        </H3>
        <Body className="mt-2 max-w-2xl">{t('settings_home_lead')}</Body>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-surface-200 bg-[var(--bg)] p-2 shadow-soft dark:border-neutral-800">
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex min-h-[68px] animate-pulse items-center gap-3 rounded-xl px-3 py-3">
              <div className="h-10 w-10 rounded-full bg-neutral-200 dark:bg-neutral-800" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 rounded bg-neutral-200 dark:bg-neutral-800" />
                <div className="h-3 w-56 max-w-full rounded bg-neutral-200 dark:bg-neutral-800" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <nav aria-label={t('settings_title')} className="overflow-hidden rounded-2xl border border-surface-200 bg-[var(--bg)] shadow-soft dark:border-neutral-800">
          {categories.map((category, index) => {
            const Icon = category.icon;
            return (
              <Link
                key={category.id}
                to={category.path}
                className={`flex min-h-[72px] items-center gap-3 px-4 py-3 transition hover:bg-black/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:hover:bg-white/[0.06] dark:focus-visible:ring-white sm:px-5 ${
                  index > 0 ? 'border-t border-surface-200 dark:border-neutral-800' : ''
                }`}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-neutral-950 dark:text-white">{category.label}</span>
                  <span className="mt-0.5 block text-sm text-neutral-600 dark:text-neutral-400">{category.description}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-neutral-400" strokeWidth={2} />
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

function SettingsCategoryNav({ categories, activeId }: { categories: SettingsCategory[]; activeId: SettingsCategoryId }): React.JSX.Element {
  return (
    <nav className="space-y-1" aria-label="Settings sections">
      {categories.map((category) => {
        const Icon = category.icon;
        const active = category.id === activeId;
        return (
          <Link
            key={category.id}
            to={category.path}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-[42px] items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
              active
                ? 'bg-black/5 font-semibold text-neutral-950 dark:bg-white/10 dark:text-white'
                : 'text-neutral-700 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span className="truncate">{category.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function CategoryContent({ categoryId }: { categoryId: SettingsCategoryId }): React.JSX.Element {
  const { me } = useMe();
  const signedIn = Boolean(me);

  if (!signedIn && categoryId !== 'account') return <Navigate to="/settings/account" replace />;

  if (categoryId === 'account') {
    return (
      <section id="account" className="space-y-5">
        {signedIn && <AccountProfileForm />}
        <AccountAuthBox />
      </section>
    );
  }

  if (categoryId === 'security') return <SecurityBlock id="security" />;
  if (categoryId === 'privacy') return <PrivacySection id="privacy" />;
  if (categoryId === 'data') return <DataComplianceSection id="data" />;
  if (categoryId === 'appearance') return <AppearanceSection id="appearance" />;
  if (categoryId === 'notifications') return <NotificationsSection id="notifications" />;
  return <AccessibilitySection id="accessibility" />;
}

function SettingsCategoryPage({ categories, categoryId }: { categories: SettingsCategory[]; categoryId: SettingsCategoryId }): React.JSX.Element {
  const { t } = useI18n();
  const active = categories.find((categoryItem) => categoryItem.id === categoryId);
  if (!active) return <Navigate to="/settings" replace />;

  const ActiveIcon = active.icon;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="sticky top-24 hidden h-max lg:block">
        <SettingsCategoryNav categories={categories} activeId={categoryId} />
      </aside>

      <div className="min-w-0">
        <Link
          to="/settings"
          className="mb-4 inline-flex min-h-[40px] items-center gap-2 rounded-full px-2 text-sm font-medium text-neutral-700 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10 lg:hidden"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          {t('settings_back')}
        </Link>

        <div className="mb-5 flex items-start gap-3">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
            <ActiveIcon className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <H3 as="h1" className="text-2xl sm:text-3xl">
              {active.label}
            </H3>
            <Body className="mt-1 max-w-2xl">{active.description}</Body>
          </div>
        </div>

        <CategoryContent categoryId={categoryId} />
      </div>
    </div>
  );
}

function normalizeCategoryParam(category?: string): SettingsCategoryId | null {
  if (!category) return null;
  if (category === 'general') return 'appearance';
  if (
    category === 'account' ||
    category === 'security' ||
    category === 'privacy' ||
    category === 'data' ||
    category === 'appearance' ||
    category === 'notifications' ||
    category === 'accessibility'
  ) {
    return category;
  }
  return null;
}

export default function Settings(): React.JSX.Element {
  const { category } = useParams<{ category?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const { me, loading } = useMe();
  const signedIn = Boolean(me);
  const categoryId = normalizeCategoryParam(category);

  const categories = React.useMemo(() => getSettingsCategories(t, signedIn), [t, locale, signedIn]);

  React.useEffect(() => {
    if (category || !location.hash) return;
    const legacyCategory = normalizeCategoryParam(location.hash.replace('#', ''));
    if (legacyCategory) navigate(`/settings/${legacyCategory}`, { replace: true });
  }, [category, location.hash, navigate]);

  if (category && !categoryId) return <Navigate to="/settings" replace />;

  return (
    <PageContainer className="py-8 sm:py-10">
      <Breadcrumbs
        trail={
          categoryId
            ? [
                { to: '/', label: t('nav_home') || 'Home' },
                { to: '/settings', label: t('settings_title') || 'Settings' },
                { label: categories.find((item) => item.id === categoryId)?.label || t('settings_title') },
              ]
            : undefined
        }
      />

      {categoryId ? <SettingsCategoryPage categories={categories} categoryId={categoryId} /> : <SettingsIndex categories={categories} loading={loading} />}
    </PageContainer>
  );
}

import { Link, type Href, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, Check, ChevronLeft, Database, Eye, Lock, Palette, Shield, UserCircle } from 'lucide-react-native';

import { Button, Card, Input, Screen } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useSettingsPreferences, type ThemePreference } from '@/context/SettingsPreferencesContext';
import { Brand, FontSize, Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  changeAccountPassword,
  checkUsernameAvailable,
  deleteAccountSession,
  deleteOtherAccountSessions,
  fetchAccountSessions,
  requestAccountEmailChange,
  requestAccountPasswordReset,
  updateAccountProfile,
  type AccountSession,
} from '@/lib/api';

type SettingsCategory = 'account' | 'security' | 'privacy' | 'data' | 'appearance' | 'notifications' | 'accessibility';
type CategoryMeta = { title: string; subtitle: string; icon: typeof UserCircle };

const categoryMeta: Record<SettingsCategory, CategoryMeta> = {
  account: { title: 'Account', subtitle: 'Profile, email, verification and account access.', icon: UserCircle },
  security: { title: 'Security', subtitle: 'Email verification, password, sessions and account protection.', icon: Shield },
  privacy: { title: 'Privacy', subtitle: 'Profile visibility and tracking preferences.', icon: Lock },
  data: { title: 'Data', subtitle: 'Local export, data and local deletion.', icon: Database },
  appearance: { title: 'Appearance', subtitle: 'Theme.', icon: Palette },
  notifications: { title: 'Notifications', subtitle: 'Email and push preferences.', icon: Bell },
  accessibility: { title: 'Accessibility', subtitle: 'Contrast preference.', icon: Eye },
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernameRegex = /^[a-z0-9_]{3,20}$/i;

function normalizeCategory(value: string): SettingsCategory | null {
  if (value === 'general') return 'appearance';
  if (value === 'account' || value === 'security' || value === 'privacy' || value === 'data' || value === 'appearance' || value === 'notifications' || value === 'accessibility') return value;
  return null;
}

function passwordError(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Add at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Add at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Add at least one number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Add at least one special character.';
  return null;
}

function userLabel(user: ReturnType<typeof useAuth>['user']): string {
  return user?.displayName?.trim() || user?.name?.trim() || user?.username?.trim() || user?.email?.split('@')[0] || 'Account';
}

function PageHeader({ meta }: { meta: CategoryMeta }) {
  const colors = useTheme();
  const Icon = meta.icon;

  return (
    <View style={styles.headerStack}>
      <Link href={'/settings' as Href} asChild>
        <Pressable style={styles.backLink}>
          <ChevronLeft size={16} color={colors.textSecondary} strokeWidth={2} />
          <Text style={[styles.backText, { color: colors.textSecondary }]}>Back to settings</Text>
        </Pressable>
      </Link>
      <View style={styles.categoryHeader}>
        <View style={[styles.categoryIcon, { backgroundColor: colors.backgroundSubtle }]}>
          <Icon size={22} color={colors.text} />
        </View>
        <View style={styles.flexOne}>
          <Text style={[styles.screenHeading, { color: colors.text, fontFamily: Fonts.display }]}>{meta.title}</Text>
          <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>{meta.subtitle}</Text>
        </View>
      </View>
    </View>
  );
}

function Panel({ children, footer, padded = true }: { children: ReactNode; footer?: ReactNode; padded?: boolean }) {
  const colors = useTheme();
  return (
    <Card style={styles.panel} padded={padded}>
      <View style={styles.sectionBody}>{children}</View>
      {footer ? <View style={[styles.sectionFooter, { borderTopColor: colors.borderSubtle }]}>{footer}</View> : null}
    </Card>
  );
}

function SubCard({ children, dashed = false }: { children: ReactNode; dashed?: boolean }) {
  const colors = useTheme();
  return <View style={[styles.subCard, { borderColor: colors.borderSubtle, backgroundColor: colors.backgroundSubtle }, dashed ? styles.dashed : null]}>{children}</View>;
}

function InlineBadge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' }) {
  const colors = useTheme();
  const palette = tone === 'success' ? { bg: 'rgba(5,150,105,0.12)', fg: colors.success } : tone === 'warning' ? { bg: colors.scheme === 'dark' ? 'rgba(251,191,36,0.16)' : 'rgba(217,119,6,0.12)', fg: colors.scheme === 'dark' ? '#FBBF24' : '#B45309' } : { bg: colors.backgroundSubtle, fg: colors.textSecondary };
  return <Text style={[styles.badge, { backgroundColor: palette.bg, color: palette.fg }]}>{label}</Text>;
}

function ToggleRow({ label, sublabel, value, onChange, disabled = false }: { label: string; sublabel?: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const colors = useTheme();
  return (
    <Pressable disabled={disabled} onPress={() => onChange(!value)} style={({ pressed }) => [styles.toggleRow, pressed ? styles.pressed : null, disabled ? styles.disabled : null]}>
      <View style={styles.toggleCopy}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{label}</Text>
        {sublabel ? <Text style={[styles.rowDesc, { color: colors.textMuted }]}>{sublabel}</Text> : null}
      </View>
      <View style={[styles.switchTrack, { backgroundColor: value ? Brand.blue : colors.border }]}><View style={[styles.switchKnob, value ? styles.switchKnobOn : null]} /></View>
    </Pressable>
  );
}

function RadioOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.radioOption, { borderColor: colors.borderSubtle }, pressed ? styles.pressed : null]}>
      <View style={[styles.radioCircle, { borderColor: selected ? Brand.blue : colors.border }]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      <Text style={[styles.rowTitle, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function ChoicePill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.choicePill, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.backgroundElevated }]}>
      <Text style={[styles.choiceText, { color: selected ? colors.background : colors.text }]}>{label}</Text>
      {selected ? <Check size={14} color={colors.background} /> : null}
    </Pressable>
  );
}

function GuestAuthBlock() {
  const colors = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function login() {
    setError(null);
    setStatus(null);
    if (!emailRegex.test(email.trim())) return setError('Please enter a valid email.');
    if (!password) return setError('Please enter your password.');
    try {
      setBusy(true);
      const result = await signIn(email.trim().toLowerCase(), password);
      setPassword('');
      if (!result.ok || !result.user) return setError(result.errorMessage || 'Incorrect email or password.');
      setStatus('Connected');
    } catch {
      setPassword('');
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <Text style={[styles.subTitle, { color: colors.text }]}>Sign in</Text>
      <Text style={[styles.subDesc, { color: colors.textSecondary }]}>Access your Epion account.</Text>
      <View style={styles.formGap}>
        <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" />
        <Input label="Password" value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry textContentType="password" />
        {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
        {status ? <Text style={[styles.successText, { color: colors.success }]}>{status}</Text> : null}
        <View style={styles.buttonRow}>
          <Button title="Sign in" onPress={login} loading={busy} rounded />
          <Link href={'/reset-password' as Href} asChild><Pressable style={styles.linkButton}><Text style={[styles.linkButtonText, { color: colors.text }]}>Forgot password?</Text></Pressable></Link>
        </View>
      </View>
    </Panel>
  );
}

function AccountSection() {
  const colors = useTheme();
  const { user, loading, signOut, refreshSession } = useAuth();
  const [displayNameValue, setDisplayNameValue] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayNameValue(user?.displayName ?? user?.name ?? '');
    setUsername(user?.username ?? '');
    setPhone(user?.phone ?? '');
    setError(null);
    setSaved(false);
  }, [user]);

  const dirty = Boolean(user) && (displayNameValue !== (user?.displayName ?? user?.name ?? '') || username !== (user?.username ?? '') || phone !== (user?.phone ?? ''));

  async function saveProfile() {
    setError(null);
    setSaved(false);
    if (displayNameValue.trim().length < 2) return setError('Display name is required.');
    if (!usernameRegex.test(username.trim())) return setError('Username invalid.');
    try {
      setSaving(true);
      await updateAccountProfile({ displayName: displayNameValue.trim(), username: username.trim(), phone: phone.trim() || null, avatarUrl: user?.avatarUrl ?? null });
      await refreshSession();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (profileError) {
      setError(profileError instanceof Error && profileError.message.includes('409') ? 'This username is already taken.' : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  }

  async function onUsernameBlur() {
    const trimmed = username.trim();
    if (!usernameRegex.test(trimmed) || trimmed === (user?.username ?? '')) return;
    try {
      setCheckingUsername(true);
      if (!(await checkUsernameAvailable(trimmed))) setError('This username is already taken.');
    } catch {
      // Helpful, not blocking, same spirit as the web check.
    } finally {
      setCheckingUsername(false);
    }
  }

  if (loading && !user) return <Panel><ActivityIndicator size="small" color={colors.textMuted} /></Panel>;
  if (!user) return <GuestAuthBlock />;

  return (
    <Panel footer={<View style={styles.footerActions}><Button title={saving ? 'Saving...' : 'Save'} onPress={saveProfile} disabled={!dirty || saving} loading={saving} rounded /><Button title="Logout" onPress={() => void signOut()} variant="ghost" rounded />{saved ? <Text style={[styles.successText, { color: colors.success }]}>Saved</Text> : null}</View>}>
      <View style={styles.profileGrid}>
        <View style={styles.avatarBlock}><View style={[styles.avatar, { backgroundColor: Brand.turquoise }]}><Text style={styles.avatarText}>{userLabel(user).slice(0, 1).toUpperCase()}</Text></View><View style={styles.avatarCopy}><Text style={[styles.subTitle, { color: colors.text }]}>Avatar</Text><Text style={[styles.subDesc, { color: colors.textSecondary }]}>Avatar uses the same profile image field as the web account.</Text></View></View>
        <View style={styles.formGap}>
          <Text style={[styles.label, { color: colors.text }]}>Email</Text>
          <View style={styles.inlineWrap}><Text style={[styles.readOnly, { color: colors.text, borderColor: colors.borderSubtle }]}>{user.email ?? 'unknown@email.com'}</Text><InlineBadge label={user.emailVerified ? 'Verified' : 'Unverified'} tone={user.emailVerified ? 'success' : 'warning'} /></View>
          <Input label="Display name" value={displayNameValue} onChangeText={setDisplayNameValue} placeholder="Jane Doe" />
          <Input label="Username" value={username} onChangeText={setUsername} onBlur={onUsernameBlur} placeholder="username" autoCapitalize="none" />
          <Text style={[styles.helper, { color: colors.textMuted }]}>{checkingUsername ? 'Checking...' : '3-20 characters, letters, numbers and underscores.'}</Text>
          <Input label="Phone" value={phone} onChangeText={setPhone} placeholder="Phone" keyboardType="phone-pad" />
          {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
        </View>
      </View>
    </Panel>
  );
}

function EmailVerificationBlock() {
  const colors = useTheme();
  const { user } = useAuth();
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function requestChange() {
    setError(null); setMessage(null);
    const trimmed = newEmail.trim().toLowerCase();
    if (!emailRegex.test(trimmed)) return setError('Please enter a valid email.');
    try { setBusy(true); await requestAccountEmailChange(trimmed); setNewEmail(''); setMessage('If this address is valid, we sent a verification link.'); }
    catch { setError('Could not send verification email. Try again.'); }
    finally { setBusy(false); }
  }

  return <SubCard><Text style={[styles.subTitle, { color: colors.text }]}>Email verification</Text><View style={styles.inlineWrap}><Text style={[styles.readOnly, { color: colors.text, borderColor: colors.borderSubtle }]}>{user?.email ?? 'unknown@email.com'}</Text><InlineBadge label={user?.emailVerified ? 'Verified' : 'Unverified'} tone={user?.emailVerified ? 'success' : 'warning'} /></View><View style={styles.formGap}><Input label="Change email" value={newEmail} onChangeText={setNewEmail} placeholder="new@email.com" autoCapitalize="none" keyboardType="email-address" /><Button title={busy ? 'Sending...' : 'Send secure link'} onPress={requestChange} disabled={!newEmail || busy} loading={busy} rounded /><Text style={[styles.helper, { color: colors.textMuted }]}>We'll send a confirmation link to the new address before applying the change.</Text>{message ? <Text style={[styles.successText, { color: colors.success }]}>{message}</Text> : null}{error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}</View></SubCard>;
}

function ChangePasswordBlock() {
  const colors = useTheme();
  const { user, refreshSession } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nextError = next ? passwordError(next) : null;
  const canSubmit = Boolean(current && next && confirm && !nextError && next === confirm && !busy);

  async function updatePassword() {
    setError(null); setMessage(null);
    if (!current) return setError('Please enter your current password.');
    if (nextError) return setError(nextError);
    if (next !== confirm) return setError('Passwords do not match.');
    try { setBusy(true); await changeAccountPassword(current, next); await refreshSession(); setCurrent(''); setNext(''); setConfirm(''); setMessage('Password updated successfully.'); }
    catch { setError('Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  }

  async function sendResetLink() {
    if (!user?.email) return;
    try { setLinkBusy(true); await requestAccountPasswordReset(user.email); setMessage('If this email exists, a reset link has been generated.'); }
    catch { setMessage('If this email exists, a reset link has been generated.'); }
    finally { setLinkBusy(false); }
  }

  return <SubCard><Text style={[styles.subTitle, { color: colors.text }]}>Change password</Text><Text style={[styles.subDesc, { color: colors.textSecondary }]}>Update your password and keep your account access current.</Text><View style={styles.formGap}><Input label="Current password" value={current} onChangeText={setCurrent} placeholder="********" secureTextEntry textContentType="password" /><Input label="New password" value={next} onChangeText={setNext} placeholder="At least 8 characters" secureTextEntry textContentType="newPassword" /><Text style={[styles.helper, { color: colors.textMuted }]}>8+ chars, 1 upper, 1 lower, 1 number, 1 special.</Text><Input label="Confirm new password" value={confirm} onChangeText={setConfirm} placeholder="Repeat new password" secureTextEntry textContentType="newPassword" />{message ? <Text style={[styles.successText, { color: colors.success }]}>{message}</Text> : null}{error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}<Button title={busy ? 'Saving...' : 'Update password'} onPress={updatePassword} disabled={!canSubmit} loading={busy} rounded /></View><SubCard><Text style={[styles.smallTitle, { color: colors.text }]}>Can't remember your current password?</Text><Text style={[styles.subDesc, { color: colors.textSecondary }]}>We can email you a secure link to set a new password.</Text><Button title={linkBusy ? 'Sending...' : 'Email me a secure link'} onPress={sendResetLink} disabled={linkBusy || !user?.email} loading={linkBusy} rounded /></SubCard></SubCard>;
}

function SessionsBlock() {
  const colors = useTheme();
  const { refreshSession } = useAuth();
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAll, setBusyAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async (silent = false) => {
    try { if (!silent) setLoading(true); setError(null); setSessions(await fetchAccountSessions()); }
    catch { setError('Failed to load sessions'); }
    finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  async function revokeOne(id: string) {
    const previous = sessions;
    setSessions(previous.filter((session) => session.id !== id));
    try { const result = await deleteAccountSession(id); if (result.current) await refreshSession(); }
    catch { setSessions(previous); setError('Failed to revoke'); }
  }

  async function revokeOthers() {
    try { setBusyAll(true); await deleteOtherAccountSessions(); await loadSessions(true); }
    catch { setError('Failed to revoke sessions.'); }
    finally { setBusyAll(false); }
  }

  async function refresh() { try { setRefreshing(true); await loadSessions(true); } finally { setRefreshing(false); } }

  return <SubCard><View style={styles.splitHeader}><View style={styles.flexOne}><Text style={[styles.subTitle, { color: colors.text }]}>Active sessions</Text><Text style={[styles.subDesc, { color: colors.textSecondary }]}>Sign out other devices.</Text></View><View style={styles.buttonRowRight}><Button title={refreshing ? '...' : 'Refresh'} onPress={refresh} variant="ghost" size="sm" disabled={refreshing} rounded /><Button title={busyAll ? '...' : 'Sign out of other sessions'} onPress={revokeOthers} size="sm" disabled={busyAll} loading={busyAll} rounded /></View></View>{loading ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}{error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}{!loading && sessions.length === 0 ? <Text style={[styles.helper, { color: colors.textMuted }]}>No other sessions.</Text> : null}<View style={styles.listStack}>{sessions.map((session) => <View key={session.id} style={[styles.sessionItem, { borderColor: colors.borderSubtle }]}><View style={styles.flexOne}><Text style={[styles.rowTitle, { color: colors.text }]}>{session.current ? 'This device' : 'Session'}</Text><Text style={[styles.rowDesc, { color: colors.textMuted }]}>Last active: {new Date(session.lastActiveAt ?? session.createdAt).toLocaleString()}</Text></View>{session.current ? <InlineBadge label="This device" /> : <Button title="Revoke" onPress={() => void revokeOne(session.id)} variant="ghost" size="sm" rounded />}</View>)}</View></SubCard>;
}

function SecuritySection() {
  const colors = useTheme();
  const { user } = useAuth();
  if (!user) return <Panel><Text style={[styles.subDesc, { color: colors.textSecondary }]}>Sign in to manage security.</Text></Panel>;
  return <View style={styles.sectionStack}><EmailVerificationBlock /><ChangePasswordBlock /><SubCard><View style={styles.splitHeader}><View style={styles.flexOne}><Text style={[styles.subTitle, { color: colors.text }]}>Two-factor authentication</Text><Text style={[styles.subDesc, { color: colors.textSecondary }]}>Add an extra protection step to your account.</Text></View><Button title="Enable 2FA soon" onPress={() => {}} variant="ghost" disabled rounded /></View><SubCard dashed><Text style={[styles.subDesc, { color: colors.textSecondary }]}>Not available yet.</Text></SubCard></SubCard><SessionsBlock /></View>;
}

function PrivacySection() {
  const colors = useTheme();
  const { privacy, setPrivacy } = useSettingsPreferences();
  const [draft, setDraft] = useState(privacy);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(privacy);
  function save() { setPrivacy(draft); setSaved(true); setTimeout(() => setSaved(false), 1500); }
  return <Panel footer={<View style={styles.footerActions}><Button title="Cancel" onPress={() => setDraft(privacy)} variant="ghost" disabled={!dirty} rounded /><Button title="Save" onPress={save} disabled={!dirty} rounded />{saved ? <Text style={[styles.successText, { color: colors.success }]}>Saved</Text> : null}</View>}><View style={styles.sectionStack}><SubCard><Text style={[styles.subTitle, { color: colors.text }]}>Profile visibility</Text><Text style={[styles.subDesc, { color: colors.textSecondary }]}>Choose whether your profile is visible to other Epion users.</Text><RadioOption label="Public" selected={draft.profileVisibility === 'public'} onPress={() => setDraft((current) => ({ ...current, profileVisibility: 'public' }))} /><RadioOption label="Private" selected={draft.profileVisibility === 'private'} onPress={() => setDraft((current) => ({ ...current, profileVisibility: 'private' }))} /></SubCard><SubCard><Text style={[styles.subTitle, { color: colors.text }]}>Analytics tracking</Text><Text style={[styles.subDesc, { color: colors.textSecondary }]}>Allow product analytics to improve Epion.</Text><ToggleRow label="Allow analytics" value={draft.tracking} onChange={(tracking) => setDraft((current) => ({ ...current, tracking }))} /></SubCard></View></Panel>;
}

function DataSection() {
  const colors = useTheme();
  const { exportLocalPreferences, resetLocalPreferences } = useSettingsPreferences();
  const [message, setMessage] = useState<string | null>(null);
  function exportData() { setMessage(JSON.stringify(exportLocalPreferences(), null, 2)); }
  function deleteLocalData() { Alert.alert('Delete local data', 'This clears local mobile preferences on this device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete local data', style: 'destructive', onPress: () => { resetLocalPreferences(); setMessage('Local preference data deleted.'); } }]); }
  return <Panel><View style={styles.buttonRow}><Button title="Export JSON" onPress={exportData} variant="secondary" rounded /><Button title="Delete local data" onPress={deleteLocalData} variant="ghost" rounded /></View>{message ? <Text style={[styles.exportBox, { color: colors.textSecondary, borderColor: colors.borderSubtle }]}>{message}</Text> : null}</Panel>;
}

function AppearanceSection() {
  const colors = useTheme();
  const { themePreference, setThemePreference } = useSettingsPreferences();
  return <Panel><SubCard><Text style={[styles.subTitle, { color: colors.text }]}>Theme</Text><Text style={[styles.subDesc, { color: colors.textSecondary }]}>Choose the display mode for Epion.</Text><View style={styles.segmentRow}>{(['system', 'light', 'dark'] as const).map((option: ThemePreference) => <ChoicePill key={option} label={option === 'system' ? 'Auto' : option} selected={themePreference === option} onPress={() => setThemePreference(option)} />)}</View></SubCard></Panel>;
}

function NotificationsSection() {
  const colors = useTheme();
  const { notifications, setNotifications } = useSettingsPreferences();
  const [draft, setDraft] = useState(notifications);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(notifications);
  function save() { setNotifications(draft); setSaved(true); setTimeout(() => setSaved(false), 1500); }
  return <Panel footer={<View style={styles.footerActions}><Button title="Cancel" onPress={() => setDraft(notifications)} variant="ghost" disabled={!dirty} rounded /><Button title="Save" onPress={save} disabled={!dirty} rounded />{saved ? <Text style={[styles.successText, { color: colors.success }]}>Saved</Text> : null}</View>}><View style={styles.dividedList}><ToggleRow label="Email news" sublabel="Product updates and Epion news." value={draft.emailNews} onChange={(emailNews) => setDraft((current) => ({ ...current, emailNews }))} /><ToggleRow label="Email mentions" sublabel="Email me when someone mentions me." value={draft.emailMentions} onChange={(emailMentions) => setDraft((current) => ({ ...current, emailMentions }))} /><ToggleRow label="Push notifications" sublabel="All important activity on this device." value={draft.pushAll} onChange={(pushAll) => setDraft((current) => ({ ...current, pushAll }))} /></View></Panel>;
}

function AccessibilitySection() {
  const { accessibility, setAccessibility } = useSettingsPreferences();
  return <Panel><ToggleRow label="Higher contrast" sublabel="Increase text and border contrast across the mobile app." value={accessibility.contrast} onChange={(contrast) => setAccessibility({ contrast })} /></Panel>;
}

export default function SettingsCategoryScreen() {
  const colors = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ category?: string | string[] }>();
  const rawCategory = useMemo(() => (Array.isArray(params.category) ? params.category[0] : params.category) ?? '', [params.category]);
  const category = normalizeCategory(rawCategory);

  if (!category) return <Screen title="" subtitle=""><PageHeader meta={{ title: 'Settings', subtitle: 'This settings section does not exist.', icon: UserCircle }} /><Panel><Text style={{ color: colors.textSecondary }}>Choose another settings section.</Text></Panel></Screen>;

  const meta = categoryMeta[category];
  if (!user && category !== 'account') return <Screen title="" subtitle=""><PageHeader meta={meta} /><Panel><Text style={[styles.subDesc, { color: colors.textSecondary }]}>Like the web app, this settings section requires an active account session.</Text><Link href={'/settings/account' as Href} asChild><Pressable><Text style={[styles.linkButtonText, { color: colors.text }]}>Go to Account</Text></Pressable></Link></Panel></Screen>;

  return <Screen title="" subtitle=""><PageHeader meta={meta} />{category === 'account' ? <AccountSection /> : null}{category === 'security' ? <SecuritySection /> : null}{category === 'privacy' ? <PrivacySection /> : null}{category === 'data' ? <DataSection /> : null}{category === 'appearance' ? <AppearanceSection /> : null}{category === 'notifications' ? <NotificationsSection /> : null}{category === 'accessibility' ? <AccessibilitySection /> : null}</Screen>;
}

const styles = StyleSheet.create({
  headerStack: { gap: Spacing.lg },
  backLink: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: Spacing.xs, minHeight: 40, paddingRight: Spacing.md },
  backText: { fontSize: FontSize.base, fontWeight: '600' },
  categoryHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.md },
  categoryIcon: { alignItems: 'center', borderRadius: Radius.full, height: 40, justifyContent: 'center', width: 40 },
  screenHeading: { fontSize: FontSize['3xl'], fontWeight: '600' },
  panel: { gap: Spacing.lg, padding: Spacing.xl },
  sectionDesc: { fontSize: FontSize.base, lineHeight: 21 },
  sectionBody: { gap: Spacing.lg },
  sectionFooter: { borderTopWidth: 1, paddingTop: Spacing.lg },
  sectionStack: { gap: Spacing.lg },
  subCard: { borderRadius: Radius.lg, borderWidth: 1, gap: Spacing.md, padding: Spacing.lg },
  dashed: { borderStyle: 'dashed' },
  subTitle: { fontSize: FontSize.md, fontWeight: '700' },
  smallTitle: { fontSize: FontSize.base, fontWeight: '700' },
  subDesc: { fontSize: FontSize.base, lineHeight: 21 },
  formGap: { gap: Spacing.md },
  label: { fontSize: FontSize.base, fontWeight: '600' },
  readOnly: { borderRadius: Radius.lg, borderWidth: 1, fontSize: FontSize.base, paddingHorizontal: Spacing.md, paddingVertical: 9 },
  helper: { fontSize: FontSize.xs, lineHeight: 17 },
  errorText: { fontSize: FontSize.base, lineHeight: 20 },
  successText: { fontSize: FontSize.base, fontWeight: '600' },
  buttonRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  buttonRowRight: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'flex-end' },
  footerActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'flex-end' },
  linkButton: { borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 10 },
  linkButtonText: { fontSize: FontSize.base, fontWeight: '700' },
  profileGrid: { gap: Spacing.xl },
  avatarBlock: { alignItems: 'center', flexDirection: 'row', gap: Spacing.lg },
  avatar: { alignItems: 'center', borderRadius: Radius.full, height: 80, justifyContent: 'center', width: 80 },
  avatarText: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  avatarCopy: { flex: 1, gap: 4 },
  inlineWrap: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  badge: { borderRadius: Radius.full, fontSize: FontSize.xs, fontWeight: '700', overflow: 'hidden', paddingHorizontal: Spacing.sm, paddingVertical: 5 },
  splitHeader: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, justifyContent: 'space-between' },
  flexOne: { flex: 1, minWidth: 180 },
  listStack: { gap: Spacing.sm },
  sessionItem: { alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1, flexDirection: 'row', gap: Spacing.md, padding: Spacing.md },
  toggleRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.lg, justifyContent: 'space-between', minHeight: 54 },
  toggleCopy: { flex: 1, gap: 2 },
  rowTitle: { fontSize: FontSize.base, fontWeight: '600' },
  rowDesc: { fontSize: FontSize.sm, lineHeight: 19 },
  switchTrack: { borderRadius: Radius.full, height: 24, justifyContent: 'center', paddingHorizontal: 2, width: 44 },
  switchKnob: { backgroundColor: '#FFFFFF', borderRadius: Radius.full, height: 20, width: 20 },
  switchKnobOn: { transform: [{ translateX: 20 }] },
  radioOption: { alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1, flexDirection: 'row', gap: Spacing.md, padding: Spacing.md },
  radioCircle: { alignItems: 'center', borderRadius: Radius.full, borderWidth: 2, height: 20, justifyContent: 'center', width: 20 },
  radioDot: { backgroundColor: Brand.blue, borderRadius: Radius.full, height: 10, width: 10 },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  choicePill: { alignItems: 'center', borderRadius: Radius.full, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 9 },
  choiceText: { fontSize: FontSize.base, fontWeight: '700', textTransform: 'capitalize' },
  dividedList: { gap: Spacing.lg },
  exportBox: { borderRadius: Radius.lg, borderWidth: 1, fontFamily: Fonts.mono, fontSize: FontSize.xs, lineHeight: 18, marginTop: Spacing.md, padding: Spacing.md },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.5 },
});

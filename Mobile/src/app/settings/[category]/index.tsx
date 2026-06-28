import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionLink, Screen, Section, StateBox } from '@/components/screen';
import { useAuth } from '@/context/AuthContext';
import { fetchAccountSessions, type AccountSession } from '@/lib/api';

type SettingsCategory = 'account' | 'security' | 'privacy' | 'data' | 'appearance' | 'notifications' | 'accessibility';

type ToggleProps = {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

const labels: Record<SettingsCategory, { title: string; subtitle: string }> = {
  account: { title: 'Account', subtitle: 'Profil, email et acces au compte.' },
  security: { title: 'Security', subtitle: 'Verification email, mot de passe et sessions.' },
  privacy: { title: 'Privacy', subtitle: 'Visibilite du profil et preferences de suivi.' },
  data: { title: 'Data', subtitle: 'Export local et suppression de donnees locales.' },
  appearance: { title: 'Appearance', subtitle: 'Theme et langue en version mobile simple.' },
  notifications: { title: 'Notifications', subtitle: 'Preferences de notification locales.' },
  accessibility: { title: 'Accessibility', subtitle: 'Options de lisibilite mobile.' },
};

function normalizeCategory(value: string): SettingsCategory | null {
  if (value === 'general') return 'appearance';
  if (
    value === 'account' ||
    value === 'security' ||
    value === 'privacy' ||
    value === 'data' ||
    value === 'appearance' ||
    value === 'notifications' ||
    value === 'accessibility'
  ) {
    return value;
  }
  return null;
}

function ToggleRow({ label, description, value, onChange }: ToggleProps) {
  return (
    <Pressable style={styles.toggleRow} onPress={() => onChange(!value)}>
      <View style={styles.toggleCopy}>
        <Text style={styles.itemTitle}>{label}</Text>
        {description ? <Text style={styles.itemDescription}>{description}</Text> : null}
      </View>
      <Text style={[styles.toggleValue, value ? styles.toggleOn : null]}>{value ? 'On' : 'Off'}</Text>
    </Pressable>
  );
}

function AccountSection() {
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? user?.name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');

  useEffect(() => {
    setDisplayName(user?.displayName ?? user?.name ?? '');
    setUsername(user?.username ?? '');
    setPhone(user?.phone ?? '');
  }, [user]);

  if (!user) {
    return (
      <Section title="Account">
        <StateBox title="Non connecte" text="Connectez-vous depuis Account pour modifier votre profil." />
        <ActionLink href="/account" title="Open account" />
      </Section>
    );
  }

  return (
    <Section title="Profile info">
      <Text style={styles.label}>Email</Text>
      <Text style={styles.readOnly}>{user.email ?? 'unknown@email.com'}</Text>
      <Text style={styles.helper}>{user.emailVerified ? 'Email verifie' : 'Email non verifie'}</Text>

      <Text style={styles.label}>Display name</Text>
      <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="Display name" />

      <Text style={styles.label}>Username</Text>
      <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="username" autoCapitalize="none" />
      <Text style={styles.helper}>Web: verification via /api/me/username/available?u=. Placeholder mobile avant mutation profil CSRF.</Text>

      <Text style={styles.label}>Phone</Text>
      <TextInput style={styles.input} value={phone ?? ''} onChangeText={setPhone} placeholder="Phone" keyboardType="phone-pad" />

      <View style={styles.buttonRow}>
        <Pressable style={styles.disabledButton} disabled>
          <Text style={styles.disabledButtonText}>Save profile placeholder</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => void signOut()}>
          <Text style={styles.buttonText}>Logout</Text>
        </Pressable>
      </View>
    </Section>
  );
}

function SecuritySection() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setSessions(await fetchAccountSessions());
    } catch {
      setSessions([]);
      setError('Impossible de charger les sessions.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  if (!user) {
    return <StateBox title="Connexion requise" text="La securite du compte demande une session active." />;
  }

  return (
    <>
      <Section title="Email verification">
        <Text style={styles.itemDescription}>{user.email ?? 'unknown@email.com'}</Text>
        <Text style={styles.badge}>{user.emailVerified ? 'Verified' : 'Unverified'}</Text>
        <StateBox title="Placeholder" text="Changement email et renvoi verification utilisent Better Auth cote web; adaptation mobile a brancher plus tard." />
      </Section>

      <Section title="Password">
        <StateBox title="Placeholder" text="Le web utilise authClient.changePassword et requestPasswordReset. Pas de mutation mobile ajoutee sans couche Better Auth/CSRF dediee." />
      </Section>

      <Section title="Sessions">
        {loading ? <ActivityIndicator size="small" color="#2563EB" /> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {sessions.length === 0 && !loading ? <Text style={styles.itemDescription}>Aucune session affichee.</Text> : null}
        {sessions.map((session) => (
          <View key={session.id} style={styles.sessionItem}>
            <Text style={styles.itemTitle}>{session.current ? 'This device' : 'Session'}</Text>
            <Text style={styles.itemDescription}>Created: {new Date(session.createdAt).toLocaleString('fr-FR')}</Text>
            {session.expiresAt ? <Text style={styles.itemDescription}>Expires: {new Date(session.expiresAt).toLocaleString('fr-FR')}</Text> : null}
            {!session.current ? <Text style={styles.helper}>Revoke placeholder: DELETE endpoint protege CSRF cote web.</Text> : null}
          </View>
        ))}
        <Pressable style={styles.button} onPress={() => void loadSessions()}>
          <Text style={styles.buttonText}>Refresh sessions</Text>
        </Pressable>
      </Section>

      <Section title="Two-factor authentication">
        <StateBox title="Placeholder" text="Le web affiche deja un placeholder 2FA." />
      </Section>
    </>
  );
}

function PrivacySection() {
  const [profilePublic, setProfilePublic] = useState(true);
  const [tracking, setTracking] = useState(false);

  return (
    <Section title="Privacy">
      <ToggleRow label="Public profile" description="Equivalent mobile de profile_visibility." value={profilePublic} onChange={setProfilePublic} />
      <ToggleRow label="Analytics tracking" description="Preference locale, comme le web via localStorage." value={tracking} onChange={setTracking} />
      <StateBox title="Local only" text="Ces preferences ne sont pas envoyees au backend dans la version web actuelle." />
    </Section>
  );
}

function DataSection() {
  return (
    <Section title="Data">
      <StateBox title="Export placeholder" text="Le web exporte un JSON depuis localStorage. Mobile n'a pas encore de stockage preference persistant dedie." />
      <StateBox title="Delete local data placeholder" text="Le web supprime des cles locales uniquement; aucune suppression serveur n'est appelee ici." />
    </Section>
  );
}

function AppearanceSection() {
  const [darkMode, setDarkMode] = useState(false);
  const [french, setFrench] = useState(true);

  return (
    <Section title="Appearance">
      <ToggleRow label="Dark theme" description="Placeholder mobile pour ThemeToggle web." value={darkMode} onChange={setDarkMode} />
      <ToggleRow label="French language" description="Placeholder mobile pour SelectLang web." value={french} onChange={setFrench} />
    </Section>
  );
}

function NotificationsSection() {
  const [emailNews, setEmailNews] = useState(true);
  const [emailMentions, setEmailMentions] = useState(false);
  const [pushAll, setPushAll] = useState(false);

  return (
    <Section title="Notifications">
      <ToggleRow label="Email news" description="Preference locale comme le web." value={emailNews} onChange={setEmailNews} />
      <ToggleRow label="Email mentions" description="Preference locale comme le web." value={emailMentions} onChange={setEmailMentions} />
      <ToggleRow label="Push notifications" description="Placeholder: permission push native non branchee." value={pushAll} onChange={setPushAll} />
    </Section>
  );
}

function AccessibilitySection() {
  const [largerText, setLargerText] = useState(false);
  const [contrast, setContrast] = useState(false);

  return (
    <Section title="Accessibility">
      <ToggleRow label="Larger text" description="Equivalent mobile de a11y_larger_text." value={largerText} onChange={setLargerText} />
      <ToggleRow label="Higher contrast" description="Equivalent mobile de a11y_higher_contrast." value={contrast} onChange={setContrast} />
    </Section>
  );
}

export default function SettingsCategoryScreen() {
  const params = useLocalSearchParams<{ category?: string | string[] }>();
  const rawCategory = useMemo(() => (Array.isArray(params.category) ? params.category[0] : params.category) ?? '', [params.category]);
  const category = normalizeCategory(rawCategory);

  if (!category) {
    return (
      <Screen title="Settings" subtitle="Section inconnue.">
        <StateBox title="Categorie introuvable" text="Cette section de reglages n'existe pas." />
        <ActionLink href="/settings" title="Tous les reglages" />
      </Screen>
    );
  }

  return (
    <Screen title={labels[category].title} subtitle={labels[category].subtitle}>
      {category === 'account' ? <AccountSection /> : null}
      {category === 'security' ? <SecuritySection /> : null}
      {category === 'privacy' ? <PrivacySection /> : null}
      {category === 'data' ? <DataSection /> : null}
      {category === 'appearance' ? <AppearanceSection /> : null}
      {category === 'notifications' ? <NotificationsSection /> : null}
      {category === 'accessibility' ? <AccessibilitySection /> : null}
      <ActionLink href="/settings" title="Back to settings" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  input: {
    borderColor: '#D1D5DB',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111827',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  readOnly: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111827',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  helper: {
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  disabledButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  disabledButtonText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '800',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sessionItem: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  itemTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  itemDescription: {
    color: '#4B5563',
    fontSize: 14,
    lineHeight: 21,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
    lineHeight: 21,
  },
  toggleRow: {
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 14,
  },
  toggleCopy: {
    flex: 1,
  },
  toggleValue: {
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    color: '#374151',
    fontSize: 12,
    fontWeight: '800',
    minWidth: 42,
    paddingHorizontal: 10,
    paddingVertical: 6,
    textAlign: 'center',
  },
  toggleOn: {
    backgroundColor: '#DBEAFE',
    color: '#1D4ED8',
  },
});

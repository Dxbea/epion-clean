import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionLink, Section, StateBox } from '@/components/screen';
import { useAuth } from '@/context/AuthContext';
import { getAuthUserLabel } from '@/lib/auth';

function initials(label: string): string {
  return label.trim().slice(0, 1).toUpperCase() || 'U';
}

function formatDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function AccountScreen() {
  const { user, loading: authLoading, signIn, signOut, refreshSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authStatus, setAuthStatus] = useState('Session non verifiee.');
  const [sessionHttpStatus, setSessionHttpStatus] = useState<number | null>(null);
  const [meHttpStatus, setMeHttpStatus] = useState<number | null>(null);

  const refreshAuthState = useCallback(async () => {
    try {
      const session = await refreshSession();
      setSessionHttpStatus(session.sessionStatus);
      setMeHttpStatus(session.meStatus);
      setAuthStatus(session.hasSession ? 'Session valide.' : 'Aucune session active.');
    } catch (authError) {
      if (__DEV__) {
        console.log('[Epion Mobile Auth] Session refresh failed', authError instanceof Error ? authError.message : String(authError));
      }
      setAuthStatus('Impossible de verifier la session.');
    }
  }, [refreshSession]);

  const login = useCallback(async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setAuthStatus('Email et mot de passe requis.');
      return;
    }

    setAuthStatus('Connexion en cours...');

    try {
      const result = await signIn(trimmedEmail, password);
      setSessionHttpStatus(result.sessionStatus);
      setMeHttpStatus(result.meStatus);
      setPassword('');
      setAuthStatus(result.ok && result.user ? 'Session valide.' : `Login echoue${result.errorMessage ? `: ${result.errorMessage}` : '.'}`);
    } catch (authError) {
      setPassword('');
      if (__DEV__) {
        console.log('[Epion Mobile Auth] Login failed', authError instanceof Error ? authError.message : String(authError));
      }
      setAuthStatus('Erreur reseau pendant le login.');
    }
  }, [email, password, signIn]);

  const logout = useCallback(async () => {
    setAuthStatus('Deconnexion en cours...');

    try {
      const result = await signOut();
      setSessionHttpStatus(result.sessionStatus);
      setMeHttpStatus(result.meStatus);
      setAuthStatus(result.ok ? 'Deconnecte.' : `Logout echoue: HTTP ${result.logoutStatus}`);
    } catch (authError) {
      if (__DEV__) {
        console.log('[Epion Mobile Auth] Logout failed', authError instanceof Error ? authError.message : String(authError));
      }
      setAuthStatus('Erreur reseau pendant le logout.');
    }
  }, [signOut]);

  useEffect(() => {
    void refreshAuthState();
  }, [refreshAuthState]);

  const label = getAuthUserLabel(user);
  const createdAt = formatDate(user?.createdAt);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Epion</Text>
          <Text style={styles.title}>Account</Text>
          <Text style={styles.subtitle}>Profil, session et raccourcis de compte.</Text>
        </View>

        {user ? (
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(label)}</Text>
            </View>
            <View style={styles.profileBody}>
              <Text style={styles.profileName}>{label}</Text>
              {user.email ? <Text style={styles.profileMeta}>{user.email}</Text> : null}
              {user.username ? <Text style={styles.profileMeta}>@{user.username}</Text> : null}
              {createdAt ? <Text style={styles.profileMeta}>Membre depuis {createdAt}</Text> : null}
              <View style={styles.badgeRow}>
                <Text style={styles.badge}>{user.emailVerified ? 'Email verifie' : 'Email non verifie'}</Text>
                {user.role ? <Text style={styles.badge}>{user.role}</Text> : null}
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.authBox}>
            <Text style={styles.sectionTitle}>Sign in</Text>
            <Text style={styles.helpText}>Connectez-vous pour afficher votre profil, vos articles et votre activite.</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="username"
            />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              textContentType="password"
            />
            <Pressable style={styles.authButton} onPress={login}>
              <Text style={styles.authButtonText}>Login</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.sessionBox}>
          <View style={styles.sessionHeader}>
            <Text style={styles.sectionTitle}>Session</Text>
            {authLoading ? <ActivityIndicator size="small" color="#2563EB" /> : null}
          </View>
          <Text style={styles.authStatus}>{authStatus}</Text>
          <Text style={styles.authMeta}>Session HTTP: {sessionHttpStatus ?? 'n/a'}</Text>
          <Text style={styles.authMeta}>Me HTTP: {meHttpStatus ?? 'n/a'}</Text>
          <View style={styles.authActions}>
            <Pressable style={styles.secondaryButton} onPress={refreshAuthState}>
              <Text style={styles.secondaryButtonText}>Refresh</Text>
            </Pressable>
            {user ? (
              <Pressable style={styles.secondaryButton} onPress={logout}>
                <Text style={styles.secondaryButtonText}>Logout</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {!user ? <StateBox title="Compte requis" text="Les sections articles, activite et reglages avances utilisent votre session Epion." /> : null}

        <Section title="Compte">
          <ActionLink href="/account/articles" title="My articles" description="Articles crees depuis votre compte, avec filtres par statut." />
          <ActionLink href="/saved" title="Saved articles" description="Articles sauvegardes sur votre compte." />
          <ActionLink href="/news/favorites" title="Favorites" description="Vue favoris reprise du web, branchee sur les articles sauvegardes." />
          <ActionLink href="/activity" title="Activity" description="Interactions sauvegardees, likes, reposts et commentaires." />
          <ActionLink href="/settings/account" title="Account settings" description="Profil, email et options de compte." />
          <ActionLink href="/settings/security" title="Security" description="Mot de passe, verification email et sessions." />
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  content: {
    gap: 16,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 64,
  },
  header: {
    marginBottom: 6,
  },
  eyebrow: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#111827',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 10,
  },
  subtitle: {
    color: '#4B5563',
    fontSize: 16,
    lineHeight: 23,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 18,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  profileBody: {
    flex: 1,
  },
  profileName: {
    color: '#111827',
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 27,
  },
  profileMeta: {
    color: '#4B5563',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  badge: {
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  authBox: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  sessionBox: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  sessionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
  },
  helpText: {
    color: '#4B5563',
    fontSize: 14,
    lineHeight: 21,
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
  authActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  authButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  authButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  authStatus: {
    color: '#374151',
    fontSize: 15,
    lineHeight: 22,
  },
  authMeta: {
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 19,
  },
});

import { Link, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { getAuthUserLabel } from '@/lib/auth';

export default function AccountScreen() {
  const { user, loading: authLoading, signIn, signOut, refreshSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authStatus, setAuthStatus] = useState('Session non verifiee.');
  const [authHttpStatus, setAuthHttpStatus] = useState<number | null>(null);
  const [sessionHttpStatus, setSessionHttpStatus] = useState<number | null>(null);
  const [meHttpStatus, setMeHttpStatus] = useState<number | null>(null);
  const [sessionCookieReceived, setSessionCookieReceived] = useState(false);

  const refreshAuthState = useCallback(async () => {
    try {
      const session = await refreshSession();
      setSessionHttpStatus(session.sessionStatus);
      setMeHttpStatus(session.meStatus);
      setSessionCookieReceived(session.hasCookieHeader);

      if (!session.hasSession) {
        setAuthStatus('Aucune session active.');
        return;
      }

      setAuthStatus(session.user ? 'Session valide.' : 'Session trouvee, profil utilisateur indisponible.');
    } catch (authError) {
      console.log('[Epion Mobile Auth] Session refresh failed', authError instanceof Error ? authError.message : String(authError));
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
    setAuthHttpStatus(null);
    setSessionCookieReceived(false);

    try {
      const result = await signIn(trimmedEmail, password);
      setAuthHttpStatus(result.loginStatus);
      setSessionHttpStatus(result.sessionStatus);
      setMeHttpStatus(result.meStatus);
      setSessionCookieReceived(result.loginCookieReceived || result.hasCookieHeader);
      setPassword('');

      if (!result.ok) {
        setAuthStatus(`Login echoue${result.errorMessage ? `: ${result.errorMessage}` : '.'}`);
        return;
      }

      setAuthStatus(result.user ? 'Session valide.' : 'Session trouvee, profil utilisateur indisponible.');
    } catch (authError) {
      setPassword('');
      console.log('[Epion Mobile Auth] Login failed', authError instanceof Error ? authError.message : String(authError));
      setAuthStatus('Erreur reseau pendant le login.');
    }
  }, [email, password, signIn]);

  const logout = useCallback(async () => {
    setAuthStatus('Deconnexion en cours...');

    try {
      const result = await signOut();
      setAuthHttpStatus(result.logoutStatus);
      setSessionHttpStatus(result.sessionStatus);
      setMeHttpStatus(result.meStatus);
      setSessionCookieReceived(result.hasCookieHeader);
      setAuthStatus(result.ok ? 'Deconnecte.' : `Logout echoue: HTTP ${result.logoutStatus}`);
    } catch (authError) {
      console.log('[Epion Mobile Auth] Logout failed', authError instanceof Error ? authError.message : String(authError));
      setAuthStatus('Erreur reseau pendant le logout.');
    }
  }, [signOut]);

  useEffect(() => {
    void refreshAuthState();
  }, [refreshAuthState]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Epion</Text>
          <Text style={styles.title}>Account</Text>
          <Text style={styles.subtitle}>Connexion et verification de session mobile.</Text>
        </View>

        <View style={styles.nav}>
          <Link href={'/news' as Href} asChild>
            <Pressable style={styles.navButton}>
              <Text style={styles.navText}>News</Text>
            </Pressable>
          </Link>
          <Link href={'/account' as Href} asChild>
            <Pressable style={styles.primaryNavButton}>
              <Text style={styles.primaryNavText}>Account</Text>
            </Pressable>
          </Link>
        </View>

        <View style={styles.authBox}>
          <Text style={styles.sectionTitle}>Session</Text>
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
          <View style={styles.authActions}>
            <Pressable style={styles.authButton} onPress={login}>
              <Text style={styles.authButtonText}>Login</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={refreshAuthState}>
              <Text style={styles.secondaryButtonText}>Session</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={logout}>
              <Text style={styles.secondaryButtonText}>Logout</Text>
            </Pressable>
          </View>
          {authLoading ? <ActivityIndicator size="small" color="#2563EB" /> : null}
          <Text style={styles.authStatus}>{authStatus}</Text>
          <Text style={styles.authMeta}>Login HTTP: {authHttpStatus ?? 'n/a'}</Text>
          <Text style={styles.authMeta}>Session HTTP: {sessionHttpStatus ?? 'n/a'}</Text>
          <Text style={styles.authMeta}>Me HTTP: {meHttpStatus ?? 'n/a'}</Text>
          <Text style={styles.authMeta}>
            Cookie visible apres login/session: {sessionCookieReceived ? 'oui' : 'non'}
          </Text>
          <Text style={styles.connectedUser}>{getAuthUserLabel(user)}</Text>
        </View>
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
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 64,
  },
  header: {
    marginBottom: 22,
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
  nav: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  primaryNavButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  primaryNavText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  navButton: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  navText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  authBox: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
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
  connectedUser: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
});

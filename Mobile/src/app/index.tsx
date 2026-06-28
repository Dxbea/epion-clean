import { useRouter } from 'expo-router';
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
import { fetchArticles } from '@/lib/api';
import { getAuthUserLabel } from '@/lib/auth';
import type { Article } from '@/types/article';

export default function HomeScreen() {
  const router = useRouter();
  const { user, loading: authLoading, signIn, signOut, refreshSession } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authStatus, setAuthStatus] = useState('Session non verifiee.');
  const [authHttpStatus, setAuthHttpStatus] = useState<number | null>(null);
  const [sessionHttpStatus, setSessionHttpStatus] = useState<number | null>(null);
  const [meHttpStatus, setMeHttpStatus] = useState<number | null>(null);
  const [sessionCookieReceived, setSessionCookieReceived] = useState(false);

  const loadArticles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setArticles(await fetchArticles());
    } catch {
      setError('Impossible de charger les articles pour le moment.');
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  const openArticle = useCallback(
    (articleId: string) => {
      router.push({ pathname: '/article/[id]', params: { id: articleId } });
    },
    [router],
  );

  useEffect(() => {
    void loadArticles();
  }, [loadArticles]);

  useEffect(() => {
    void refreshAuthState();
  }, [refreshAuthState]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Epion</Text>
          <Text style={styles.title}>Articles recents</Text>
          <Text style={styles.subtitle}>Verifiez, comprenez et explorez l'information.</Text>
        </View>

        <View style={styles.authBox}>
          <Text style={styles.sectionTitle}>Test auth</Text>
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

        {isLoading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.stateText}>Chargement des articles...</Text>
          </View>
        ) : null}

        {!isLoading && error ? (
          <View style={styles.stateBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={loadArticles}>
              <Text style={styles.retryText}>Reessayer</Text>
            </Pressable>
          </View>
        ) : null}

        {!isLoading && !error ? (
          <View style={styles.list}>
            {articles.length === 0 ? (
              <Text style={styles.emptyText}>Aucun article disponible.</Text>
            ) : (
              articles.map((article) => (
                <Pressable
                  key={article.id}
                  style={({ pressed }) => [styles.articleCard, pressed ? styles.articleCardPressed : null]}
                  onPress={() => openArticle(article.id)}>
                  {article.category ? <Text style={styles.category}>{article.category}</Text> : null}
                  <Text style={styles.articleTitle}>{article.title}</Text>
                  {article.excerpt ? <Text style={styles.excerpt}>{article.excerpt}</Text> : null}
                </Pressable>
              ))
            )}
          </View>
        ) : null}
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
    marginBottom: 28,
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
  authBox: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    marginBottom: 24,
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
  stateBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    padding: 24,
  },
  stateText: {
    color: '#4B5563',
    fontSize: 15,
    marginTop: 12,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  list: {
    gap: 14,
  },
  emptyText: {
    color: '#4B5563',
    fontSize: 15,
  },
  articleCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
  },
  articleCardPressed: {
    opacity: 0.75,
  },
  category: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  articleTitle: {
    color: '#111827',
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 25,
  },
  excerpt: {
    color: '#4B5563',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
});

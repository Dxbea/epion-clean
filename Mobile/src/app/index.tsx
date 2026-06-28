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

type Article = {
  id: string;
  title: string;
  excerpt?: string;
  category?: string;
};

type ArticleApiItem = {
  id?: string | number;
  slug?: string;
  title?: unknown;
  excerpt?: unknown;
  summary?: unknown;
  description?: unknown;
  category?: unknown;
};

type AuthUser = {
  id?: string;
  email?: string;
  name?: string;
  displayName?: string;
  username?: string;
};

type AuthSessionResult = {
  data: unknown;
  status: number | null;
  hasCookieHeader: boolean;
};

type AuthMeResult = {
  data: AuthUser | null;
  status: number | null;
};

const API_BASE = 'https://api.epion.app';
const ARTICLES_URL = `${API_BASE}/api/articles`;
const LOGIN_URL = `${API_BASE}/api/auth/sign-in/email`;
const SESSION_URL = `${API_BASE}/api/auth/get-session`;
const LOGOUT_URL = `${API_BASE}/api/auth/sign-out`;
const ME_URL = `${API_BASE}/api/me`;
const AUTH_CALLBACK_URL = 'https://epion.app/verify-email';

function getArticleItems(payload: unknown): ArticleApiItem[] {
  if (Array.isArray(payload)) {
    return payload as ArticleApiItem[];
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const candidates = [record.articles, record.items, record.data];
    const match = candidates.find(Array.isArray);

    if (match) {
      return match as ArticleApiItem[];
    }
  }

  return [];
}

function readOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readCategory(value: unknown): string | undefined {
  const directCategory = readOptionalText(value);

  if (directCategory) {
    return directCategory;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return readOptionalText(record.name) ?? readOptionalText(record.slug);
  }

  return undefined;
}

function getHeaderValue(headers: Headers, name: string): string | null {
  return headers.get(name) ?? headers.get(name.toLowerCase()) ?? headers.get(name.toUpperCase());
}

function logAuthStep(message: string, details?: unknown) {
  if (details === undefined) {
    console.log(`[Epion Mobile Auth] ${message}`);
    return;
  }

  console.log(`[Epion Mobile Auth] ${message}`, details);
}

function getUserFromSession(payload: unknown): AuthUser | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const directUser = record.user;

  if (directUser && typeof directUser === 'object') {
    return directUser as AuthUser;
  }

  const nestedData = record.data;
  if (nestedData && typeof nestedData === 'object') {
    const nestedRecord = nestedData as Record<string, unknown>;
    const nestedUser = nestedRecord.user;

    if (nestedUser && typeof nestedUser === 'object') {
      return nestedUser as AuthUser;
    }
  }

  return null;
}

function getAuthUserLabel(user: AuthUser | null): string {
  if (!user) {
    return 'Aucun utilisateur connecte.';
  }

  return user.displayName ?? user.name ?? user.username ?? user.email ?? user.id ?? 'Utilisateur connecte';
}

async function fetchCurrentSession(): Promise<AuthSessionResult> {
  const response = await fetch(`${SESSION_URL}?disableCookieCache=true`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-store',
    },
  });
  const data: unknown = await response.json().catch(() => null);
  const setCookie = getHeaderValue(response.headers, 'set-cookie');

  logAuthStep('Session fetch', {
    status: response.status,
    hasSession: Boolean(data),
    hasSetCookieHeader: Boolean(setCookie),
  });

  return {
    data,
    status: response.status,
    hasCookieHeader: Boolean(setCookie),
  };
}

async function fetchCurrentUser(): Promise<AuthMeResult> {
  const response = await fetch(`${ME_URL}?t=${Date.now()}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-store',
    },
  });
  const data: unknown = await response.json().catch(() => null);

  logAuthStep('Me fetch', {
    status: response.status,
    hasUser: response.ok && Boolean(data),
  });

  return {
    data: response.ok && data && typeof data === 'object' ? (data as AuthUser) : null,
    status: response.status,
  };
}

function normalizeArticle(item: ArticleApiItem, index: number): Article | null {
  const title = readOptionalText(item.title);

  if (!title) {
    return null;
  }

  return {
    id: String(item.id ?? item.slug ?? index),
    title,
    excerpt:
      readOptionalText(item.excerpt) ??
      readOptionalText(item.summary) ??
      readOptionalText(item.description),
    category: readCategory(item.category),
  };
}

export default function HomeScreen() {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authStatus, setAuthStatus] = useState('Session non verifiee.');
  const [authHttpStatus, setAuthHttpStatus] = useState<number | null>(null);
  const [sessionHttpStatus, setSessionHttpStatus] = useState<number | null>(null);
  const [meHttpStatus, setMeHttpStatus] = useState<number | null>(null);
  const [sessionCookieReceived, setSessionCookieReceived] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const loadArticles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(ARTICLES_URL, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload: unknown = await response.json();
      const nextArticles = getArticleItems(payload)
        .map(normalizeArticle)
        .filter((article): article is Article => article !== null);

      setArticles(nextArticles);
    } catch {
      setError('Impossible de charger les articles pour le moment.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshAuthState = useCallback(async () => {
    setIsAuthLoading(true);

    try {
      const session = await fetchCurrentSession();
      const sessionUser = getUserFromSession(session.data);
      setSessionHttpStatus(session.status);
      setSessionCookieReceived(session.hasCookieHeader);

      if (!session.data) {
        setAuthUser(null);
        setMeHttpStatus(null);
        setAuthStatus('Aucune session active.');
        return;
      }

      const me = await fetchCurrentUser();
      setMeHttpStatus(me.status);
      setAuthUser(me.data ?? sessionUser);
      setAuthStatus(me.data ?? sessionUser ? 'Session valide.' : 'Session trouvee, profil utilisateur indisponible.');
    } catch (authError) {
      logAuthStep('Session refresh failed', authError instanceof Error ? authError.message : String(authError));
      setAuthUser(null);
      setAuthStatus('Impossible de verifier la session.');
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  const login = useCallback(async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setAuthStatus('Email et mot de passe requis.');
      return;
    }

    setIsAuthLoading(true);
    setAuthStatus('Connexion en cours...');
    setAuthHttpStatus(null);
    setSessionCookieReceived(false);

    try {
      const response = await fetch(LOGIN_URL, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          callbackURL: AUTH_CALLBACK_URL,
        }),
      });
      const data: unknown = await response.json().catch(() => null);
      const setCookie = getHeaderValue(response.headers, 'set-cookie');
      setAuthHttpStatus(response.status);
      setSessionCookieReceived(Boolean(setCookie));
      setPassword('');

      logAuthStep('Login response', {
        status: response.status,
        ok: response.ok,
        hasSetCookieHeader: Boolean(setCookie),
        hasBody: Boolean(data),
      });

      if (!response.ok) {
        const errorMessage =
          data && typeof data === 'object' && 'message' in data
            ? String((data as { message?: unknown }).message ?? '')
            : '';
        setAuthUser(null);
        setAuthStatus(`Login echoue${errorMessage ? `: ${errorMessage}` : '.'}`);
        return;
      }

      setAuthStatus('Login reussi. Verification de la session...');
      await refreshAuthState();
    } catch (authError) {
      setPassword('');
      logAuthStep('Login failed', authError instanceof Error ? authError.message : String(authError));
      setAuthUser(null);
      setAuthStatus('Erreur reseau pendant le login.');
    } finally {
      setIsAuthLoading(false);
    }
  }, [email, password, refreshAuthState]);

  const logout = useCallback(async () => {
    setIsAuthLoading(true);
    setAuthStatus('Deconnexion en cours...');

    try {
      const response = await fetch(LOGOUT_URL, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      });
      setAuthHttpStatus(response.status);
      logAuthStep('Logout response', { status: response.status, ok: response.ok });
      setAuthUser(null);
      setAuthStatus(response.ok ? 'Deconnecte.' : `Logout echoue: HTTP ${response.status}`);
      await refreshAuthState();
    } catch (authError) {
      logAuthStep('Logout failed', authError instanceof Error ? authError.message : String(authError));
      setAuthStatus('Erreur reseau pendant le logout.');
    } finally {
      setIsAuthLoading(false);
    }
  }, [refreshAuthState]);

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
          {isAuthLoading ? <ActivityIndicator size="small" color="#2563EB" /> : null}
          <Text style={styles.authStatus}>{authStatus}</Text>
          <Text style={styles.authMeta}>Login HTTP: {authHttpStatus ?? 'n/a'}</Text>
          <Text style={styles.authMeta}>Session HTTP: {sessionHttpStatus ?? 'n/a'}</Text>
          <Text style={styles.authMeta}>Me HTTP: {meHttpStatus ?? 'n/a'}</Text>
          <Text style={styles.authMeta}>
            Cookie visible apres login/session: {sessionCookieReceived ? 'oui' : 'non'}
          </Text>
          <Text style={styles.connectedUser}>{getAuthUserLabel(authUser)}</Text>
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
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, type Href } from 'expo-router';

import { Badge, Button, Card, EmptyState, Input, Screen, Section } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { getAuthUserLabel } from '@/lib/auth';
import { Fonts, FontSize, Radius, Spacing } from '@/constants/theme';

function initials(label: string): string {
  return label.trim().slice(0, 1).toUpperCase() || 'U';
}

function formatDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

type NavItemProps = {
  href: string | Href;
  title: string;
  description?: string;
  last?: boolean;
};

function NavItem({ href, title, description, last = false }: NavItemProps) {
  const colors = useTheme();
  return (
    <Link href={href as Href} asChild>
      <Pressable
        style={({ pressed }) => [
          styles.navItem,
          !last ? { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle } : null,
          pressed ? styles.navItemPressed : null,
        ]}
      >
        <View style={styles.navItemText}>
          <Text style={[styles.navItemTitle, { color: colors.text }]}>{title}</Text>
          {description ? <Text style={[styles.navItemDesc, { color: colors.textMuted }]}>{description}</Text> : null}
        </View>
        <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
      </Pressable>
    </Link>
  );
}

export default function AccountScreen() {
  const colors = useTheme();
  const { user, loading: authLoading, signIn, signOut, refreshSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authStatus, setAuthStatus] = useState('Session non vérifiée.');
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
      setAuthStatus('Impossible de vérifier la session.');
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
      setAuthStatus(result.ok && result.user ? 'Session valide.' : `Login échoué${result.errorMessage ? `: ${result.errorMessage}` : '.'}`);
    } catch (authError) {
      setPassword('');
      if (__DEV__) {
        console.log('[Epion Mobile Auth] Login failed', authError instanceof Error ? authError.message : String(authError));
      }
      setAuthStatus('Erreur réseau pendant le login.');
    }
  }, [email, password, signIn]);

  const logout = useCallback(async () => {
    setAuthStatus('Déconnexion en cours...');

    try {
      const result = await signOut();
      setSessionHttpStatus(result.sessionStatus);
      setMeHttpStatus(result.meStatus);
      setAuthStatus(result.ok ? 'Déconnecté.' : `Logout échoué: HTTP ${result.logoutStatus}`);
    } catch (authError) {
      if (__DEV__) {
        console.log('[Epion Mobile Auth] Logout failed', authError instanceof Error ? authError.message : String(authError));
      }
      setAuthStatus('Erreur réseau pendant le logout.');
    }
  }, [signOut]);

  useEffect(() => {
    void refreshAuthState();
  }, [refreshAuthState]);

  const label = getAuthUserLabel(user);
  const createdAt = formatDate(user?.createdAt);

  return (
    <Screen title="Compte" subtitle="Profil, session et raccourcis de compte.">
      {user ? (
        <View style={styles.profileSection}>
          <View style={[styles.avatar, { backgroundColor: '#059669' }]}>
            <Text style={styles.avatarText}>{initials(label)}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.text, fontFamily: Fonts.display }]}>{label}</Text>
            {user.username ? <Text style={[styles.profileHandle, { color: colors.textMuted }]}>@{user.username}</Text> : null}
            {user.email ? <Text style={[styles.profileMeta, { color: colors.textTertiary }]}>{user.email}</Text> : null}
            {createdAt ? <Text style={[styles.profileMeta, { color: colors.textMuted }]}>Membre depuis {createdAt}</Text> : null}
            <View style={styles.badgeRow}>
              <Badge label={user.emailVerified ? 'Vérifié' : 'Non vérifié'} />
              {user.role ? <Badge label={user.role} /> : null}
            </View>
          </View>
          <Button title="Modifier le profil" onPress={() => {}} variant="secondary" size="sm" rounded />
        </View>
      ) : (
        <Card>
          <View style={styles.loginContent}>
            <Text style={[styles.loginTitle, { color: colors.text }]}>Se connecter</Text>
            <Text style={[styles.loginDesc, { color: colors.textSecondary }]}>
              Connectez-vous pour accéder à votre profil, vos articles et votre activité.
            </Text>
            <View style={styles.formGap}>
              <Input
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="username"
              />
              <Input
                value={password}
                onChangeText={setPassword}
                placeholder="Mot de passe"
                secureTextEntry
                textContentType="password"
              />
              <Button title="Se connecter" onPress={login} rounded />
            </View>
          </View>
        </Card>
      )}

      <Card style={styles.sessionCard}>
        <View style={styles.sessionHeader}>
          <Text style={[styles.sessionTitle, { color: colors.text }]}>Session</Text>
          {authLoading ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
        </View>
        <Text style={[styles.sessionStatus, { color: colors.textTertiary }]}>{authStatus}</Text>
        <Text style={[styles.sessionMeta, { color: colors.textMuted }]}>Session HTTP: {sessionHttpStatus ?? '—'} · Me HTTP: {meHttpStatus ?? '—'}</Text>
        <View style={styles.sessionActions}>
          <Button title="Rafraîchir" onPress={refreshAuthState} variant="secondary" size="sm" rounded />
          {user ? <Button title="Déconnexion" onPress={logout} variant="ghost" size="sm" /> : null}
        </View>
      </Card>

      {!user ? (
        <EmptyState
          title="Compte requis"
          message="Les sections articles, activité et réglages avancés utilisent votre session Epion."
        />
      ) : null}

      <View>
        <Text style={[styles.navSectionTitle, { color: colors.text, fontFamily: Fonts.display }]}>Navigation</Text>
        <View style={[styles.navList, { borderColor: colors.border, backgroundColor: colors.backgroundElevated }]}>
          <NavItem href="/account/articles" title="Mes articles" description="Articles créés depuis votre compte." />
          <NavItem href="/saved" title="Articles sauvegardés" description="Articles sauvegardés sur votre compte." />
          <NavItem href="/news/favorites" title="Favoris" description="Vos articles favoris." />
          <NavItem href="/activity" title="Activité" description="Interactions, likes et commentaires." />
          <NavItem href="/settings/account" title="Paramètres du compte" description="Profil, email et options." />
          <NavItem href="/settings/security" title="Sécurité" description="Mot de passe et sessions." last />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileSection: {
    alignItems: 'flex-start',
    gap: Spacing.lg,
  },
  avatar: {
    alignItems: 'center',
    borderRadius: Radius.full,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  profileInfo: {
    gap: 2,
  },
  profileName: {
    fontSize: FontSize['2xl'],
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  profileHandle: {
    fontSize: FontSize.md,
    marginTop: 2,
  },
  profileMeta: {
    fontSize: FontSize.base,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  loginContent: {
    gap: Spacing.lg,
  },
  loginTitle: {
    fontSize: FontSize.xl,
    fontWeight: '600',
  },
  loginDesc: {
    fontSize: FontSize.base,
    lineHeight: 20,
  },
  formGap: {
    gap: Spacing.md,
  },
  sessionCard: {
    padding: Spacing.lg,
  },
  sessionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sessionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
  sessionStatus: {
    fontSize: FontSize.base,
    lineHeight: 20,
  },
  sessionMeta: {
    fontSize: FontSize.sm,
    marginTop: 4,
  },
  sessionActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  navSectionTitle: {
    fontSize: FontSize['2xl'],
    fontWeight: '500',
    letterSpacing: -0.3,
    marginBottom: Spacing.md,
  },
  navList: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  navItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    minHeight: 64,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  navItemPressed: {
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  navItemText: {
    flex: 1,
    gap: 2,
  },
  navItemTitle: {
    fontSize: FontSize.base,
    fontWeight: '600',
  },
  navItemDesc: {
    fontSize: FontSize.sm,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
  },
});

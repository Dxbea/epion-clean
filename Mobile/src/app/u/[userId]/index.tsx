import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { API_BASE } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

type PublicProfile = {
  id: string;
  username?: string | null;
  name?: string | null;
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  followersCount?: number | null;
  followingCount?: number | null;
  role?: string | null;
  createdAt?: string | null;
  isFollowing?: boolean;
  isMe?: boolean;
};

function formatDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function PublicProfileScreen() {
  const params = useLocalSearchParams<{ userId?: string | string[] }>();
  const userId = Array.isArray(params.userId) ? params.userId[0] : params.userId;
  const router = useRouter();
  const { user: me } = useAuth();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const loadProfile = useCallback(async () => {
    if (!userId) return;

    setStatus('loading');

    try {
      const response = await fetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (response.status === 404) {
        setStatus('error');
        setErrorMessage('Profil introuvable.');
        return;
      }

      if (!response.ok) {
        setStatus('error');
        setErrorMessage(`Erreur HTTP ${response.status}.`);
        return;
      }

      const data = await response.json() as PublicProfile;
      setProfile(data);
      setStatus('done');
    } catch {
      setStatus('error');
      setErrorMessage('Erreur réseau. Vérifie ta connexion.');
    }
  }, [userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const displayName = profile?.displayName ?? profile?.name ?? profile?.username ?? userId ?? 'Profil';
  const initials = displayName.trim().slice(0, 1).toUpperCase() || 'U';
  const joinedAt = formatDate(profile?.createdAt);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>Epion</Text>

      {status === 'loading' && (
        <View style={styles.centerRow}>
          <ActivityIndicator color="#2563EB" />
          <Text style={styles.subtitle}>Chargement du profil…</Text>
        </View>
      )}

      {status === 'error' && (
        <>
          <Text style={styles.title}>Profil</Text>
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
          <Pressable style={styles.button} onPress={() => router.back()}>
            <Text style={styles.buttonText}>Retour</Text>
          </Pressable>
        </>
      )}

      {status === 'done' && profile && (
        <>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, profile.isMe && styles.avatarMe]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>

          <Text style={styles.title}>{displayName}</Text>
          {profile.username ? <Text style={styles.username}>@{profile.username}</Text> : null}
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

          {/* Méta */}
          <View style={styles.metaRow}>
            {typeof profile.followersCount === 'number' && (
              <View style={styles.metaItem}>
                <Text style={styles.metaCount}>{profile.followersCount}</Text>
                <Text style={styles.metaLabel}>abonnés</Text>
              </View>
            )}
            {typeof profile.followingCount === 'number' && (
              <View style={styles.metaItem}>
                <Text style={styles.metaCount}>{profile.followingCount}</Text>
                <Text style={styles.metaLabel}>abonnements</Text>
              </View>
            )}
          </View>

          {joinedAt ? (
            <Text style={styles.joinDate}>Membre depuis {joinedAt}</Text>
          ) : null}

          {profile.role && profile.role !== 'user' ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{profile.role}</Text>
            </View>
          ) : null}

          {profile.isMe && me && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>C'est ton profil public tel que les autres le voient.</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7FAFC' },
  content: { gap: 14, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 64 },
  eyebrow: { color: '#2563EB', fontSize: 14, fontWeight: '700', textTransform: 'uppercase' },
  title: { color: '#111827', fontSize: 32, fontWeight: '800' },
  username: { color: '#6B7280', fontSize: 16 },
  bio: { color: '#4B5563', fontSize: 15, lineHeight: 22 },
  subtitle: { color: '#4B5563', fontSize: 16, lineHeight: 24 },
  centerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarContainer: { alignItems: 'flex-start' },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 40,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  avatarMe: { backgroundColor: '#059669' },
  avatarText: { color: '#FFFFFF', fontSize: 32, fontWeight: '800' },
  metaRow: { flexDirection: 'row', gap: 24 },
  metaItem: { alignItems: 'center' },
  metaCount: { color: '#111827', fontSize: 20, fontWeight: '800' },
  metaLabel: { color: '#6B7280', fontSize: 13 },
  joinDate: { color: '#6B7280', fontSize: 13 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { color: '#111827', fontSize: 12, fontWeight: '700' },
  infoBox: {
    backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderRadius: 8,
    borderWidth: 1, padding: 14,
  },
  infoText: { color: '#1E40AF', fontSize: 14, lineHeight: 21 },
  errorBox: {
    backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderRadius: 8,
    borderWidth: 1, padding: 14,
  },
  errorText: { color: '#991B1B', fontSize: 14, lineHeight: 21 },
  button: {
    backgroundColor: '#2563EB', borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center',
    alignSelf: 'flex-start',
  },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});

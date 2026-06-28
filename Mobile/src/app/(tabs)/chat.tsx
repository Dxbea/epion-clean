import { Link, router, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen, StateBox } from '@/components/screen';
import { useAuth } from '@/context/AuthContext';
import { createChatSession, fetchChatSessions, type ChatSessionSummary } from '@/lib/api';

function formatDate(value?: string) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ChatScreen() {
  const { user, loading: authLoading } = useAuth();
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (!user) {
      setSessions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      setSessions(await fetchChatSessions());
    } catch (loadError) {
      setSessions([]);
      const status = loadError instanceof Error && 'status' in loadError ? (loadError as { status?: number }).status : undefined;
      setError(status === 401 ? 'Session expiree. Connecte-toi a nouveau.' : 'Impossible de charger les conversations.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const handleCreateSession = useCallback(async () => {
    if (!user || isCreating) return;

    setIsCreating(true);
    setError(null);

    try {
      const session = await createChatSession({ mode: 'balanced' });
      router.push({ pathname: '/chat/[id]', params: { id: session.id } });
    } catch (createError) {
      const status = createError instanceof Error && 'status' in createError ? (createError as { status?: number }).status : undefined;
      setError(status === 401 ? 'Session expiree. Connecte-toi a nouveau.' : 'Impossible de creer un nouveau chat.');
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, user]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  if (authLoading) {
    return (
      <Screen title="Chat" subtitle="Conversations Epion et verification sourcee.">
        <View style={styles.stateBox}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>Verification de la session...</Text>
        </View>
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen title="Chat" subtitle="Conversations Epion et verification sourcee.">
        <StateBox title="Connecte-toi pour accéder au chat" text="Le chat mobile utilise tes conversations Epion existantes." />
        <Link href="/account" asChild>
          <Pressable style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null]}>
            <Text style={styles.primaryButtonText}>Aller au compte</Text>
          </Pressable>
        </Link>
      </Screen>
    );
  }

  return (
    <Screen title="Chat" subtitle="Conversations Epion et verification sourcee.">
      <View style={styles.actionsRow}>
        <Pressable
          disabled={isCreating}
          onPress={handleCreateSession}
          style={({ pressed }) => [styles.primaryButton, pressed || isCreating ? styles.pressed : null]}
        >
          <Text style={styles.primaryButtonText}>{isCreating ? 'Creation...' : 'Nouveau chat'}</Text>
        </Pressable>
        <Pressable onPress={loadSessions} style={({ pressed }) => [styles.secondaryButton, pressed ? styles.pressed : null]}>
          <Text style={styles.secondaryButtonText}>Actualiser</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>Chargement des conversations...</Text>
        </View>
      ) : null}

      {!isLoading && error ? <StateBox title={error} text="Reessaie dans un instant ou reconnecte-toi depuis Compte." /> : null}
      {!isLoading && !error && sessions.length === 0 ? <StateBox title="Aucune conversation recente." text="Cree un nouveau chat pour commencer." /> : null}

      {!isLoading && !error
        ? sessions.map((session) => {
            const href = { pathname: '/chat/[id]', params: { id: session.id } } as unknown as Href;
            const updatedAt = formatDate(session.updatedAt);

            return (
              <Link key={session.id} href={href} asChild>
                <Pressable style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}>
                  <Text style={styles.title}>{session.title}</Text>
                  {updatedAt ? <Text style={styles.meta}>{updatedAt}</Text> : null}
                </Pressable>
              </Link>
            );
          })
        : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
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
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  pressed: {
    opacity: 0.72,
  },
  title: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
  },
  meta: {
    color: '#6B7280',
    fontSize: 13,
    marginTop: 6,
  },
});

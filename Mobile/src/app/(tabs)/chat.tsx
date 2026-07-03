import { Link, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { createChatSession, fetchChatMessages, fetchChatSessions } from '@/lib/api';
import { useTheme } from '@/hooks/use-theme';

export default function ChatScreen() {
  const { user, loading: authLoading } = useAuth();
  const colors = useTheme();
  const [message, setMessage] = useState('Preparation du chat...');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const openChat = useCallback(async () => {
    if (!user || isCreating) return;

    setError(null);
    setMessage('Chargement des conversations...');

    try {
      const sessions = await fetchChatSessions({ take: 10 });
      const latest = sessions[0];

      if (latest) {
        router.replace({ pathname: '/chat/[id]', params: { id: latest.id } });

        const possibleEmptySessions = sessions.slice(1).filter((session) => {
          const title = session.title?.trim();
          return !title || title === 'New chat' || title === 'Sans titre' || title === 'Conversation sans titre';
        });

        void Promise.allSettled(
          possibleEmptySessions.map(async (session) => {
            const messages = await fetchChatMessages(session.id);
            return messages.length;
          }),
        );
        return;
      }

      setIsCreating(true);
      setMessage('Creation de la conversation...');
      const session = await createChatSession({ mode: 'balanced' });
      router.replace({ pathname: '/chat/[id]', params: { id: session.id } });
    } catch (chatError) {
      const status = chatError instanceof Error && 'status' in chatError ? (chatError as { status?: number }).status : undefined;
      setError(status === 401 ? 'Connecte-toi pour utiliser le chat.' : 'Impossible de preparer le chat.');
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, user]);

  useEffect(() => {
    if (!authLoading && user) {
      void openChat();
    }
  }, [authLoading, openChat, user]);

  if (authLoading) {
    return <CenteredState title="Verification de la session..." />;
  }

  if (!user) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.card, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Connecte-toi pour acceder au chat</Text>
          <Text style={[styles.text, { color: colors.textSecondary }]}>Le chat mobile utilise tes conversations Epion existantes.</Text>
          <Link href="/account" asChild>
            <Pressable style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed ? styles.pressed : null]}>
              <Text style={[styles.primaryButtonText, { color: colors.primaryText }]}>Aller au compte</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.card, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>{error}</Text>
          <Text style={[styles.text, { color: colors.textSecondary }]}>Reessaie dans un instant ou reconnecte-toi depuis Compte.</Text>
          <Pressable onPress={openChat} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed ? styles.pressed : null]}>
            <Text style={[styles.primaryButtonText, { color: colors.primaryText }]}>Reessayer</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return <CenteredState title={message} />;
}

function CenteredState({ title }: { title: string }) {
  const colors = useTheme();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    backgroundColor: '#FAFAF5',
    flex: 1,
    gap: 14,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0,0,0,0.10)',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    maxWidth: 420,
    padding: 20,
    width: '100%',
  },
  title: {
    color: '#0A0A0A',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  text: {
    color: 'rgba(0,0,0,0.70)',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.72,
  },
});

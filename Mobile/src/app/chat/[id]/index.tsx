import { Link, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/context/AuthContext';
import {
  fetchChatMessages,
  fetchChatSession,
  sendChatMessage,
  type ChatMessageItem,
  type ChatSessionDetail,
} from '@/lib/api';

function messageLabel(role: ChatMessageItem['role']) {
  return role === 'user' ? 'Toi' : 'Epion';
}

function formatMessageDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ChatSessionScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = useMemo(() => (Array.isArray(params.id) ? params.id[0] : params.id) ?? '', [params.id]);
  const { user, loading: authLoading } = useAuth();
  const scrollRef = useRef<ScrollView | null>(null);

  const [session, setSession] = useState<ChatSessionDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConversation = useCallback(async () => {
    if (!user || !id) {
      setSession(null);
      setMessages([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [nextSession, nextMessages] = await Promise.all([fetchChatSession(id), fetchChatMessages(id)]);
      setSession(nextSession);
      setMessages(nextMessages);
    } catch (loadError) {
      setSession(null);
      setMessages([]);
      const status = loadError instanceof Error && 'status' in loadError ? (loadError as { status?: number }).status : undefined;
      if (status === 404) {
        setError('Conversation introuvable.');
      } else if (status === 401 || status === 403) {
        setError('Connecte-toi pour acceder a cette conversation.');
      } else {
        setError('Impossible de charger la conversation.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id, user]);

  const handleSend = useCallback(async () => {
    const content = draft.trim();
    if (!user || !id || !content || isSending) return;

    const now = new Date().toISOString();
    const optimisticUser: ChatMessageItem = {
      id: `local-user-${Date.now()}`,
      role: 'user',
      content,
      createdAt: now,
    };

    setDraft('');
    setIsSending(true);
    setError(null);
    setMessages((current) => [...current, optimisticUser]);

    try {
      const result = await sendChatMessage(id, content, {
        model: 'sonar',
        mode: 'balanced',
        responseStyle: 'normal',
      });

      if (result.streamedText.trim()) {
        setMessages((current) => [
          ...current,
          {
            id: `local-assistant-${Date.now()}`,
            role: 'assistant',
            content: result.streamedText.trim(),
            createdAt: new Date().toISOString(),
          },
        ]);
      }

      setMessages(await fetchChatMessages(id));
    } catch (sendError) {
      setMessages((current) => current.filter((message) => message.id !== optimisticUser.id));
      const status = sendError instanceof Error && 'status' in sendError ? (sendError as { status?: number }).status : undefined;
      const code = sendError instanceof Error && 'code' in sendError ? (sendError as { code?: string }).code : undefined;

      if (code === 'EMAIL_NOT_VERIFIED') {
        setError('Verifie ton email avant d utiliser le chat.');
      } else if (status === 401 || status === 403) {
        setError('Connecte-toi pour envoyer un message.');
      } else if (status === 402) {
        setError('Quota ou credits insuffisants pour envoyer ce message.');
      } else {
        setError(sendError instanceof Error ? sendError.message : 'Impossible d envoyer le message.');
      }
      setDraft(content);
    } finally {
      setIsSending(false);
    }
  }, [draft, id, isSending, user]);

  useEffect(() => {
    void loadConversation();
  }, [loadConversation]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, isSending]);

  if (authLoading) {
    return (
      <View style={styles.centeredScreen}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.stateText}>Verification de la session...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centeredScreen}>
        <Text style={styles.stateTitle}>Connecte-toi pour accéder au chat</Text>
        <Text style={styles.stateText}>Cette conversation est liee a ton compte Epion.</Text>
        <Link href="/account" asChild>
          <Pressable style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null]}>
            <Text style={styles.primaryButtonText}>Aller au compte</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={() => router.push('/chat')} style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}>
          <Text style={styles.backButtonText}>Retour</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>Chat Epion</Text>
          <Text style={styles.title} numberOfLines={1}>{session?.title ?? 'Conversation'}</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>Chargement des messages...</Text>
        </View>
      ) : null}

      {!isLoading && error ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeTitle}>{error}</Text>
          <Pressable onPress={loadConversation} style={({ pressed }) => [styles.secondaryButton, pressed ? styles.pressed : null]}>
            <Text style={styles.secondaryButtonText}>Reessayer</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={styles.messagesContent} keyboardShouldPersistTaps="handled">
        {!isLoading && !error && messages.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.stateTitle}>Nouvelle conversation</Text>
            <Text style={styles.stateText}>Pose une question. La version mobile affiche les messages simplement, sans sources avancees pour l instant.</Text>
          </View>
        ) : null}

        {messages.map((message) => {
          const createdAt = formatMessageDate(message.createdAt);
          return (
            <View key={message.id} style={[styles.messageCard, message.role === 'user' ? styles.userMessage : styles.assistantMessage]}>
              <View style={styles.messageHeader}>
                <Text style={styles.messageRole}>{messageLabel(message.role)}</Text>
                {createdAt ? <Text style={styles.messageDate}>{createdAt}</Text> : null}
              </View>
              <Text style={styles.messageContent}>{message.content}</Text>
            </View>
          );
        })}

        {isSending ? (
          <View style={styles.sendingRow}>
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={styles.stateText}>Epion prepare la reponse...</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.inputBar}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          editable={!isSending}
          multiline
          maxLength={8000}
          placeholder="Ecris ton message..."
          placeholderTextColor="#9CA3AF"
          style={styles.input}
        />
        <Pressable
          disabled={isSending || draft.trim().length === 0}
          onPress={handleSend}
          style={({ pressed }) => [styles.sendButton, pressed || isSending || draft.trim().length === 0 ? styles.pressed : null]}
        >
          <Text style={styles.sendButtonText}>{isSending ? '...' : 'Envoyer'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F7FAFC',
    flex: 1,
  },
  centeredScreen: {
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
    flex: 1,
    gap: 14,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E5E7EB',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backButton: {
    borderColor: '#D1D5DB',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backButtonText: {
    color: '#111827',
    fontWeight: '800',
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2,
  },
  loadingBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E5E7EB',
    borderBottomWidth: 1,
    padding: 18,
  },
  noticeBox: {
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E5E7EB',
    borderBottomWidth: 1,
    gap: 10,
    padding: 16,
  },
  noticeTitle: {
    color: '#991B1B',
    fontSize: 15,
    fontWeight: '800',
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    gap: 12,
    padding: 16,
  },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
  },
  messageCard: {
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  userMessage: {
    backgroundColor: '#EFF6FF',
  },
  assistantMessage: {
    backgroundColor: '#FFFFFF',
  },
  messageHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  messageRole: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  messageDate: {
    color: '#6B7280',
    fontSize: 12,
  },
  messageContent: {
    color: '#1F2937',
    fontSize: 15,
    lineHeight: 22,
  },
  sendingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 4,
  },
  stateTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  stateText: {
    color: '#4B5563',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  inputBar: {
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E5E7EB',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderColor: '#D1D5DB',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111827',
    flex: 1,
    fontSize: 15,
    maxHeight: 130,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.72,
  },
});

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { API_BASE } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const router = useRouter();
  const { refreshSession } = useAuth();

  const [status, setStatus] = useState<'idle' | 'verifying' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const verify = useCallback(async (tok: string) => {
    setStatus('verifying');
    setMessage('Vérification en cours…');

    try {
      const response = await fetch(
        `${API_BASE}/api/auth/verify-email?token=${encodeURIComponent(tok)}`,
        {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        },
      );

      if (response.ok) {
        setStatus('done');
        setMessage('Email vérifié avec succès !');
        // Rafraîchir la session pour mettre à jour emailVerified
        await refreshSession().catch(() => null);
      } else {
        setStatus('error');
        setMessage('Lien de vérification invalide ou expiré. Demande un nouvel email depuis les paramètres de compte.');
      }
    } catch {
      setStatus('error');
      setMessage('Erreur réseau. Vérifie ta connexion et réessaie.');
    }
  }, [refreshSession]);

  // Vérification automatique si token présent dans l'URL
  useEffect(() => {
    if (token && status === 'idle') {
      void verify(token);
    }
  }, [token, status, verify]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>Epion</Text>
      <Text style={styles.title}>Vérification email</Text>

      {!token ? (
        <>
          <Text style={styles.subtitle}>
            Ouvre le lien reçu par email pour vérifier ton adresse.
          </Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              Le lien de vérification est envoyé à ton adresse email lors de la création de compte ou depuis les paramètres de sécurité.
            </Text>
          </View>
          <Pressable style={styles.button} onPress={() => router.push('/account')}>
            <Text style={styles.buttonText}>Retour au compte</Text>
          </Pressable>
        </>
      ) : (
        <>
          {status === 'verifying' ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#2563EB" />
              <Text style={styles.subtitle}>{message}</Text>
            </View>
          ) : (
            <>
              <View style={[styles.messageBox, status === 'error' && styles.messageBoxError]}>
                <Text style={[styles.messageText, status === 'error' && styles.messageTextError]}>
                  {message}
                </Text>
              </View>
              <Pressable
                style={styles.button}
                onPress={() => router.push(status === 'done' ? '/account' : '/settings/security')}
              >
                <Text style={styles.buttonText}>
                  {status === 'done' ? 'Retour au compte' : 'Paramètres de sécurité'}
                </Text>
              </Pressable>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7FAFC' },
  content: { gap: 16, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 64 },
  eyebrow: { color: '#2563EB', fontSize: 14, fontWeight: '700', textTransform: 'uppercase' },
  title: { color: '#111827', fontSize: 32, fontWeight: '800' },
  subtitle: { color: '#4B5563', fontSize: 16, lineHeight: 24 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoBox: {
    backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderRadius: 8,
    borderWidth: 1, padding: 14,
  },
  messageBox: {
    backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', borderRadius: 8,
    borderWidth: 1, padding: 14,
  },
  messageBoxError: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  messageText: { color: '#065F46', fontSize: 14, lineHeight: 21 },
  messageTextError: { color: '#991B1B' },
  infoText: { color: '#1E40AF', fontSize: 14, lineHeight: 21 },
  button: {
    backgroundColor: '#2563EB', borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center',
    alignSelf: 'flex-start',
  },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});

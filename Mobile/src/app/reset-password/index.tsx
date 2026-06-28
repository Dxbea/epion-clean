import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { API_BASE, WEB_ORIGIN, readJson } from '@/lib/api';

function pwErr(pw: string): string | null {
  if (pw.length < 8) return 'Au moins 8 caractères requis.';
  if (!/[A-Z]/.test(pw)) return 'Au moins une majuscule.';
  if (!/[a-z]/.test(pw)) return 'Au moins une minuscule.';
  if (!/[0-9]/.test(pw)) return 'Au moins un chiffre.';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Au moins un caractère spécial.';
  return null;
}

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  const [email, setEmail] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const requestLink = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setMessage('Email requis.'); return; }

    setStatus('loading');
    setMessage('Envoi en cours…');

    try {
      const response = await fetch(`${API_BASE}/api/auth/forget-password`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Origin: WEB_ORIGIN,
          Referer: `${WEB_ORIGIN}/`,
        },
        body: JSON.stringify({
          email: trimmed,
          redirectTo: `${WEB_ORIGIN}/reset-password`,
        }),
      });

      // Message générique anti-énumération — ne pas révéler si l'email existe
      await readJson(response);
      setStatus('done');
      setMessage('Si ce compte existe, un lien de réinitialisation a été envoyé.');
    } catch {
      setStatus('done');
      setMessage('Si ce compte existe, un lien de réinitialisation a été envoyé.');
    }
  }, [email]);

  const resetPassword = useCallback(async () => {
    if (!token) { setMessage('Lien invalide ou expiré.'); return; }

    const err = pwErr(newPwd);
    if (err) { setMessage(err); return; }
    if (newPwd !== confirm) { setMessage('Les mots de passe ne correspondent pas.'); return; }

    setStatus('loading');
    setMessage('Enregistrement…');

    try {
      const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Origin: WEB_ORIGIN,
          Referer: `${WEB_ORIGIN}/`,
        },
        body: JSON.stringify({ token, newPassword: newPwd }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        const errMsg =
          data && typeof data === 'object' && 'message' in data
            ? String((data as { message?: unknown }).message ?? '')
            : `HTTP ${response.status}`;
        setStatus('error');
        setMessage(response.status === 400 ? 'Lien invalide ou expiré.' : errMsg);
        return;
      }

      setStatus('done');
      setNewPwd('');
      setConfirm('');
      setMessage('Mot de passe mis à jour. Tu peux maintenant te connecter.');
    } catch {
      setStatus('error');
      setMessage('Erreur réseau. Réessaie dans un instant.');
    }
  }, [token, newPwd, confirm]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>Epion</Text>
      <Text style={styles.title}>{token ? 'Nouveau mot de passe' : 'Réinitialiser'}</Text>
      <Text style={styles.subtitle}>
        {token
          ? 'Choisis un nouveau mot de passe pour ton compte Epion.'
          : 'Saisis ton email pour recevoir un lien de réinitialisation.'}
      </Text>

      {!token ? (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            editable={status !== 'loading'}
          />
          <Pressable
            style={[styles.button, status === 'loading' && styles.buttonDisabled]}
            onPress={requestLink}
            disabled={status === 'loading'}
          >
            {status === 'loading'
              ? <ActivityIndicator color="#FFF" size="small" />
              : <Text style={styles.buttonText}>Envoyer le lien</Text>}
          </Pressable>
        </View>
      ) : (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={newPwd}
            onChangeText={setNewPwd}
            placeholder="Nouveau mot de passe"
            secureTextEntry
            textContentType="newPassword"
            editable={status !== 'loading' && status !== 'done'}
          />
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Confirmer le mot de passe"
            secureTextEntry
            textContentType="newPassword"
            editable={status !== 'loading' && status !== 'done'}
          />
          <Text style={styles.hint}>8+ chars, 1 majuscule, 1 minuscule, 1 chiffre, 1 spécial.</Text>
          <Pressable
            style={[styles.button, (status === 'loading' || status === 'done') && styles.buttonDisabled]}
            onPress={resetPassword}
            disabled={status === 'loading' || status === 'done'}
          >
            {status === 'loading'
              ? <ActivityIndicator color="#FFF" size="small" />
              : <Text style={styles.buttonText}>Enregistrer</Text>}
          </Pressable>
        </View>
      )}

      {message ? (
        <View style={[styles.messageBox, status === 'error' && styles.messageBoxError]}>
          <Text style={[styles.messageText, status === 'error' && styles.messageTextError]}>
            {message}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7FAFC' },
  content: { gap: 16, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 64 },
  eyebrow: { color: '#2563EB', fontSize: 14, fontWeight: '700', textTransform: 'uppercase' },
  title: { color: '#111827', fontSize: 32, fontWeight: '800' },
  subtitle: { color: '#4B5563', fontSize: 16, lineHeight: 24 },
  form: { gap: 12, marginTop: 8 },
  input: {
    borderColor: '#D1D5DB', borderRadius: 8, borderWidth: 1,
    color: '#111827', fontSize: 16, paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  hint: { color: '#6B7280', fontSize: 12 },
  button: {
    backgroundColor: '#2563EB', borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  messageBox: {
    backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderRadius: 8,
    borderWidth: 1, padding: 14,
  },
  messageBoxError: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  messageText: { color: '#1E40AF', fontSize: 14, lineHeight: 21 },
  messageTextError: { color: '#991B1B' },
});

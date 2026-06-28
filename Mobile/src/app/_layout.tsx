import { Stack } from 'expo-router';

import { AuthProvider } from '@/context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="article/[id]"
          options={{
            headerShown: true,
            headerBackTitle: 'Retour',
            title: 'Article',
          }}
        />
      </Stack>
    </AuthProvider>
  );
}

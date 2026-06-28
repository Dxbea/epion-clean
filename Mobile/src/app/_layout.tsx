import { Stack } from 'expo-router';

import { AuthProvider } from '@/context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="article/[id]" options={{ headerShown: true, headerBackTitle: 'Retour', title: 'Article' }} />
        <Stack.Screen name="news/categories/index" options={{ headerShown: true, headerBackTitle: 'Retour', title: 'Categories' }} />
        <Stack.Screen name="news/[slug]/index" options={{ headerShown: true, headerBackTitle: 'Retour', title: 'Categorie' }} />
        <Stack.Screen name="news/search/index" options={{ headerShown: true, headerBackTitle: 'Retour', title: 'Search' }} />
        <Stack.Screen name="chat/[id]/index" options={{ headerShown: true, headerBackTitle: 'Retour', title: 'Conversation' }} />
        <Stack.Screen name="settings/[category]/index" options={{ headerShown: true, headerBackTitle: 'Retour', title: 'Settings' }} />
      </Stack>
    </AuthProvider>
  );
}

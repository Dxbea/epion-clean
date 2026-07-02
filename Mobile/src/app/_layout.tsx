import { Stack } from 'expo-router';

import { AuthProvider } from '@/context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        {/* Tabs principale */}
        <Stack.Screen name="(tabs)" />

        {/* Article detail */}
        <Stack.Screen
          name="article/[id]"
          options={{ headerShown: true, headerBackTitle: 'Retour', title: 'Article' }}
        />

        {/* News sub-routes */}
        <Stack.Screen
          name="news/categories/index"
          options={{ headerShown: true, headerBackTitle: 'Retour', title: 'Catégories' }}
        />
        <Stack.Screen
          name="news/[slug]/index"
          options={{ headerShown: true, headerBackTitle: 'Retour', title: 'Catégorie' }}
        />
        <Stack.Screen
          name="news/search/index"
          options={{ headerShown: true, headerBackTitle: 'Retour', title: 'Recherche' }}
        />

        {/* Chat */}
        <Stack.Screen
          name="chat/[id]/index"
          options={{ headerShown: true, headerBackTitle: 'Retour', title: 'Conversation' }}
        />

        {/* Settings */}
        <Stack.Screen
          name="settings/index"
          options={{ headerShown: true, headerBackTitle: 'Retour', title: 'Paramètres' }}
        />
        <Stack.Screen
          name="settings/[category]/index"
          options={{ headerShown: true, headerBackTitle: 'Paramètres', title: 'Paramètres' }}
        />

        {/* Account sub-routes */}
        <Stack.Screen
          name="account/articles/index"
          options={{ headerShown: true, headerBackTitle: 'Retour', title: 'Mes articles' }}
        />
        <Stack.Screen
          name="account/articles/[id]/edit"
          options={{ headerShown: true, headerBackTitle: 'Mes articles', title: 'Edit article' }}
        />

        {/* Activity */}
        <Stack.Screen
          name="activity/index"
          options={{ headerShown: true, headerBackTitle: 'Retour', title: 'Activité' }}
        />

        {/* Auth flows */}
        <Stack.Screen
          name="reset-password/index"
          options={{ headerShown: true, headerBackTitle: 'Retour', title: 'Réinitialiser' }}
        />
        <Stack.Screen
          name="verify-email/index"
          options={{ headerShown: true, headerBackTitle: 'Retour', title: 'Vérification email' }}
        />

        {/* Public profile */}
        <Stack.Screen
          name="u/[userId]/index"
          options={{ headerShown: true, headerBackTitle: 'Retour', title: 'Profil' }}
        />

        {/* Create article */}
        <Stack.Screen
          name="create/index"
          options={{ headerShown: true, headerBackTitle: 'Retour', title: 'Créer' }}
        />

        {/* Pages statiques — headerShown: false car elles ont leur propre header */}
        <Stack.Screen name="about/index" options={{ headerShown: false }} />
        <Stack.Screen name="legal/index" options={{ headerShown: false }} />
        <Stack.Screen name="contact/index" options={{ headerShown: false }} />
        <Stack.Screen name="help/index" options={{ headerShown: false }} />
        <Stack.Screen name="guide/index" options={{ headerShown: false }} />
        <Stack.Screen name="blog/index" options={{ headerShown: false }} />
        <Stack.Screen name="changelog/index" options={{ headerShown: false }} />
        <Stack.Screen name="press/index" options={{ headerShown: false }} />
        <Stack.Screen name="transparency/index" options={{ headerShown: false }} />
        <Stack.Screen name="download/index" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}

import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function ProfileScreen() {
  const params = useLocalSearchParams<{ userId?: string | string[] }>();
  const userId = useMemo(() => (Array.isArray(params.userId) ? params.userId[0] : params.userId) ?? '', [params.userId]);

  return (
    <PlaceholderScreen
      title="Profile"
      subtitle={userId ? `Utilisateur ${userId}` : 'Profil public'}
      status="Placeholder: profil public minimal en attente du contrat mobile final."
      links={[{ href: '/news', title: 'News' }]}
    />
  );
}

import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function ChatSessionScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = useMemo(() => (Array.isArray(params.id) ? params.id[0] : params.id) ?? '', [params.id]);

  return (
    <PlaceholderScreen
      title="Conversation"
      subtitle={id ? `Session ${id}` : 'Session chat'}
      status="Placeholder: lecture detaillee et envoi de messages seront branches apres validation du flux mobile."
      links={[{ href: '/chat', title: 'Retour au chat' }]}
    />
  );
}

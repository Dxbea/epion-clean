import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { PlaceholderScreen } from '@/components/placeholder-screen';

const labels: Record<string, string> = {
  account: 'Account settings',
  security: 'Security',
  accessibility: 'Accessibility',
  data: 'Data and privacy',
};

export default function SettingsCategoryScreen() {
  const params = useLocalSearchParams<{ category?: string | string[] }>();
  const category = useMemo(() => (Array.isArray(params.category) ? params.category[0] : params.category) ?? '', [params.category]);
  const title = labels[category] ?? 'Settings';

  return (
    <PlaceholderScreen
      title={title}
      subtitle="Section de reglages mobile."
      status="Placeholder: les formulaires de reglages seront branches apres cadrage de chaque section."
      links={[{ href: '/settings', title: 'Tous les reglages' }]}
    />
  );
}

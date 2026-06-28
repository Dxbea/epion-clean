import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function ActivityScreen() {
  return (
    <PlaceholderScreen
      title="Activity"
      subtitle="Historique et activite du compte."
      status="Placeholder: le flux /api/social/activity existe, mais l'interface mobile detaillee reste a definir."
      links={[{ href: '/account', title: 'Compte' }, { href: '/news', title: 'News' }]}
    />
  );
}

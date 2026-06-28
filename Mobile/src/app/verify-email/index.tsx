import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function VerifyEmailScreen() {
  return (
    <PlaceholderScreen
      title="Verify email"
      subtitle="Verification d'adresse email."
      status="Placeholder: route presente pour les liens de callback Better Auth."
      links={[{ href: '/account', title: 'Compte' }]}
    />
  );
}

import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function ResetPasswordScreen() {
  return (
    <PlaceholderScreen
      title="Reset password"
      subtitle="Recuperation de compte."
      status="Placeholder: le flux Better Auth web existe, l'ecran mobile sera branche quand le parcours natif sera confirme."
      links={[{ href: '/account', title: 'Compte' }]}
    />
  );
}

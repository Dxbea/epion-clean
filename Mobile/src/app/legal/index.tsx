import { ActionLink, Screen, StateBox } from '@/components/screen';

export default function LegalScreen() {
  return (
    <Screen title="Legal" subtitle="Informations legales Epion.">
      <StateBox title="Documents legaux" text="Versions mobiles simplifiees. Les contenus complets restent disponibles cote web." />
      <ActionLink href="/legal/privacy" title="Privacy" />
      <ActionLink href="/legal/terms" title="Terms" />
      <ActionLink href="/legal/cookies" title="Cookies" />
      <ActionLink href="/legal/moderation" title="Moderation" />
    </Screen>
  );
}

import { ActionLink, Screen, Section, StateBox } from '@/components/screen';

export default function SettingsScreen() {
  return (
    <Screen title="Settings" subtitle="Preferences, security and account shortcuts for the mobile app.">
      <Section title="Account">
        <ActionLink href="/account" title="My account" description="Login, logout and current session status." />
        <ActionLink href="/settings/account" title="Account settings" description="Placeholder for profile, email and account options." />
        <ActionLink href="/settings/security" title="Security" description="Placeholder for password, sessions and two-factor settings." />
      </Section>

      <Section title="Preferences">
        <StateBox title="Language and accessibility" text="Placeholder. Mobile preferences will be connected when the backend contract is ready." />
      </Section>

      <Section title="Help">
        <ActionLink href="/help" title="Help" description="Find support and basic guidance." />
        <ActionLink href="/legal" title="Legal" description="Privacy, terms, cookies and moderation policy." />
      </Section>
    </Screen>
  );
}



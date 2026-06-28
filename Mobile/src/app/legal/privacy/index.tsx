import { StaticInfoScreen } from '@/components/static-info-screen';

export default function PrivacyScreen() {
  return (
    <StaticInfoScreen
      title="Privacy Policy"
      subtitle="How Epion collects, uses and protects your data."
      sections={[
        {
          title: 'Privacy',
          paragraphs: [
            'Your privacy is important to us. This page explains how Epion collects, uses, and protects your data.',
            'We only store what is necessary for your account and never share your personal information with third parties without your consent.',
          ],
        },
      ]}
      links={[{ href: '/legal', title: 'Legal' }, { href: '/legal/cookies', title: 'Cookies' }]}
    />
  );
}

import { StaticInfoScreen } from '@/components/static-info-screen';

export default function HelpScreen() {
  return (
    <StaticInfoScreen
      title="Help & Support"
      subtitle="First-level help for using Epion."
      sections={[
        {
          title: 'Need assistance?',
          paragraphs: ['Need assistance? You can find answers in our guide or contact support.'],
        },
        {
          title: 'Coming next',
          paragraphs: ['FAQ and step-by-step tutorials will be available here soon.'],
        },
      ]}
      note="The web page does not contain the full FAQ yet; this mobile page keeps the same limitation."
      links={[
        { href: '/guide', title: 'Guide' },
        { href: '/contact', title: 'Contact' },
      ]}
    />
  );
}

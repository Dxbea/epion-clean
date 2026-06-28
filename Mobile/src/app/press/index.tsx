import { StaticInfoScreen } from '@/components/static-info-screen';

export default function PressScreen() {
  return (
    <StaticInfoScreen
      title="Press"
      subtitle="Press inquiries and materials."
      sections={[
        {
          title: 'Press resources',
          paragraphs: ['Media kit and press contacts will be available here.'],
        },
      ]}
      note="The press kit button exists on the web page but is disabled."
      links={[{ href: '/contact', title: 'Contact us' }]}
    />
  );
}

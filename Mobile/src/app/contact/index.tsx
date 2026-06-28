import { StaticInfoScreen } from '@/components/static-info-screen';

export default function ContactScreen() {
  return (
    <StaticInfoScreen
      title="Contact us"
      subtitle="Questions, feedback, partnerships."
      sections={[
        {
          title: 'Contact form fields',
          paragraphs: ['The web page exposes a disabled contact form with name, email and message fields.'],
          bullets: ['Your name', 'Your email', 'Your message', 'Send'],
        },
      ]}
      note="No working mobile contact submission is added because the web form is disabled too."
      links={[{ href: '/help', title: 'Help & Support' }]}
    />
  );
}

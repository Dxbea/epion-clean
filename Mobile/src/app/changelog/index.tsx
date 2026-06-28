import { StaticInfoScreen } from '@/components/static-info-screen';

export default function ChangelogScreen() {
  return (
    <StaticInfoScreen
      title="Changelog"
      subtitle="What changed, and when."
      sections={[
        {
          title: '0.1.0',
          paragraphs: ['Initial public pages added.'],
        },
      ]}
      links={[{ href: '/blog', title: 'Blog' }]}
    />
  );
}

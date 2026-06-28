import { StaticInfoScreen } from '@/components/static-info-screen';

export default function BlogScreen() {
  return (
    <StaticInfoScreen
      title="Epion Blog"
      subtitle="Notes and updates from the team."
      sections={[
        {
          title: 'Posts',
          paragraphs: ['No post yet. Stay tuned.'],
        },
      ]}
      note="The web blog currently exposes an empty state only."
      links={[{ href: '/changelog', title: 'Changelog' }]}
    />
  );
}

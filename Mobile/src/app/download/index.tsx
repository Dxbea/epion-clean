import { StaticInfoScreen } from '@/components/static-info-screen';

export default function DownloadScreen() {
  return (
    <StaticInfoScreen
      title="Install Epion"
      subtitle="Epion is available today as an installable web app."
      sections={[
        {
          title: 'Chrome and Edge',
          paragraphs: ['Use the Install Epion button when available, or open the browser menu and choose Install app.'],
        },
        {
          title: 'iPhone and Safari',
          paragraphs: ['Open Share, then choose Add to Home Screen to place Epion on your home screen.'],
        },
        {
          title: 'App stores',
          paragraphs: ['Epion is not on the App Store or Play Store yet. The current install path is the PWA.'],
        },
      ]}
      note="The installed app opens directly on News and uses the live Epion web experience."
      links={[{ href: '/news', title: 'News' }]}
    />
  );
}

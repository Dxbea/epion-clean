import { ActionLink, Screen, StateBox } from '@/components/screen';

type PlaceholderScreenProps = {
  title: string;
  subtitle?: string;
  status?: string;
  links?: Array<{
    href: string;
    title: string;
    description?: string;
  }>;
};

export function PlaceholderScreen({ title, subtitle, status, links = [] }: PlaceholderScreenProps) {
  return (
    <Screen title={title} subtitle={subtitle}>
      <StateBox title={status ?? 'Placeholder mobile'} text="Cette page existe pour poser la navigation. La logique complete sera branchee plus tard." />
      {links.map((link) => (
        <ActionLink key={link.href} href={link.href} title={link.title} description={link.description} />
      ))}
    </Screen>
  );
}


import { Text, View, StyleSheet } from 'react-native';

import { ActionLink, Screen, Section } from '@/components/screen';

type StaticInfoLink = {
  href: string;
  title: string;
  description?: string;
};

type StaticInfoSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

type StaticInfoScreenProps = {
  title: string;
  subtitle?: string;
  sections: StaticInfoSection[];
  links?: StaticInfoLink[];
  note?: string;
};

export function StaticInfoScreen({ title, subtitle, sections, links = [], note }: StaticInfoScreenProps) {
  return (
    <Screen title={title} subtitle={subtitle}>
      {sections.map((section) => (
        <Section key={section.title} title={section.title}>
          {section.paragraphs?.map((paragraph) => (
            <Text key={paragraph} style={styles.bodyText}>
              {paragraph}
            </Text>
          ))}
          {section.bullets?.length ? (
            <View style={styles.list}>
              {section.bullets.map((bullet) => (
                <Text key={bullet} style={styles.bodyText}>
                  - {bullet}
                </Text>
              ))}
            </View>
          ) : null}
        </Section>
      ))}

      {note ? (
        <View style={styles.note}>
          <Text style={styles.noteText}>{note}</Text>
        </View>
      ) : null}

      {links.map((link) => (
        <ActionLink key={link.href} href={link.href} title={link.title} description={link.description} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: '#374151',
    fontSize: 15,
    lineHeight: 22,
  },
  list: {
    gap: 8,
  },
  note: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  noteText: {
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 20,
  },
});

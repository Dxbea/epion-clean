import type { ReactNode } from 'react';
import { Link, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type ScreenProps = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
};

type ActionLinkProps = {
  href: string | Href;
  title: string;
  description?: string;
};

type StateBoxProps = {
  title: string;
  text?: string;
};

export function Screen({ title, subtitle, children }: ScreenProps) {
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Epion</Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {children}
      </ScrollView>
    </View>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function ActionLink({ href, title, description }: ActionLinkProps) {
  return (
    <Link href={href as Href} asChild>
      <Pressable style={({ pressed }) => [styles.linkCard, pressed ? styles.pressed : null]}>
        <Text style={styles.linkTitle}>{title}</Text>
        {description ? <Text style={styles.linkDescription}>{description}</Text> : null}
      </Pressable>
    </Link>
  );
}

export function StateBox({ title, text }: StateBoxProps) {
  return (
    <View style={styles.stateBox}>
      <Text style={styles.stateTitle}>{title}</Text>
      {text ? <Text style={styles.stateText}>{text}</Text> : null}
    </View>
  );
}


const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  content: {
    gap: 16,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 64,
  },
  header: {
    marginBottom: 6,
  },
  eyebrow: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#111827',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 10,
  },
  subtitle: {
    color: '#4B5563',
    fontSize: 16,
    lineHeight: 23,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
  },
  linkCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  pressed: {
    opacity: 0.72,
  },
  linkTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 23,
  },
  linkDescription: {
    color: '#4B5563',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  stateBox: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
  },
  stateTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 23,
  },
  stateText: {
    color: '#4B5563',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  bodyText: {
    color: '#374151',
    fontSize: 15,
    lineHeight: 22,
  },
});



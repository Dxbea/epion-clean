import type { ReactNode } from 'react';
import { Link, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { Fonts, FontSize, Radius, Spacing } from '@/constants/theme';

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
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing['2xl'] }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text, fontFamily: Fonts.display }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
        </View>
        {children}
      </ScrollView>
    </View>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const colors = useTheme();

  return (
    <View style={[styles.section, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: Fonts.display }]}>{title}</Text>
      {children}
    </View>
  );
}

export function ActionLink({ href, title, description }: ActionLinkProps) {
  const colors = useTheme();

  return (
    <Link href={href as Href} asChild>
      <Pressable style={({ pressed }) => [styles.linkCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.borderSubtle }, pressed ? styles.pressed : null]}>
        <Text style={[styles.linkTitle, { color: colors.text }]}>{title}</Text>
        {description ? <Text style={[styles.linkDescription, { color: colors.textMuted }]}>{description}</Text> : null}
      </Pressable>
    </Link>
  );
}

export function StateBox({ title, text }: StateBoxProps) {
  const colors = useTheme();

  return (
    <View style={[styles.stateBox, { backgroundColor: colors.backgroundSubtle, borderColor: colors.borderSubtle }]}>
      <Text style={[styles.stateTitle, { color: colors.textTertiary }]}>{title}</Text>
      {text ? <Text style={[styles.stateText, { color: colors.textMuted }]}>{text}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    gap: Spacing['3xl'],
    paddingHorizontal: Spacing.xl,
    paddingBottom: 40,
  },
  header: {
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize['4xl'],
    fontWeight: '500',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  section: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '500',
  },
  linkCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  pressed: {
    opacity: 0.8,
  },
  linkTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  linkDescription: {
    fontSize: FontSize.base,
    lineHeight: 20,
    marginTop: 4,
  },
  stateBox: {
    borderRadius: Radius.xl,
    borderStyle: 'dashed',
    borderWidth: 1,
    padding: Spacing.xl,
  },
  stateTitle: {
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  stateText: {
    fontSize: FontSize.base,
    lineHeight: 20,
    marginTop: Spacing.sm,
  },
});

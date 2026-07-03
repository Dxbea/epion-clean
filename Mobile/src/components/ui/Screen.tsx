import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { Fonts, FontSize, Spacing } from '@/constants/theme';

type ScreenProps = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  headerRight?: ReactNode;
};

export function Screen({ title, subtitle, children, headerRight }: ScreenProps) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing['2xl'] }]}
        showsVerticalScrollIndicator={false}
      >
        {title || subtitle || headerRight ? (
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                {title ? <Text style={[styles.title, { color: colors.text, fontFamily: Fonts.display }]}>{title}</Text> : null}
                {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
              </View>
              {headerRight ?? null}
            </View>
          </View>
        ) : null}
        {children}
      </ScrollView>
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
    gap: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
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
});

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, Spacing } from '@/constants/theme';

type LoadingStateProps = {
  message?: string;
};

export function LoadingState({ message = 'Chargement...' }: LoadingStateProps) {
  const colors = useTheme();

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.textMuted} />
      <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing['2xl'],
  },
  message: {
    fontSize: FontSize.base,
  },
});

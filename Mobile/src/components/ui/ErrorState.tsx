import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { Button } from './Button';
import { FontSize, Radius, Spacing } from '@/constants/theme';

type ErrorStateProps = {
  message: string;
  onRetry?: () => void;
};

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const colors = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundSubtle, borderColor: colors.border }]}>
      <Text style={[styles.message, { color: colors.error }]}>{message}</Text>
      {onRetry ? <Button title="Réessayer" onPress={onRetry} variant="secondary" size="sm" rounded /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: Radius.xl,
    borderWidth: 1,
    gap: Spacing.lg,
    padding: Spacing['2xl'],
  },
  message: {
    fontSize: FontSize.base,
    lineHeight: 20,
    textAlign: 'center',
  },
});

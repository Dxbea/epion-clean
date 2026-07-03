import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, Fonts, Radius, Spacing } from '@/constants/theme';

type InputProps = TextInputProps & {
  label?: string;
  error?: string;
};

export function Input({ label, error, style, ...props }: InputProps) {
  const colors = useTheme();

  return (
    <View style={styles.container}>
      {label ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.inputBackground,
            borderColor: error ? colors.error : colors.border,
            color: colors.text,
          },
          style,
        ]}
        keyboardType={props.keyboardType ?? 'default'}
        autoCapitalize={props.autoCapitalize ?? 'sentences'}
        autoCorrect={props.autoCorrect ?? !props.secureTextEntry}
        spellCheck={props.spellCheck ?? !props.secureTextEntry}
        textContentType={props.textContentType ?? (props.secureTextEntry ? 'password' : props.keyboardType === 'email-address' ? 'emailAddress' : 'none')}
        placeholderTextColor={colors.inputPlaceholder}
        {...props}
      />
      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: FontSize.base,
    fontWeight: '500',
  },
  input: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    fontSize: FontSize.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontFamily: Fonts.body,
  },
  error: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
});

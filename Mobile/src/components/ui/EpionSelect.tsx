import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';

import { FontSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type EpionSelectOption = {
  value: string;
  label: string;
};

type EpionSelectProps = {
  label?: string;
  value: string;
  options: EpionSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
};

export function EpionSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  loading = false,
}: EpionSelectProps) {
  const colors = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? placeholder,
    [options, placeholder, value],
  );
  const isDisabled = disabled || loading;

  function toggleOpen() {
    if (isDisabled) return;
    setIsOpen((current) => !current);
  }

  function selectValue(nextValue: string) {
    onChange(nextValue);
    setIsOpen(false);
  }

  return (
    <View style={styles.container}>
      {label ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}
      <Pressable
        disabled={isDisabled}
        onPress={toggleOpen}
        style={({ pressed }) => [
          styles.trigger,
          { backgroundColor: colors.inputBackground, borderColor: isOpen ? colors.primary : colors.border, shadowColor: colors.shadow },
          isDisabled ? styles.triggerDisabled : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={[styles.triggerText, { color: value ? colors.text : colors.inputPlaceholder }, !value ? styles.placeholderText : null]} numberOfLines={1}>
          {loading ? 'Loading...' : selectedLabel}
        </Text>
        {loading ? (
          <ActivityIndicator color={colors.textMuted} size="small" />
        ) : (
          <ChevronDown
            size={16}
            color={colors.textMuted}
            strokeWidth={2}
            style={isOpen ? styles.chevronOpen : undefined}
          />
        )}
      </Pressable>

      {isOpen ? (
        <View style={[styles.menu, { backgroundColor: colors.backgroundElevated, borderColor: colors.border, shadowColor: colors.shadow }]}>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.menuScroll}>
            {options.map((option) => {
              const active = option.value === value;
              return (
                <Pressable
                  key={option.value || '__empty'}
                  onPress={() => selectValue(option.value)}
                  style={({ pressed }) => [styles.option, active ? { backgroundColor: colors.tabBarActive } : null, pressed ? { backgroundColor: colors.tabBarPressed } : null]}
                >
                  <Text style={[styles.optionText, { color: colors.text }, active ? styles.optionTextActive : null]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
    position: 'relative',
    width: '100%',
  },
  label: {
    fontSize: FontSize.base,
    fontWeight: '500',
  },
  trigger: {
    alignItems: 'center',
    borderRadius: Radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  triggerDisabled: {
    opacity: 0.55,
    shadowOpacity: 0,
  },
  triggerText: {
    flex: 1,
    fontSize: FontSize.base,
    marginRight: Spacing.sm,
  },
  placeholderText: {
    opacity: 0.7,
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  menu: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    gap: 2,
    marginTop: Spacing.xs,
    maxHeight: 240,
    padding: 4,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
  },
  menuScroll: {
    maxHeight: 232,
  },
  option: {
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  optionText: {
    fontSize: FontSize.base,
  },
  optionTextActive: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.92,
  },
});
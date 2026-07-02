import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';

import { FontSize, Radius, Spacing } from '@/constants/theme';

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
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        disabled={isDisabled}
        onPress={toggleOpen}
        style={({ pressed }) => [
          styles.trigger,
          isOpen ? styles.triggerOpen : null,
          isDisabled ? styles.triggerDisabled : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={[styles.triggerText, !value ? styles.placeholderText : null]} numberOfLines={1}>
          {loading ? 'Loading...' : selectedLabel}
        </Text>
        {loading ? (
          <ActivityIndicator color="rgba(0,0,0,0.45)" size="small" />
        ) : (
          <ChevronDown
            size={16}
            color="rgba(0,0,0,0.50)"
            strokeWidth={2}
            style={isOpen ? styles.chevronOpen : undefined}
          />
        )}
      </Pressable>

      {isOpen ? (
        <View style={styles.menu}>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.menuScroll}>
            {options.map((option) => {
              const active = option.value === value;
              return (
                <Pressable
                  key={option.value || '__empty'}
                  onPress={() => selectValue(option.value)}
                  style={({ pressed }) => [styles.option, active ? styles.optionActive : null, pressed ? styles.optionPressed : null]}
                >
                  <Text style={[styles.optionText, active ? styles.optionTextActive : null]}>{option.label}</Text>
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
    color: '#374151',
    fontSize: FontSize.base,
    fontWeight: '500',
  },
  trigger: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: Radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  triggerOpen: {
    borderColor: '#000000',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 0,
  },
  triggerDisabled: {
    backgroundColor: '#F5F5F4',
    opacity: 0.55,
    shadowOpacity: 0,
  },
  triggerText: {
    color: '#111827',
    flex: 1,
    fontSize: FontSize.base,
    marginRight: Spacing.sm,
  },
  placeholderText: {
    opacity: 0.5,
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  menu: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: Radius.xl,
    borderWidth: 1,
    gap: 2,
    marginTop: Spacing.xs,
    maxHeight: 240,
    padding: 4,
    shadowColor: '#000000',
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
  optionActive: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  optionPressed: {
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  optionText: {
    color: '#111827',
    fontSize: FontSize.base,
  },
  optionTextActive: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.92,
  },
});
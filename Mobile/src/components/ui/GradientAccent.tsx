import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

type GradientAccentProps = {
  width?: number;
  height?: number;
  style?: ViewStyle;
};

export function GradientAccent({ width = 64, height = 4, style }: GradientAccentProps) {
  return (
    <View style={[styles.container, { width, height, borderRadius: height / 2 }, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 64 4" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="epionAccent" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#3B82F6" />
            <Stop offset="0.5" stopColor="#2DD4BF" />
            <Stop offset="1" stopColor="#10B981" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="64" height="4" rx="2" fill="url(#epionAccent)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
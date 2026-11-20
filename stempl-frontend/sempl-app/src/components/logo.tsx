import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Brand } from '@/constants/brand';

/**
 * Stempl logo: a clock ring (time) with a stamped check mark (registered),
 * on a rounded teal tile.
 */
export function LogoMark({ size = 72 }: { size?: number }) {
  return (
    <View style={[styles.shadow, { width: size, height: size, borderRadius: size * 0.27 }]}>
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Defs>
          <LinearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#3CC4BB" />
            <Stop offset="1" stopColor="#0F7F79" />
          </LinearGradient>
        </Defs>
        <Rect width="120" height="120" rx="32" fill="url(#tile)" />
        {/* clock ring */}
        <Circle cx="60" cy="60" r="31" stroke="#FFFFFF" strokeWidth="8" fill="none" />
        {/* clock ticks at 12 and 6 */}
        <Path d="M60 22 V29 M60 91 V98" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" />
        {/* stamped check mark */}
        <Path
          d="M45 61 L56 72 L77 48"
          stroke="#FFC24B"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

/** Logo mark with the "stempl" wordmark underneath. */
export function Logo({ size = 72 }: { size?: number }) {
  return (
    <View style={styles.wrap}>
      <LogoMark size={size} />
      <Text style={styles.word}>
        stemp<Text style={{ color: Brand.orangeDark }}>l</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  shadow: { boxShadow: '0px 10px 24px rgba(15,127,121,0.35)' },
  word: { fontSize: 28, fontWeight: '800', color: Brand.blue, letterSpacing: -0.5 },
});

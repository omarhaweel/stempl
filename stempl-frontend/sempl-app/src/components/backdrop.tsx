import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { Brand } from '@/constants/brand';

/** Soft mint gradient with a few circles, like the reference dashboard; sits behind every page. */
export function Backdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={['#CDECE9', '#EAF5F4', '#F6FAFA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.ring} />
      <View style={styles.blobCoral} />
      <View style={styles.blobTeal} />
      <View style={styles.dotTeal} />
      <View style={styles.dotAmber} />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    top: -140,
    right: -120,
    width: 380,
    height: 380,
    borderRadius: 190,
    borderWidth: 2,
    borderColor: 'rgba(232,148,31,0.25)',
  },
  blobCoral: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: Brand.coralSoft,
    opacity: 0.55,
  },
  blobTeal: {
    position: 'absolute',
    bottom: -110,
    left: -100,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: Brand.blueSoft,
    opacity: 0.7,
  },
  dotTeal: { position: 'absolute', top: '42%', left: 14, width: 14, height: 14, borderRadius: 7, backgroundColor: Brand.blue },
  dotAmber: { position: 'absolute', bottom: '18%', right: 16, width: 12, height: 12, borderRadius: 6, backgroundColor: Brand.orangeDark },
});

/* eslint-disable react-hooks/refs -- gesture handlers read the latest props through a ref */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

const KNOB = 68;
const PAD = 4;
const THRESHOLD = 0.8;

type Props = {
  label: string;
  color: string;
  onConfirm: () => Promise<void> | void;
  busy?: boolean;
};

/** Drag the knob all the way to the right to confirm. */
export function SlideToConfirm({ label, color, onConfirm, busy }: Props) {
  const [width, setWidth] = useState(0);
  const [x] = useState(() => new Animated.Value(0));
  const max = Math.max(0, width - KNOB - PAD * 2);

  // Latest values for the (stable) pan handlers.
  const live = useRef({ max, busy, onConfirm });
  useEffect(() => {
    live.current = { max, busy, onConfirm };
  });

  const [pan] = useState(() =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !live.current.busy,
        onMoveShouldSetPanResponder: () => !live.current.busy,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => {
          x.setValue(Math.min(Math.max(0, g.dx), live.current.max));
        },
        onPanResponderRelease: (_, g) => {
          const { max: m, onConfirm: confirm } = live.current;
          if (m > 0 && g.dx >= m * THRESHOLD) {
            Animated.timing(x, { toValue: m, duration: 120, useNativeDriver: true }).start(async () => {
              try {
                await confirm();
              } finally {
                Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
              }
            });
          } else {
            Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
  );

  const textOpacity = x.interpolate({
    inputRange: [0, Math.max(1, max * 0.6)],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={[styles.track, { backgroundColor: color }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Animated.Text style={[styles.label, { opacity: textOpacity }]} numberOfLines={1}>
        {label}
      </Animated.Text>
      <Text style={styles.chevrons}>{busy ? '' : '›››'}</Text>
      <Animated.View
        {...pan.panHandlers}
        style={[styles.knob, { transform: [{ translateX: x }] }]}>
        {busy ? (
          <ActivityIndicator color={color} />
        ) : (
          <Ionicons name="chevron-forward" size={34} color={color} />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    alignSelf: 'stretch',
    height: KNOB + PAD * 2,
    borderRadius: 999,
    justifyContent: 'center',
    marginTop: 6,
  },
  label: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    paddingLeft: KNOB + 12,
    paddingRight: 48,
  },
  chevrons: {
    position: 'absolute',
    right: 22,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 22,
    fontWeight: '800',
  },
  knob: {
    position: 'absolute',
    left: PAD,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

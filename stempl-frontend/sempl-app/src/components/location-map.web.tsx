import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { buildMapHtml, type MapState } from '@/lib/map-html';

type Props = MapState & {
  token: string;
  onPick: (latitude: number, longitude: number) => void;
  style?: StyleProp<ViewStyle>;
};

/** Mapbox map (web): Mapbox GL JS inside an iframe. */
export function LocationMap({ token, places, pin, focus, onPick, style }: Props) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const html = useMemo(() => buildMapHtml(token), [token]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== frame.current?.contentWindow) return;
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'ready') setReady(true);
        else if (m.type === 'pick') onPick(m.latitude, m.longitude);
      } catch {
        // ignore malformed messages
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onPick]);

  useEffect(() => {
    if (!ready) return;
    const state: MapState = { places, pin, focus };
    frame.current?.contentWindow?.postMessage({ type: 'state', state }, '*');
  }, [ready, places, pin, focus]);

  return (
    <View style={[styles.box, style]}>
      {createElement('iframe', {
        ref: frame,
        srcDoc: html,
        title: 'Kart',
        sandbox: 'allow-scripts allow-same-origin',
        style: { border: 0, width: '100%', height: '100%' },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', borderRadius: 22, backgroundColor: '#EAF2FD' },
});

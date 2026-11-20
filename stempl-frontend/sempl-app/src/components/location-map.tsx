import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView as RNWebView } from 'react-native-webview';

import { buildMapHtml, type MapState } from '@/lib/map-html';

// react-native-webview's bundled types don't match this React Native version's
// component typings, so it is typed loosely here.
type WebViewHandle = { injectJavaScript: (js: string) => void };
type WebViewProps = {
  ref?: React.Ref<WebViewHandle>;
  originWhitelist: string[];
  source: { html: string; baseUrl: string };
  onMessage: (e: { nativeEvent: { data: string } }) => void;
  javaScriptEnabled?: boolean;
  domStorageEnabled?: boolean;
  nestedScrollEnabled?: boolean;
  style?: StyleProp<ViewStyle>;
};
const WebView = RNWebView as unknown as React.ComponentType<WebViewProps>;

type Props = MapState & {
  token: string;
  onPick: (latitude: number, longitude: number) => void;
  style?: StyleProp<ViewStyle>;
};

/** Mapbox map (phones): Mapbox GL JS inside a WebView. */
export function LocationMap({ token, places, pin, focus, onPick, style }: Props) {
  const ref = useRef<WebViewHandle>(null);
  const [ready, setReady] = useState(false);
  const html = useMemo(() => buildMapHtml(token), [token]);

  useEffect(() => {
    if (!ready) return;
    const state: MapState = { places, pin, focus };
    ref.current?.injectJavaScript(`window.__setState(${JSON.stringify(state)}); true;`);
  }, [ready, places, pin, focus]);

  function onMessage(e: { nativeEvent: { data: string } }) {
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.type === 'ready') setReady(true);
      else if (m.type === 'pick') onPick(m.latitude, m.longitude);
    } catch {
      // ignore malformed messages
    }
  }

  return (
    <View style={[styles.box, style]}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://localhost' }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        nestedScrollEnabled
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', borderRadius: 22, backgroundColor: '#EAF2FD' },
  web: { flex: 1, backgroundColor: 'transparent' },
});

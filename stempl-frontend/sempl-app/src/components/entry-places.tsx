import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/brand';
import type { TimeEntry } from '@/lib/time';

/** Where a stempling was made: the approved place's name (never GPS coordinates). */
export function EntryPlaces({ entry, pending }: { entry: TimeEntry; pending?: boolean }) {
  return (
    <View style={styles.box}>
      <Line label="Inn" place={entry.punchedInPlace} />
      {pending ? null : <Line label="Ut" place={entry.punchedOutPlace} />}
    </View>
  );
}

function Line({ label, place }: { label: string; place?: string | null }) {
  return (
    <View style={styles.line}>
      <Ionicons name={place ? 'location' : 'location-outline'} size={16} color={place ? Brand.green : Brand.muted} />
      <Text style={styles.label}>{label}:</Text>
      <Text style={[styles.place, !place && { color: Brand.muted, fontWeight: '400' }]} numberOfLines={2}>
        {place ?? 'Ikke registrert sted'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6, paddingTop: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { color: Brand.muted, fontSize: 13, fontWeight: '700' },
  place: { flex: 1, color: Brand.ink, fontSize: 14, fontWeight: '700' },
});

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EntryPlaces } from '@/components/entry-places';
import { Brand } from '@/constants/brand';
import { formatClock, formatDuration, formatShortDate, type TimeEntry } from '@/lib/time';

type Props = {
  entry: TimeEntry & { editedAt?: string | null };
  now: Date;
  showDate?: boolean;
  /** Admin only: shows a pencil that opens the edit dialog. */
  onEdit?: () => void;
};

/** A registrering; tap to expand and see where it was stamped. */
export function EntryRow({ entry, now, showDate = true, onEdit }: Props) {
  const [open, setOpen] = useState(false);
  const start = new Date(entry.punchedInAt);
  const end = entry.punchedOutAt ? new Date(entry.punchedOutAt) : null;
  const duration = (end ?? now).getTime() - start.getTime();
  return (
    <Pressable onPress={() => setOpen((o) => !o)} style={styles.row} accessibilityLabel="Vis sted">
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          {showDate ? (
            <Text style={[styles.date, (start.getDay() === 0 || start.getDay() === 6) && { color: Brand.orangeDark }]}>
              {formatShortDate(start)}
            </Text>
          ) : null}
          <Text style={showDate ? styles.muted : styles.time}>
            {formatClock(start)} – {end ? formatClock(end) : 'pågår'}
            {entry.editedAt ? ' · redigert' : ''}
          </Text>
          {entry.note ? <Text style={styles.note}>{entry.note}</Text> : null}
        </View>
        <Text style={[styles.duration, !end && { color: Brand.orangeDark }]}>{formatDuration(duration)}</Text>
        {onEdit ? (
          <Pressable onPress={onEdit} hitSlop={8} accessibilityLabel="Rediger stempling">
            <Ionicons name="create-outline" size={18} color={Brand.blue} />
          </Pressable>
        ) : null}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Brand.muted} />
      </View>
      {open ? <EntryPlaces entry={entry} pending={!end} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { alignSelf: 'stretch', paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.25)' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  date: { fontWeight: '700', color: Brand.ink },
  time: { fontWeight: '700', color: Brand.ink },
  muted: { color: Brand.muted, fontSize: 14 },
  note: { color: Brand.ink, fontSize: 13, marginTop: 2 },
  duration: { fontWeight: '800', color: Brand.blue },
});

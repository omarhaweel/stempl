import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ErrorBanner, Field, PrimaryButton } from '@/components/form';
import { Sheet } from '@/components/ui';
import { Brand } from '@/constants/brand';
import { formatClock, formatShortDate } from '@/lib/time';
import type { AdminEntry } from '@/lib/admin-types';
import { ApiError } from '@/lib/api';
import { authed } from '@/lib/authed';
import { dateToInput, formatDateInput, formatTimeInput, parseDateTime, timeToInput } from '@/lib/date-input';

type Props = {
  visible: boolean;
  userId: string;
  /** Pass an entry to edit; omit to add a new one. */
  entry?: AdminEntry;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
};

type OverlapInfo = { overlaps: AdminEntry[]; merged: { punchedInAt: string; punchedOutAt: string | null } };

const describe = (from: string, to: string | null) =>
  `${formatShortDate(new Date(from))} ${formatClock(new Date(from))}–${to ? formatClock(new Date(to)) : 'pågår'}`;

// Mounted fresh each time it opens so the fields start from the entry.
export function EntrySheet(props: Props) {
  return <Inner key={`${props.visible}-${props.entry?.id ?? 'new'}`} {...props} />;
}

function Inner({ visible, userId, entry, onClose, onSaved, onDelete }: Props) {
  const editing = !!entry;
  const start = entry ? new Date(entry.punchedInAt) : null;
  const end = entry?.punchedOutAt ? new Date(entry.punchedOutAt) : null;

  const [date, setDate] = useState(start ? dateToInput(start) : dateToInput(new Date()));
  const [inTime, setInTime] = useState(start ? timeToInput(start) : '');
  const [outDate, setOutDate] = useState(end ? dateToInput(end) : start ? dateToInput(start) : dateToInput(new Date()));
  const [outTime, setOutTime] = useState(end ? timeToInput(end) : '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Set when the new times overlap other stemplinger; the admin must confirm the merge.
  const [overlap, setOverlap] = useState<OverlapInfo | null>(null);

  async function submit(confirmMerge = false) {
    const local: Record<string, string> = {};
    const inAt = parseDateTime(date, inTime);
    if (!inAt) local.punchedInAt = 'Bruk dd-mm-åååå og tt:mm';
    let outAt: Date | null = null;
    if (outTime) {
      outAt = parseDateTime(outDate, outTime);
      if (!outAt) local.punchedOutAt = 'Bruk dd-mm-åååå og tt:mm';
      else if (inAt && outAt < inAt) local.punchedOutAt = 'Ut-tid må være etter inn-tid';
    }
    setErrors(local);
    setFormError(null);
    setOverlap(null);
    if (Object.keys(local).length || !inAt) return;

    setLoading(true);
    try {
      const body = {
        punchedInAt: inAt.toISOString(),
        punchedOutAt: outAt ? outAt.toISOString() : null,
        note: note.trim(),
        ...(confirmMerge ? { confirmMerge: true } : {}),
      };
      if (editing) await authed(`/admin/entries/${entry.id}`, { method: 'PATCH', body });
      else await authed(`/admin/users/${userId}/entries`, { body });
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.data.code === 'overlap') {
        setOverlap({
          overlaps: e.data.overlaps as AdminEntry[],
          merged: e.data.merged as { punchedInAt: string; punchedOutAt: string | null },
        });
      } else if (e instanceof ApiError) {
        setErrors(e.fieldErrors);
        setFormError(Object.keys(e.fieldErrors).length ? null : e.message);
      } else {
        setFormError('Noe gikk galt. Prøv igjen.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet visible={visible} title={editing ? 'Rediger stempling' : 'Ny stempling'} onClose={onClose}>
      <View style={styles.row}>
        <View style={styles.half}>
          <Field label="Inn: dato" value={date} onChangeText={(v) => setDate(formatDateInput(v))} keyboardType="number-pad" maxLength={10} placeholder="dd-mm-åååå" />
        </View>
        <View style={styles.half}>
          <Field label="Inn: kl." value={inTime} onChangeText={(v) => setInTime(formatTimeInput(v))} keyboardType="number-pad" maxLength={5} placeholder="tt:mm" error={errors.punchedInAt} />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.half}>
          <Field label="Ut: dato" value={outDate} onChangeText={(v) => setOutDate(formatDateInput(v))} keyboardType="number-pad" maxLength={10} placeholder="dd-mm-åååå" />
        </View>
        <View style={styles.half}>
          <Field label="Ut: kl. (tom = pågår)" value={outTime} onChangeText={(v) => setOutTime(formatTimeInput(v))} keyboardType="number-pad" maxLength={5} placeholder="tt:mm" error={errors.punchedOutAt} />
        </View>
      </View>
      <Field label="Notat (valgfritt)" value={note} onChangeText={setNote} maxLength={500} error={errors.note} />

      {formError ? <ErrorBanner message={formError} /> : null}

      {overlap ? (
        <View style={styles.warning}>
          <Text style={styles.warningTitle}>Disse stemplingene overlapper</Text>
          {overlap.overlaps.map((o) => (
            <Text key={o.id} style={styles.warningText}>
              • {describe(o.punchedInAt, o.punchedOutAt)}
            </Text>
          ))}
          <Text style={styles.warningText}>
            De slås sammen til én stempling: {describe(overlap.merged.punchedInAt, overlap.merged.punchedOutAt)}. Total tid
            beregnes på nytt.
          </Text>
        </View>
      ) : null}

      {overlap ? (
        <PrimaryButton title="Slå sammen og lagre" onPress={() => submit(true)} loading={loading} />
      ) : (
        <PrimaryButton title="Lagre" onPress={() => submit()} loading={loading} />
      )}
      {editing && onDelete ? <PrimaryButton title="Slett stempling" onPress={onDelete} variant="danger" /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  warning: {
    gap: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: Brand.orangeSoft,
    borderWidth: 1,
    borderColor: Brand.orange,
  },
  warningTitle: { fontWeight: '800', color: Brand.ink, fontSize: 15 },
  warningText: { color: Brand.ink, fontSize: 14, lineHeight: 20 },
});

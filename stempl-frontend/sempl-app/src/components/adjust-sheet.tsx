import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ErrorBanner, Field, PrimaryButton } from '@/components/form';
import { Sheet } from '@/components/ui';
import { Brand } from '@/constants/brand';
import { ApiError } from '@/lib/api';
import { authed } from '@/lib/authed';
import { dateToIso, minutesToHoursInput, parseHoursMinutes } from '@/lib/date-input';
import { formatSignedDuration } from '@/lib/time';

type Props = {
  visible: boolean;
  userId: string;
  /** "dagen", "uken" or "måneden" */
  periodLabel: string;
  /** Currently shown total for the period, in minutes. */
  currentMinutes: number;
  onClose: () => void;
  onSaved: () => void;
};

export function AdjustSheet(props: Props) {
  return <Inner key={`${props.visible}-${props.periodLabel}`} {...props} />;
}

function Inner({ visible, userId, periodLabel, currentMinutes, onClose, onSaved }: Props) {
  const [value, setValue] = useState(minutesToHoursInput(currentMinutes));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const target = parseHoursMinutes(value);
  const delta = target === null ? null : target - currentMinutes;

  async function submit() {
    if (target === null) return setError('Bruk formatet tt:mm, for eksempel 37:30');
    if (!delta) return setError('Totalen er uendret');
    setLoading(true);
    setError(null);
    try {
      // Dated today, which lies inside the current day, week and month.
      await authed(`/admin/users/${userId}/adjustments`, {
        body: { date: dateToIso(new Date()), minutes: delta, note: note.trim() },
      });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Noe gikk galt. Prøv igjen.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet visible={visible} title={`Juster totalen for ${periodLabel}`} onClose={onClose}>
      <Text style={styles.info}>Nåværende total: {minutesToHoursInput(currentMinutes)} timer</Text>
      <Field label="Ny total (tt:mm)" value={value} onChangeText={setValue} keyboardType="numbers-and-punctuation" placeholder="37:30" />
      {delta ? <Text style={styles.delta}>Justering: {formatSignedDuration(delta)}</Text> : null}
      <Field label="Begrunnelse (valgfritt)" value={note} onChangeText={setNote} maxLength={500} />
      {error ? <ErrorBanner message={error} /> : null}
      <PrimaryButton title="Lagre justering" onPress={submit} loading={loading} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  info: { color: Brand.muted, fontSize: 15 },
  delta: { color: Brand.ink, fontWeight: '700' },
});

import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { EntrySheet } from '@/components/entry-sheet';
import { ErrorBanner } from '@/components/form';
import { PERIOD_TITLE, PeriodBreakdown, type Period } from '@/components/period-breakdown';
import { Card, ConfirmSheet, IconButton, Screen, SmallButton } from '@/components/ui';
import { Brand } from '@/constants/brand';
import type { AdminDetail, AdminEntry } from '@/lib/admin-types';
import { ApiError } from '@/lib/api';
import { authed } from '@/lib/authed';
import {
  formatDuration,
  startOfDay,
  startOfMonth,
  startOfNextMonth,
  startOfWeek,
  totalBetween,
} from '@/lib/time';

const isPeriod = (v: unknown): v is Period => v === 'day' || v === 'week' || v === 'month';

/** Admin view of a user's tidsregistreringer for I dag / Denne uken / Denne måneden, with editing. */
export default function AdminPeriodScreen() {
  const { id, period: param } = useLocalSearchParams<{ id: string; period?: string }>();
  const period: Period = isPeriod(param) ? param : 'day';
  const router = useRouter();

  const [data, setData] = useState<AdminDetail | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [entrySheet, setEntrySheet] = useState<{ entry?: AdminEntry } | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<AdminEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      setData(await authed<AdminDetail>(`/admin/users/${id}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Noe gikk galt');
    }
  }, [id]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const total = useMemo(() => {
    if (!data) return 0;
    const dayStart = startOfDay(now);
    const weekStart = startOfWeek(now);
    const ranges = {
      day: [dayStart, new Date(dayStart.getTime() + 86400000)],
      week: [weekStart, new Date(weekStart.getTime() + 7 * 86400000)],
      month: [startOfMonth(now), startOfNextMonth(now)],
    } as const;
    return totalBetween(data.entries, data.adjustments, ...ranges[period], now);
  }, [data, now, period]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/admin/${id}` as Href));
  const readOnly = data?.user.role === 'admin';

  async function confirmDelete() {
    if (!deletingEntry) return;
    setBusy(true);
    setDialogError(null);
    try {
      await authed(`/admin/entries/${deletingEntry.id}`, { method: 'DELETE' });
      setDeletingEntry(null);
      load();
    } catch (e) {
      setDialogError(e instanceof ApiError ? e.message : 'Noe gikk galt');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={Brand.blue}
        />
      }>
      <View style={styles.headerRow}>
        <IconButton icon="arrow-back" label="Tilbake" onPress={goBack} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{PERIOD_TITLE[period]}</Text>
          <Text style={styles.muted} numberOfLines={1}>
            {data ? `${data.user.firstName} ${data.user.lastName} · Tidsregistreringer` : 'Tidsregistreringer'}
          </Text>
        </View>
        {data ? <Text style={styles.total}>{formatDuration(total)}</Text> : null}
      </View>

      {error ? <ErrorBanner message={error} /> : null}
      {!data && !error ? <ActivityIndicator color={Brand.blue} style={{ paddingVertical: 40 }} /> : null}

      {data && !readOnly ? (
        <Card style={styles.actions}>
          <View style={styles.actionRow}>
            <SmallButton title="Legg til stempling" icon="add" tone="orange" onPress={() => setEntrySheet({})} />
          </View>
          <Text style={styles.hint}>
            Totalen er summen av stemplingene. Trykk på blyanten ved en registrering for å redigere eller slette den.
          </Text>
        </Card>
      ) : null}

      {data ? (
        <PeriodBreakdown
          period={period}
          entries={data.entries}
          adjustments={data.adjustments}
          now={now}
          onEdit={readOnly ? undefined : (e) => setEntrySheet({ entry: e as AdminEntry })}
        />
      ) : null}

      {data ? (
        <>
          <EntrySheet
            visible={!!entrySheet}
            userId={data.user.id}
            entry={entrySheet?.entry}
            onClose={() => setEntrySheet(null)}
            onSaved={() => {
              setEntrySheet(null);
              load();
            }}
            onDelete={() => {
              if (entrySheet?.entry) {
                setDialogError(null);
                setDeletingEntry(entrySheet.entry);
                setEntrySheet(null);
              }
            }}
          />

          <ConfirmSheet
            visible={!!deletingEntry}
            title="Slett stempling?"
            message="Stemplingen slettes permanent. Dette kan ikke angres."
            confirmLabel="Slett stempling"
            busy={busy}
            error={dialogError}
            onCancel={() => setDeletingEntry(null)}
            onConfirm={confirmDelete}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 26, fontWeight: '800', color: Brand.ink },
  muted: { color: Brand.muted, fontSize: 14 },
  total: { fontSize: 20, fontWeight: '800', color: Brand.blue },
  actions: { padding: 16, gap: 10 },
  actionRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  hint: { color: Brand.muted, fontSize: 13 },
});

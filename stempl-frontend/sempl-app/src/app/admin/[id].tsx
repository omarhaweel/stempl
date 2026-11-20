import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { EntryRow } from '@/components/entry-row';
import { ErrorBanner } from '@/components/form';
import { Card, ConfirmSheet, IconButton, Screen, SmallButton } from '@/components/ui';
import { UserFormSheet } from '@/components/user-form-sheet';
import { Brand } from '@/constants/brand';
import { ROLE_LABEL, type AdminDetail } from '@/lib/admin-types';
import { ApiError } from '@/lib/api';
import { authed } from '@/lib/authed';
import { isoToDateInput } from '@/lib/date-input';
import {
  formatClock,
  formatDuration,
  startOfDay,
  startOfMonth,
  startOfNextMonth,
  startOfWeek,
  totalBetween,
} from '@/lib/time';

type Period = { key: 'day' | 'week' | 'month'; label: string; of: string };
const PERIODS: Period[] = [
  { key: 'day', label: 'I dag', of: 'dagen' },
  { key: 'week', label: 'Denne uken', of: 'uken' },
  { key: 'month', label: 'Denne måneden', of: 'måneden' },
];

export default function AdminUserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<AdminDetail | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [editingUser, setEditingUser] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
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

  const totals = useMemo(() => {
    const entries = data?.entries ?? [];
    const adj = data?.adjustments ?? [];
    const dayStart = startOfDay(now);
    const weekStart = startOfWeek(now);
    const ranges = {
      day: [dayStart, new Date(dayStart.getTime() + 86400000)],
      week: [weekStart, new Date(weekStart.getTime() + 7 * 86400000)],
      month: [startOfMonth(now), startOfNextMonth(now)],
    } as const;
    return {
      day: totalBetween(entries, adj, ...ranges.day, now),
      week: totalBetween(entries, adj, ...ranges.week, now),
      month: totalBetween(entries, adj, ...ranges.month, now),
    };
  }, [data, now]);

  async function run(action: () => Promise<unknown>, after: () => void) {
    setBusy(true);
    setDialogError(null);
    try {
      await action();
      after();
    } catch (e) {
      setDialogError(e instanceof ApiError ? e.message : 'Noe gikk galt');
    } finally {
      setBusy(false);
    }
  }

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/admin' as Href));

  if (!data) {
    return (
      <Screen>
        <View style={styles.headerRow}>
          <IconButton icon="arrow-back" label="Tilbake" onPress={goBack} />
        </View>
        {error ? <ErrorBanner message={error} /> : <ActivityIndicator color={Brand.blue} style={{ paddingVertical: 40 }} />}
      </Screen>
    );
  }

  const { user, entries } = data;
  const readOnly = user.role === 'admin';

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
        <Text style={styles.title} numberOfLines={1}>
          {user.firstName} {user.lastName}
        </Text>
      </View>

      {/* Profile */}
      <Card>
        <Row icon="mail-outline" text={user.email} />
        {user.phone ? <Row icon="call-outline" text={user.phone} /> : null}
        {user.dateOfBirth ? <Row icon="calendar-outline" text={isoToDateInput(user.dateOfBirth)} /> : null}
        <Row icon="shield-checkmark-outline" text={ROLE_LABEL[user.role]} />
        <Row
          icon={user.activeSince ? 'radio-button-on' : 'radio-button-off'}
          text={user.activeSince ? `Stemplet inn siden ${formatClock(new Date(user.activeSince))}` : 'Stemplet ut'}
        />
        {!readOnly && (
          <View style={styles.todayPlaces}>
            <Text style={styles.todayTitle}>Godkjente arbeidssteder</Text>
            {user.workplaces && user.workplaces.length > 0 ? (
              user.workplaces.map((name, i) => (
                <View key={`${name}-${i}`} style={styles.todayPlace}>
                  <Ionicons name="location" size={16} color={Brand.green} />
                  <Text style={styles.todayPlaceText}>{name}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.muted}>Ingen godkjente arbeidssteder. Brukeren kan stemple hvor som helst.</Text>
            )}
          </View>
        )}
        {!readOnly && (
          <View style={styles.actions}>
            <SmallButton
              title="Godkjente arbeidssteder"
              icon="location-outline"
              tone="green"
              onPress={() => router.push(`/admin/godkjente-steder/${user.id}` as Href)}
            />
            <SmallButton title="Rediger" icon="create-outline" onPress={() => setEditingUser(true)} />
            <SmallButton title="Slett bruker" icon="trash-outline" tone="red" onPress={() => { setDialogError(null); setDeletingUser(true); }} />
          </View>
        )}
      </Card>

      {/* Totals */}
      <View style={styles.totals}>
        {PERIODS.map((p) => (
          <Card key={p.key} style={styles.totalCard}>
            <Pressable
              onPress={() => router.push(`/admin/oversikt/${user.id}?period=${p.key}` as Href)}
              accessibilityLabel={`Vis registreringer: ${p.label}`}
              style={styles.totalPress}>
              <Text style={styles.totalValue}>{formatDuration(totals[p.key] ?? 0)}</Text>
              <Text style={styles.totalLabel}>{p.label}</Text>
              <Ionicons name="chevron-forward" size={14} color={Brand.muted} />
            </Pressable>
          </Card>
        ))}
      </View>

      {/* Stemplings */}
      <Card>
        <Text style={styles.section}>Siste registreringer</Text>
        {entries.length === 0 ? <Text style={styles.muted}>Ingen stemplinger ennå</Text> : null}
        {entries.slice(0, 8).map((e) => (
          <EntryRow key={e.id} entry={e} now={now} />
        ))}
      </Card>

      {error ? <ErrorBanner message={error} /> : null}

      <UserFormSheet
        visible={editingUser}
        user={user}
        onClose={() => setEditingUser(false)}
        onSaved={() => {
          setEditingUser(false);
          load();
        }}
      />

      <ConfirmSheet
        visible={deletingUser}
        title="Slett bruker?"
        message={`${user.firstName} ${user.lastName} og alle stemplinger slettes permanent. Dette kan ikke angres.`}
        confirmLabel="Slett bruker"
        busy={busy}
        error={dialogError}
        onCancel={() => setDeletingUser(false)}
        onConfirm={() => run(() => authed(`/admin/users/${user.id}`, { method: 'DELETE' }), () => { setDeletingUser(false); goBack(); })}
      />

    </Screen>
  );
}

function Row({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={Brand.muted} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontSize: 26, fontWeight: '800', color: Brand.ink },
  muted: { color: Brand.muted, fontSize: 14 },
  note: { color: Brand.ink, fontSize: 13, marginTop: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { color: Brand.ink, fontSize: 15, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' },
  todayPlaces: { gap: 6, paddingVertical: 4 },
  todayTitle: { fontSize: 14, fontWeight: '800', color: Brand.greenDark },
  todayPlace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 14,
    backgroundColor: Brand.greenSoft,
  },
  todayPlaceText: { flex: 1, color: Brand.ink, fontSize: 15, fontWeight: '700' },
  totals: { flexDirection: 'row', gap: 10 },
  totalCard: { flex: 1, alignItems: 'center', padding: 14, gap: 4 },
  totalPress: { alignItems: 'center', gap: 4 },
  totalValue: { fontSize: 18, fontWeight: '800', color: Brand.ink },
  totalLabel: { fontSize: 12, color: Brand.muted, textAlign: 'center' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { fontSize: 17, fontWeight: '800', color: Brand.ink },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148,163,184,0.25)',
  },
  entryBlock: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.25)' },
  entryTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  entryDate: { fontWeight: '700', color: Brand.ink },
  entryDuration: { fontWeight: '800', color: Brand.blue },
});

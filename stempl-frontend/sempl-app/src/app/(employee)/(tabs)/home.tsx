import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState,RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Backdrop } from '@/components/backdrop';
import { EntryRow } from '@/components/entry-row';
import { ErrorBanner } from '@/components/form';
import { IconButton, KpiCard } from '@/components/ui';
import { SlideToConfirm } from '@/components/slide-to-confirm';
import { Brand } from '@/constants/brand';
import { ROLE_LABEL } from '@/lib/admin-types';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { getPosition, warmUpPosition } from '@/lib/position';
import { getToken } from '@/lib/token-storage';
import {
  formatClock,
  formatClockSeconds,
  formatDuration,
  formatLongDate,
  formatTimer,
  startOfDay,
  startOfMonth,
  startOfNextMonth,
  startOfWeek,
  totalBetween,
  type TimeState,
} from '@/lib/time';


export default function HomeScreen() {
  const { user, logout } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [state, setState] = useState<TimeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const openPeriod = (p: 'day' | 'week' | 'month') => router.push(`/oversikt/${p}` as Href);

  // Hide an error message after 10 seconds.
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 10000);
    return () => clearTimeout(id);
  }, [error]);

  // Live clock.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async (keepError = false) => {
    try {
      const token = await getToken();
      setState(await api<TimeState>('/time', { token }));
      if (!keepError) setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Noe gikk galt');
      if (e instanceof ApiError && e.status === 401) logout();
    }
  }, [logout]);

  useEffect(() => {
    // Defer so state isn't set synchronously inside the effect.
    const id = setTimeout(warmUpPosition, 0);
    return () => clearTimeout(id);
  }, []);

  // Today's places come from the dagsplan the admin sends, and the admin can change them during the
  // day: reload when this tab is shown, when the app comes back to the front, and every 30 seconds.
  useFocusEffect(
    useCallback(() => {
      const first = setTimeout(() => load(), 0);
      const timer = setInterval(() => load(true), 30000);
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') load(true);
      });
      return () => {
        clearTimeout(first);
        clearInterval(timer);
        sub.remove();
      };
    }, [load]),
  );

  async function toggle() {
    if (busy || !state) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      // Position is checked on the server against the user's approved work places.
      const position = await getPosition();
      await api(state.active ? '/time/punch-out' : '/time/punch-in', { body: position ?? {}, token });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Noe gikk galt');
      // Refresh in the background, keeping the error visible.
      void load(true);
    } finally {
      setBusy(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const stats = useMemo(() => {
    const entries = state?.entries ?? [];
    const adj = state?.adjustments ?? [];
    const tomorrow = new Date(startOfDay(now).getTime() + 86400000);
    const weekStart = startOfWeek(now);
    return {
      today: totalBetween(entries, adj, startOfDay(now), tomorrow, now),
      week: totalBetween(entries, adj, weekStart, new Date(weekStart.getTime() + 7 * 86400000), now),
      month: totalBetween(entries, adj, startOfMonth(now), startOfNextMonth(now), now),
      shifts: entries.filter((e) => new Date(e.punchedInAt) >= startOfDay(now)).length,
    };
  }, [state, now]);

  if (!user) return null;

  const active = state?.active ?? null;
  const elapsed = active ? now.getTime() - new Date(active.punchedInAt).getTime() : 0;

  return (
    <View style={styles.container}>
      <Backdrop />
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Brand.blue} />}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user.firstName[0]}
                {user.lastName[0]}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.helloSmall}>Hei,</Text>
              <Text style={styles.hello} numberOfLines={1}>
                {user.firstName} {user.lastName}
              </Text>
              <Text style={styles.muted} numberOfLines={1}>
                {ROLE_LABEL[user.role]}
                {user.companyName ? ` · ${user.companyName}` : ''}
              </Text>
            </View>
            <IconButton icon="log-out-outline" label="Logg ut" onPress={logout} />
          </View>

          {/* Date and time */}
          <View style={[styles.card, styles.clockCard]}>
            <Text style={styles.clock}>{formatClockSeconds(now)}</Text>
            <Text style={styles.date}>{formatLongDate(now)}</Text>
          </View>

          {/* Punch card */}
          <View style={styles.card}>
            {!state ? (
              <ActivityIndicator color={Brand.blue} style={{ paddingVertical: 40 }} />
            ) : (
              <>
                <View style={[styles.statusPill, active ? styles.pillOn : styles.pillOff]}>
                  <View style={[styles.dot, { backgroundColor: active ? Brand.green : Brand.muted }]} />
                  <Text style={styles.pillText}>{active ? 'Stemplet inn' : 'Stemplet ut'}</Text>
                </View>

                {active ? (
                  <>
                    <Text style={styles.timer}>{formatTimer(elapsed)}</Text>
                    <Text style={styles.muted}>Startet kl. {formatClock(new Date(active.punchedInAt))}</Text>
                  </>
                ) : (
                  <Text style={styles.muted}>Dra for å starte arbeidsdagen</Text>
                )}

                <SlideToConfirm
                  label={active ? 'Dra for å stemple ut' : 'Dra for å stemple inn'}
                  color={active ? Brand.coral : Brand.blue}
                  busy={busy}
                  onConfirm={toggle}
                />
              </>
            )}
            {error ? <ErrorBanner message={error} /> : null}

            {state && state.locations && state.locations.length > 0 ? (
              <View style={styles.places}>
                <Text style={styles.placesTitle}>
                  {state.locations.length === 1 ? 'Ditt arbeidssted' : 'Dine arbeidssteder'}
                </Text>
                {state.locations.map((l) => (
                  <View key={l.id} style={styles.placeRow}>
                    <View style={styles.placeIcon}>
                      <Ionicons name="location" size={18} color={Brand.blue} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.placeName} numberOfLines={2}>
                        {l.name}
                      </Text>
                      <Text style={styles.muted}>Stempling innen {l.radiusM} m</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {/* Overview: KPI cards */}
          <Text style={styles.sectionTitle}>Oversikt</Text>
          <View style={styles.statsRow}>
            <KpiCard icon="today-outline" tone="teal" label="I dag" value={formatDuration(stats.today)} onPress={() => openPeriod('day')} />
            <KpiCard icon="calendar-outline" tone="amber" label="Denne uken" value={formatDuration(stats.week)} onPress={() => openPeriod('week')} />
            <KpiCard icon="calendar-number-outline" tone="coral" label="Denne måneden" value={formatDuration(stats.month)} onPress={() => openPeriod('month')} />
            <KpiCard icon="repeat-outline" tone="teal" label="Økter i dag" value={String(stats.shifts)} />
          </View>

          {/* History of last entries */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Siste registreringer</Text>
            {state && state.entries.length === 0 ? (
              <Text style={styles.muted}>Ingen registreringer ennå</Text>
            ) : (
              state?.entries.slice(0, 8).map((e) => <EntryRow key={e.id} entry={e} now={now} />)
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Brand.bg, overflow: 'hidden' },
  avatar: {
    width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Brand.blue, boxShadow: '0px 6px 16px rgba(23,147,141,0.35)',
  },
  avatarText: { color: '#ffffff', fontWeight: '800', fontSize: 18, textTransform: 'uppercase' },
  clockCard: { paddingVertical: 24 },
  safe: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center' },
  scroll: { padding: 20, gap: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  helloSmall: { fontSize: 15, fontWeight: '600', color: Brand.ink },
  hello: { fontSize: 24, fontWeight: '800', color: Brand.ink, lineHeight: 28 },
  muted: { color: Brand.muted, fontSize: 14 },
  card: {
    borderRadius: 22, padding: 18, gap: 10, alignItems: 'center',
    backgroundColor: Brand.card, borderWidth: 1, borderColor: Brand.glassBorder,
    boxShadow: Brand.shadow,
  },
  clock: { fontSize: 50, fontWeight: '800', color: Brand.blue, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  date: { fontSize: 15, color: Brand.muted },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  pillOn: { backgroundColor: Brand.greenSoft },
  pillOff: { backgroundColor: Brand.blueTint },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontWeight: '700', color: Brand.ink },
  timer: { fontSize: 40, fontWeight: '800', color: Brand.ink, fontVariant: ['tabular-nums'] },
  places: { alignSelf: 'stretch', gap: 8, marginTop: 6 },
  placesTitle: { fontSize: 14, fontWeight: '800', color: Brand.blueDark },
  placeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16,
    backgroundColor: Brand.blueTint,
  },
  placeIcon: {
    width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  placeName: { color: Brand.ink, fontSize: 15, fontWeight: '700' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  sectionTitle: { alignSelf: 'flex-start', fontSize: 17, fontWeight: '800', color: Brand.ink },
  cardTitle: { alignSelf: 'flex-start', fontSize: 17, fontWeight: '800', color: Brand.ink, paddingBottom: 6 },
});

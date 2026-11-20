import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { ErrorBanner } from '@/components/form';
import { PERIOD_TITLE, PeriodBreakdown, type Period } from '@/components/period-breakdown';
import { IconButton, Screen } from '@/components/ui';
import { Brand } from '@/constants/brand';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { getToken } from '@/lib/token-storage';
import {
  formatDuration,
  startOfDay,
  startOfMonth,
  startOfNextMonth,
  startOfWeek,
  totalBetween,
  type TimeState,
} from '@/lib/time';

const isPeriod = (v: unknown): v is Period => v === 'day' || v === 'week' || v === 'month';

/** Tidsregistreringer for I dag, Denne uken or Denne måneden. */
export default function PeriodScreen() {
  const { period: param } = useLocalSearchParams<{ period: string }>();
  const period: Period = isPeriod(param) ? param : 'day';
  const router = useRouter();
  const { logout } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [state, setState] = useState<TimeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      setState(await api<TimeState>('/time', { token: await getToken() }));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Noe gikk galt');
      if (e instanceof ApiError && e.status === 401) logout();
    }
  }, [logout]);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

  const total = useMemo(() => {
    if (!state) return 0;
    const ranges = {
      day: [startOfDay(now), new Date(startOfDay(now).getTime() + 86400000)],
      week: [startOfWeek(now), new Date(startOfWeek(now).getTime() + 7 * 86400000)],
      month: [startOfMonth(now), startOfNextMonth(now)],
    } as const;
    return totalBetween(state.entries, state.adjustments, ...ranges[period], now);
  }, [state, now, period]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/home' as Href));

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
          <Text style={styles.muted}>Tidsregistreringer</Text>
        </View>
        {state ? <Text style={styles.total}>{formatDuration(total)}</Text> : null}
      </View>

      {error ? <ErrorBanner message={error} /> : null}
      {!state && !error ? <ActivityIndicator color={Brand.blue} style={{ paddingVertical: 40 }} /> : null}
      {state ? (
        <PeriodBreakdown period={period} entries={state.entries} adjustments={state.adjustments} now={now} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 26, fontWeight: '800', color: Brand.ink },
  muted: { color: Brand.muted, fontSize: 14 },
  total: { fontSize: 20, fontWeight: '800', color: Brand.blue },
});

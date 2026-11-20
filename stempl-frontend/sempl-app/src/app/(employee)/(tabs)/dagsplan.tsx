import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { CommentThread } from '@/components/comment-thread';
import { ErrorBanner } from '@/components/form';
import { Card, Screen } from '@/components/ui';
import { Brand } from '@/constants/brand';
import { ApiError } from '@/lib/api';
import { authed } from '@/lib/authed';
import { dateToIso } from '@/lib/date-input';
import { isoToDate, type DayPlan } from '@/lib/dagsplan';
import { formatLongDate } from '@/lib/time';
import { refreshUnreadPlans } from '@/lib/unread-plans';

/** Employee: the dagsplan the administrator has sent (today and upcoming days). */
export default function DagsplanScreen() {
  const [plans, setPlans] = useState<DayPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const today = dateToIso(new Date());
      const list = (await authed<{ plans: DayPlan[] }>(`/me/dagsplan?from=${today}`)).plans;
      setPlans(list); // unread ones keep their «Ny» marker while this page is open
      setError(null);
      if (list.some((p) => !p.read || p.comments.some((c) => !c.mine && !c.read))) {
        await authed('/me/dagsplan/read', { method: 'POST', body: { from: today } });
      }
      await refreshUnreadPlans();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Noe gikk galt');
    }
  }, []);

  // Reload every time the tab is opened, so new plans show up and are marked as read.
  useFocusEffect(
    useCallback(() => {
      const id = setTimeout(load, 0);
      return () => clearTimeout(id);
    }, [load]),
  );

  const today = dateToIso(new Date());

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
      <Text style={styles.title}>Se dagsplan</Text>

      {error ? <ErrorBanner message={error} /> : null}
      {!plans && !error ? <ActivityIndicator color={Brand.blue} style={{ paddingVertical: 30 }} /> : null}
      {plans && plans.length === 0 ? (
        <Card>
          <Text style={styles.muted}>Du har ingen dagsplan ennå.</Text>
        </Card>
      ) : null}

      {plans?.map((p) => (
        <Card key={p.id} style={{ gap: 8 }}>
          <View style={styles.dateRow}>
            <Text style={styles.date}>
              {p.date === today ? 'I dag · ' : ''}
              {formatLongDate(isoToDate(p.date))}
            </Text>
            {!p.read ? <Text style={styles.newBadge}>Ny</Text> : null}
          </View>
          <Text style={styles.note}>{p.note}</Text>
          {p.sharedWith && p.sharedWith.length > 0 ? (
            <View style={styles.sharedRow}>
              <Ionicons name="people" size={16} color={Brand.blue} />
              <Text style={styles.sharedText}>Felles dagsplan med {p.sharedWith.join(', ')}. Dere skriver i samme tråd.</Text>
            </View>
          ) : null}
          <CommentThread
            comments={p.comments}
            onSend={async (body) => {
              await authed(`/me/dagsplan/${p.id}/comments`, { method: 'POST', body: { body } });
              await load();
            }}
          />
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  muted: { color: Brand.muted, fontSize: 15 },
  sharedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sharedText: { flex: 1, color: Brand.blue, fontSize: 13, fontWeight: '700' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  date: { fontSize: 16, fontWeight: '800', color: Brand.ink, flexShrink: 1 },
  newBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
    backgroundColor: Brand.orangeDark,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 18,
    backgroundColor: Brand.greenSoft,
  },
  placeIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  placeText: { flex: 1, color: Brand.ink, fontSize: 16, fontWeight: '700' },
  note: { color: Brand.ink, fontSize: 15, lineHeight: 21 },
});

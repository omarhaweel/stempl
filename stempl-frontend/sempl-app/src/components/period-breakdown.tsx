import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EntryRow } from '@/components/entry-row';
import { Brand } from '@/constants/brand';
import {
  entriesBetween,
  formatDuration,
  formatShortDate,
  isoWeek,
  startOfDay,
  startOfMonth,
  startOfNextMonth,
  startOfWeek,
  totalBetween,
  type Adjustment,
  type TimeEntry,
} from '@/lib/time';

export type Period = 'day' | 'week' | 'month';

type Entry = TimeEntry & { editedAt?: string | null };
type Ctx = {
  entries: Entry[];
  adjustments: Adjustment[];
  now: Date;
  /** Admin only: when set, every registrering gets an edit pencil. */
  onEdit?: (entry: Entry) => void;
};

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const PERIOD_TITLE: Record<Period, string> = { day: 'I dag', week: 'Denne uken', month: 'Denne måneden' };

/** Registreringer for today, this week (by day) or this month (by week, then day). */
export function PeriodBreakdown({ period, ...ctx }: Ctx & { period: Period }) {
  const { now } = ctx;
  const today = startOfDay(now);

  return (
    <View style={styles.card}>
      {period === 'day' && <DayEntries {...ctx} from={today} />}
      {period === 'week' && <WeekDays {...ctx} from={startOfWeek(now)} to={addDays(startOfWeek(now), 7)} showFuture />}
      {period === 'month' && <MonthWeeks {...ctx} />}
    </View>
  );
}

function DayEntries({ entries, now, from, onEdit }: Ctx & { from: Date }) {
  const list = entriesBetween(entries, from, addDays(from, 1), now);
  if (list.length === 0) return <Text style={styles.muted}>Ingen registreringer</Text>;
  return (
    <View>
      {list.map((e) => (
        <EntryRow key={e.id} entry={e} now={now} showDate={false} onEdit={onEdit && (() => onEdit(e))} />
      ))}
    </View>
  );
}

/** A day or week with its total. Starts closed; the user opens it to see the registreringer. */
function Group({
  title,
  subtitle,
  total,
  disabled,
  weekend,
  children,
}: {
  title: string;
  subtitle?: string;
  total: string;
  disabled?: boolean;
  /** Saturday and Sunday are shown in orange. */
  weekend?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.group}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        disabled={disabled}
        style={styles.groupHeader}
        accessibilityLabel={`Vis ${title}`}>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.groupTitle,
              weekend && { color: Brand.orangeDark },
              disabled && (weekend ? { opacity: 0.55 } : { color: Brand.muted }),
            ]}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
        </View>
        <Text style={[styles.total, disabled && { color: Brand.muted }]}>{total}</Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={Brand.muted}
          style={disabled ? { opacity: 0.3 } : undefined}
        />
      </Pressable>
      {open && !disabled ? <View style={styles.groupBody}>{children}</View> : null}
    </View>
  );
}

/** The days in [from, to), each expandable to its registreringer. */
function WeekDays({
  entries,
  adjustments,
  now,
  from,
  to,
  showFuture,
  onEdit,
}: Ctx & { from: Date; to: Date; showFuture?: boolean }) {
  const days: Date[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) {
    if (showFuture || d <= now) days.push(d);
  }
  return (
    <View>
      {days.map((day) => {
        const next = addDays(day, 1);
        const list = entriesBetween(entries, day, next, now);
        const total = totalBetween(entries, adjustments, day, next, now);
        return (
          <Group
            key={day.getTime()}
            title={formatShortDate(day)}
            weekend={day.getDay() === 0 || day.getDay() === 6}
            subtitle={list.length === 0 ? 'Ingen registreringer' : `${list.length} ${list.length === 1 ? 'økt' : 'økter'}`}
            total={formatDuration(total)}
            disabled={list.length === 0}>
            {list.map((e) => (
              <EntryRow key={e.id} entry={e} now={now} showDate={false} onEdit={onEdit && (() => onEdit(e))} />
            ))}
          </Group>
        );
      })}
    </View>
  );
}

/** Weeks of the current month (with week number), each expandable to its days. */
function MonthWeeks(ctx: Ctx) {
  const { now, entries, adjustments } = ctx;
  const monthStart = startOfMonth(now);
  const monthEnd = startOfNextMonth(now);

  const weeks: { monday: Date; from: Date; to: Date }[] = [];
  for (let monday = startOfWeek(monthStart); monday < monthEnd && monday <= now; monday = addDays(monday, 7)) {
    const from = monday < monthStart ? monthStart : monday;
    const nextMonday = addDays(monday, 7);
    weeks.push({ monday, from, to: nextMonday > monthEnd ? monthEnd : nextMonday });
  }

  return (
    <View>
      {weeks.map(({ monday, from, to }) => {
        const total = totalBetween(entries, adjustments, from, to, now);
        const count = entriesBetween(entries, from, to, now).length;
        return (
          <Group
            key={monday.getTime()}
            title={`Uke ${isoWeek(monday)}`}
            subtitle={`${from.getDate()}. – ${addDays(to, -1).getDate()}. ${count === 0 ? '· ingen registreringer' : ''}`.trim()}
            total={formatDuration(total)}
            disabled={count === 0}>
            <WeekDays {...ctx} from={from} to={to} />
          </Group>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    padding: 20,
    gap: 10,
    backgroundColor: Brand.glass,
    borderWidth: 1,
    borderColor: Brand.glassBorder,
  },
  muted: { color: Brand.muted, fontSize: 14 },
  group: { borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.25)' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  groupTitle: { fontWeight: '800', color: Brand.ink, fontSize: 15 },
  total: { fontWeight: '800', color: Brand.blue },
  groupBody: { paddingLeft: 10, paddingBottom: 6 },
});

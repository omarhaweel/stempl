export type TimeEntry = {
  id: string;
  punchedInAt: string;
  punchedOutAt: string | null;
  note: string | null;
  /** Name of the work place stamped in/out at (no coordinates are stored). */
  punchedInPlace?: string | null;
  punchedOutPlace?: string | null;
};

export type Adjustment = {
  id: string;
  date: string; // åååå-mm-dd
  minutes: number;
  note: string | null;
};

export type TimeState = {
  serverTime: string;
  active: TimeEntry | null;
  entries: TimeEntry[];
  adjustments: Adjustment[];
  /** Where the user may punch in/out: their approved work places (godkjente arbeidssteder). */
  locations?: WorkPlace[];
};

export type WorkPlace = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
};

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

const pad = (n: number) => String(n).padStart(2, '0');

export const formatClock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const formatClockSeconds = (d: Date) => `${formatClock(d)}:${pad(d.getSeconds())}`;

export function formatLongDate(d: Date) {
  const weekday = WEEKDAYS[d.getDay()];
  return `${weekday[0].toUpperCase()}${weekday.slice(1)} ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatShortDate(d: Date) {
  return `${WEEKDAYS[d.getDay()].slice(0, 3)} ${d.getDate()}. ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

/** Milliseconds -> "1t 05m" */
export function formatDuration(ms: number) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(totalMin / 60)}t ${pad(totalMin % 60)}m`;
}

/** Milliseconds -> "01:05:09" */
export function formatTimer(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Monday 00:00 of the week containing d. */
export function startOfWeek(d: Date) {
  const day = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}

/** ISO-8601 week number (weeks start on Monday, as in Norway). */
export function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
}

/** Entries that overlap [from, to), newest first as given. */
export function entriesBetween(entries: TimeEntry[], from: Date, to: Date, now: Date) {
  return entries.filter((e) => {
    const start = new Date(e.punchedInAt).getTime();
    const end = e.punchedOutAt ? new Date(e.punchedOutAt).getTime() : now.getTime();
    return start < to.getTime() && end > from.getTime();
  });
}

/** Time worked inside [from, to), counting a running shift up to `now`. */
export function workedBetween(entries: TimeEntry[], from: Date, to: Date, now: Date) {
  // Clip each stempling to the period, then merge overlapping ones so time is never counted twice.
  const spans: [number, number][] = [];
  for (const e of entries) {
    const start = Math.max(new Date(e.punchedInAt).getTime(), from.getTime());
    const end = Math.min(e.punchedOutAt ? new Date(e.punchedOutAt).getTime() : now.getTime(), to.getTime());
    if (end > start) spans.push([start, end]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = 0;
  let curEnd = -Infinity;
  for (const [s, e] of spans) {
    if (s > curEnd) {
      if (curEnd > -Infinity) total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else if (e > curEnd) {
      curEnd = e;
    }
  }
  if (curEnd > -Infinity) total += curEnd - curStart;
  return total;
}

/** First day of the month containing d. */
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const startOfNextMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 1);

/** Sum of manual corrections dated inside [from, to), in milliseconds. */
export function adjustedBetween(adjustments: Adjustment[], from: Date, to: Date) {
  let total = 0;
  for (const a of adjustments) {
    const [y, m, d] = a.date.split('-').map(Number);
    const day = new Date(y, m - 1, d);
    if (day >= from && day < to) total += a.minutes * 60000;
  }
  return total;
}

/**
 * Total time inside [from, to): the sum of the stemplinger, so every total shown
 * always matches the registreringer below it. Old manual corrections
 * (`adjustments`) are no longer counted.
 */
export function totalBetween(entries: TimeEntry[], _adjustments: Adjustment[], from: Date, to: Date, now: Date) {
  return workedBetween(entries, from, to, now);
}

/** 90 -> "+1t 30m", -30 -> "-0t 30m" */
export function formatSignedDuration(minutes: number) {
  return `${minutes < 0 ? '-' : '+'}${formatDuration(Math.abs(minutes) * 60000)}`;
}
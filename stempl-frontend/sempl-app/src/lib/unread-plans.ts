import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { authed } from '@/lib/authed';
import { dateToIso } from '@/lib/date-input';

// Number shown as a badge on the Dagsplan tab (phone and web).
// Employee: unread plans + unread replies. Administrator: unread comments from employees.
let count = 0;
let path: (() => string) | null = null;
const listeners = new Set<() => void>();

function setCount(n: number) {
  if (n === count) return;
  count = n;
  listeners.forEach((l) => l());
}

export async function refreshUnreadPlans() {
  if (!path) return;
  try {
    setCount((await authed<{ unread: number }>(path())).unread);
  } catch {
    // Keep the previous number if the server can't be reached.
  }
}

export function useUnreadPlans() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => count,
    () => 0,
  );
}

/** Keeps the number fresh: on start, every 30 seconds, and when the app comes back to the front. */
export function usePollUnreadPlans(role: 'employee' | 'admin') {
  useEffect(() => {
    path = role === 'admin' ? () => '/admin/dagsplan/unread' : () => `/me/dagsplan/unread?from=${dateToIso(new Date())}`;
    const first = setTimeout(refreshUnreadPlans, 0);
    const timer = setInterval(refreshUnreadPlans, 30000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshUnreadPlans();
    });
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      sub.remove();
      path = null;
      count = 0;
    };
  }, [role]);
}

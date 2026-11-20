import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { CommentThread } from '@/components/comment-thread';
import { ErrorBanner, Field, PrimaryButton } from '@/components/form';
import { Card, ConfirmSheet, Screen, Segmented, Sheet, SmallButton } from '@/components/ui';
import { Brand } from '@/constants/brand';
import { ApiError } from '@/lib/api';
import { authed } from '@/lib/authed';
import { dateToInput, formatDateInput, isoToDateInput, toIsoDate } from '@/lib/date-input';
import type { DayPlan, HistoryEntry, PlanUser } from '@/lib/dagsplan';
import { formatDuration } from '@/lib/time';
import { refreshUnreadPlans } from '@/lib/unread-plans';

/** Administrator: send a dagsplan (a message) to one or more employees, and look back at earlier ones. */
export default function AdminDagsplanScreen() {
  const [users, setUsers] = useState<PlanUser[] | null>(null);
  const [plans, setPlans] = useState<DayPlan[] | null>(null);
  const [date, setDate] = useState(() => dateToInput(new Date()));
  const [note, setNote] = useState('');
  /** The employees the dagsplan will be sent to. */
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** Other dates with unread comments from employees. */
  const [newDates, setNewDates] = useState<{ date: string; count: number }[]>([]);
  const [editing, setEditing] = useState<DayPlan | null>(null);
  const [editNote, setEditNote] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  /** The historikk entry that is open, with its plans and comments. */
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayPlan[] | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<HistoryEntry | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const iso = toIsoDate(date);
  const [todayInput] = useState(() => dateToInput(new Date()));
  const [tomorrowInput] = useState(() => dateToInput(new Date(Date.now() + 86400000)));

  const loadUsers = useCallback(async () => {
    try {
      setUsers((await authed<{ users: PlanUser[] }>('/admin/dagsplan/options')).users);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Noe gikk galt');
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setHistory((await authed<{ entries: HistoryEntry[] }>('/admin/dagsplan/history')).entries);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Noe gikk galt');
    }
  }, []);

  const loadPlans = useCallback(async () => {
    if (!iso) {
      setPlans([]);
      return;
    }
    try {
      const list = (await authed<{ plans: DayPlan[] }>(`/admin/dagsplan?date=${iso}`)).plans;
      setPlans(list); // new comments keep their «Ny» marker while this date is open
      // Opening a date marks the employees' comments on it as read.
      if (list.some((p) => p.comments.some((c) => !c.fromAdmin && !c.read))) {
        await authed('/admin/dagsplan/read', { method: 'POST', body: { date: iso } });
      }
      const unread = await authed<{ unread: number; dates: { date: string; count: number }[] }>('/admin/dagsplan/unread');
      setNewDates(unread.dates);
      await refreshUnreadPlans();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Noe gikk galt');
    }
  }, [iso]);

  // Reload when the tab is opened again, so new comments show up.
  useFocusEffect(
    useCallback(() => {
      const id = setTimeout(loadPlans, 0);
      return () => clearTimeout(id);
    }, [loadPlans]),
  );
  useFocusEffect(
    useCallback(() => {
      const id = setTimeout(loadUsers, 0);
      return () => clearTimeout(id);
    }, [loadUsers]),
  );

  function toggleUser(id: string) {
    setMessage(null);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function openHistory() {
    setShowHistory(true);
    setHistory(null);
    loadHistory();
  }

  async function send() {
    const next: Record<string, string> = {};
    if (!iso) next.date = 'Bruk formatet dd-mm-åååå';
    if (!note.trim()) next.note = 'Skriv en melding';
    if (selected.length === 0) next.userIds = 'Velg minst én ansatt';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const names = (users ?? []).filter((u) => selected.includes(u.id)).map((u) => u.name);
      await authed('/admin/dagsplan', { method: 'POST', body: { date: iso, note, userIds: selected } });
      setMessage(`Dagsplan sendt til ${names.join(', ')}`);
      setSelected([]);
      setNote('');
      await loadPlans();
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.fieldErrors);
      setError(e instanceof ApiError ? e.message : 'Noe gikk galt');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(p: DayPlan) {
    setEditing(p);
    setEditNote(p.note);
    setEditError(null);
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editNote.trim()) {
      setEditError('Skriv en melding');
      return;
    }
    setEditBusy(true);
    setEditError(null);
    try {
      await authed(`/admin/dagsplan/${editing.id}`, { method: 'PATCH', body: { note: editNote } });
      setEditing(null);
      await loadPlans();
    } catch (e) {
      setEditError(e instanceof ApiError ? e.message : 'Noe gikk galt');
    } finally {
      setEditBusy(false);
    }
  }

  async function remove(p: DayPlan) {
    try {
      await authed(`/admin/dagsplan/${p.id}`, { method: 'DELETE' });
      await loadPlans();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Noe gikk galt');
    }
  }

  // Historikk: the plans of one entry (with their comments) are loaded when it is opened.
  async function loadDetail(entry: HistoryEntry) {
    try {
      const all = (await authed<{ plans: DayPlan[] }>(`/admin/dagsplan?date=${entry.date}`)).plans;
      const mine = all.filter((p) => p.threadId === entry.threadId);
      setDetail(mine); // unread comments keep their «Ny» marker while the entry is open
      if (mine.some((p) => p.comments.some((c) => !c.fromAdmin && !c.read))) {
        await authed('/admin/dagsplan/read', { method: 'POST', body: { date: entry.date } });
        await refreshUnreadPlans();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Noe gikk galt');
    }
  }

  function toggleEntry(entry: HistoryEntry) {
    if (openThread === entry.threadId) {
      setOpenThread(null);
      return;
    }
    setOpenThread(entry.threadId);
    setDetail(null);
    loadDetail(entry);
  }

  async function removeEntry() {
    if (!deletingEntry) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await authed(`/admin/dagsplan/thread/${deletingEntry.threadId}`, { method: 'DELETE' });
      setDeletingEntry(null);
      setOpenThread(null);
      await Promise.all([loadHistory(), loadPlans(), refreshUnreadPlans()]);
    } catch (e) {
      setDeleteError(e instanceof ApiError ? e.message : 'Noe gikk galt');
    } finally {
      setDeleteBusy(false);
    }
  }

  // Plans sent together are one card with one comment thread.
  const groups: DayPlan[][] = [];
  for (const p of plans ?? []) {
    const group = groups.find((g) => g[0].threadId === p.threadId);
    if (group) group.push(p);
    else groups.push([p]);
  }

  const switcher = (
    <Segmented
      options={[
        { key: 'send', label: 'Send dagsplan' },
        { key: 'history', label: 'Historikk' },
      ]}
      value={showHistory ? 'history' : 'send'}
      onChange={(key) => (key === 'history' ? openHistory() : setShowHistory(false))}
    />
  );

  if (showHistory) {
    return (
      <Screen>
        <Text style={styles.title}>Dagsplan</Text>
        {switcher}
        {error ? <ErrorBanner message={error} /> : null}
        {!history && !error ? <ActivityIndicator color={Brand.blue} style={{ paddingVertical: 30 }} /> : null}
        {history && history.length === 0 ? <Text style={styles.muted}>Ingen dagsplaner er sendt ennå</Text> : null}
        {history?.map((h) => {
          const open = openThread === h.threadId;
          return (
            <Card key={h.threadId} style={{ gap: 8 }}>
              <Pressable onPress={() => toggleEntry(h)} accessibilityLabel={`${open ? 'Lukk' : 'Åpne'} dagsplan ${isoToDateInput(h.date)}`} style={{ gap: 6 }}>
                <View style={styles.historyTop}>
                  <Text style={styles.historyDate}>{isoToDateInput(h.date)}</Text>
                  {h.commentCount > 0 ? (
                    <View style={styles.historyComments}>
                      <Ionicons name="chatbubble-ellipses-outline" size={14} color={Brand.blue} />
                      <Text style={styles.historyCommentsText}>{h.commentCount}</Text>
                    </View>
                  ) : null}
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Brand.muted} />
                </View>
                <Text style={styles.historyEmployees} numberOfLines={open ? undefined : 2}>
                  {h.employees.map((e) => e.name).join(', ')}
                </Text>
                {!open ? (
                  <Text style={styles.note} numberOfLines={3}>
                    {h.note}
                  </Text>
                ) : null}
              </Pressable>

              {open ? (
                <View style={styles.historyDetail}>
                  {!detail ? <ActivityIndicator color={Brand.blue} /> : null}
                  {detail?.map((p) => (
                    <View key={p.id} style={styles.planBlockShared}>
                      <Text style={styles.userName}>{p.employeeName}</Text>
                      <Text style={styles.note}>{p.note}</Text>
                      <Text style={styles.muted}>{p.read ? 'Lest av ansatt' : 'Ikke lest ennå'}</Text>
                    </View>
                  ))}
                  {detail && detail.length > 0 ? (
                    <CommentThread
                      comments={detail[0].comments}
                      placeholder={detail.length > 1 ? 'Svar alle i dagsplanen…' : 'Svar den ansatte…'}
                      onSend={async (body) => {
                        await authed(`/admin/dagsplan/${detail[0].id}/comments`, { method: 'POST', body: { body } });
                        await loadDetail(h);
                      }}
                    />
                  ) : null}
                  <View style={styles.dateButtons}>
                    <SmallButton
                      title="Slett dagsplan"
                      icon="trash-outline"
                      tone="red"
                      onPress={() => {
                        setDeleteError(null);
                        setDeletingEntry(h);
                      }}
                    />
                  </View>
                </View>
              ) : null}
            </Card>
          );
        })}

        <ConfirmSheet
          visible={!!deletingEntry}
          title="Slette dagsplan?"
          message={`Dagsplanen for ${deletingEntry ? isoToDateInput(deletingEntry.date) : ''} til ${
            deletingEntry?.employees.map((e) => e.name).join(', ') ?? ''
          } slettes sammen med kommentarene. Dette kan ikke angres.`}
          confirmLabel="Slett dagsplan"
          busy={deleteBusy}
          error={deleteError}
          onCancel={() => setDeletingEntry(null)}
          onConfirm={removeEntry}
        />
      </Screen>
    );
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await Promise.all([loadUsers(), loadPlans()]);
            setRefreshing(false);
          }}
          tintColor={Brand.blue}
        />
      }>
      <Text style={styles.title}>Dagsplan</Text>
      {switcher}

      <Card>
        <Field
          label="Dato"
          value={date}
          onChangeText={(t) => setDate(formatDateInput(t))}
          keyboardType="number-pad"
          maxLength={10}
          error={errors.date}
          placeholder="dd-mm-åååå"
        />
        <View style={styles.dateButtons}>
          <SmallButton
            title="I dag"
            icon="today-outline"
            tone={date === todayInput ? 'green' : 'blue'}
            onPress={() => setDate(todayInput)}
          />
          <SmallButton
            title="I morgen"
            icon="arrow-forward-outline"
            tone={date === tomorrowInput ? 'green' : 'blue'}
            onPress={() => setDate(tomorrowInput)}
          />
        </View>
        <Field
          label="Melding"
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={1000}
          error={errors.note}
          style={{ minHeight: 90, textAlignVertical: 'top' }}
          placeholder="F.eks. oppmøtetid eller oppgaver"
        />

        <Text style={styles.label}>Send til</Text>
        {!users ? <ActivityIndicator color={Brand.blue} /> : null}
        {users && users.length === 0 ? <Text style={styles.muted}>Ingen ansatte ennå</Text> : null}
        {users?.map((u) => {
          const on = selected.includes(u.id);
          return (
            <Pressable
              key={u.id}
              onPress={() => toggleUser(u.id)}
              style={[styles.userBox, on && styles.userBoxOn]}
              accessibilityLabel={`Velg ${u.name}`}>
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? Brand.blue : Brand.muted} />
              <Text style={styles.userName}>{u.name}</Text>
            </Pressable>
          );
        })}
        {errors.userIds ? <Text style={styles.fieldError}>{errors.userIds}</Text> : null}

        {error ? <ErrorBanner message={error} /> : null}
        {message ? <Text style={styles.ok}>{message}</Text> : null}
        <PrimaryButton title="Send dagsplan" onPress={send} loading={busy} />
      </Card>

      {newDates.length > 0 ? (
        <Card style={{ gap: 8 }}>
          <Text style={styles.label}>Nye kommentarer fra ansatte</Text>
          <View style={styles.dateButtons}>
            {newDates.map((d) => (
              <SmallButton
                key={d.date}
                title={`${isoToDateInput(d.date)} (${d.count})`}
                icon="chatbubble-ellipses-outline"
                tone="orange"
                onPress={() => setDate(isoToDateInput(d.date))}
              />
            ))}
          </View>
        </Card>
      ) : null}

      <Text style={styles.sectionTitle}>Sendt for {iso ? date : '…'}</Text>
      {plans && plans.length === 0 ? <Text style={styles.muted}>Ingen dagsplaner sendt for denne datoen</Text> : null}
      {groups.map((group) => {
        // A dagsplan sent to several employees is one card with one comment thread they all write in.
        const first = group[0];
        const shared = group.length > 1;
        const notes = [...new Set(group.map((p) => p.note))];
        const sameNote = notes.length === 1;
        return (
          <Card key={first.threadId} style={{ gap: 8 }}>
            {shared ? (
              <View style={styles.sharedHeader}>
                <Ionicons name="people" size={18} color={Brand.blue} />
                <Text style={styles.sharedTitle}>Felles dagsplan · {group.map((p) => p.employeeName).join(', ')}</Text>
              </View>
            ) : null}
            {shared && sameNote ? <Text style={styles.note}>{notes[0]}</Text> : null}

            {group.map((p) => (
              <View key={p.id} style={[styles.planBlock, shared && styles.planBlockShared]}>
                <View style={styles.planTop}>
                  <Text style={styles.userName}>{p.employeeName}</Text>
                  <SmallButton title="Rediger" icon="create-outline" onPress={() => startEdit(p)} />
                  <SmallButton title="Slett" icon="trash-outline" tone="red" onPress={() => remove(p)} />
                </View>
                {!(shared && sameNote) ? <Text style={styles.note}>{p.note}</Text> : null}

                {p.usage && p.usage.length > 0 ? (
                  <View style={styles.usage}>
                    <Text style={styles.label}>Tid per sted</Text>
                    {p.usage.map((u) => (
                      <View key={u.place} style={styles.usageRow}>
                        <Text style={styles.usagePlace} numberOfLines={1}>
                          {u.place}
                        </Text>
                        <Text style={styles.usageTime}>{formatDuration(u.minutes * 60000)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <Text style={styles.muted}>{p.read ? 'Lest av ansatt' : 'Ikke lest ennå'}</Text>
              </View>
            ))}

            <CommentThread
              comments={first.comments}
              placeholder={shared ? 'Svar alle i dagsplanen…' : 'Svar den ansatte…'}
              onSend={async (body) => {
                await authed(`/admin/dagsplan/${first.id}/comments`, { method: 'POST', body: { body } });
                await loadPlans();
              }}
            />
          </Card>
        );
      })}

      <Sheet
        visible={!!editing}
        title={`Rediger dagsplan${editing?.employeeName ? ` · ${editing.employeeName}` : ''}`}
        onClose={() => setEditing(null)}>
        <Field
          label="Melding"
          value={editNote}
          onChangeText={setEditNote}
          multiline
          maxLength={1000}
          style={{ minHeight: 90, textAlignVertical: 'top' }}
        />
        {editError ? <ErrorBanner message={editError} /> : null}
        <PrimaryButton title="Lagre endringer" onPress={saveEdit} loading={editBusy} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: Brand.ink },
  muted: { color: Brand.muted, fontSize: 14 },
  label: { fontSize: 14, fontWeight: '700', color: Brand.ink },
  fieldError: { color: Brand.error, fontSize: 13 },
  ok: { color: Brand.greenDark, fontWeight: '700', textAlign: 'center' },
  userBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1.5,
    borderColor: Brand.fieldBorder,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  userBoxOn: { borderColor: Brand.blue },
  userName: { fontSize: 16, fontWeight: '800', color: Brand.ink, flex: 1 },
  dateButtons: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  planTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planBlock: { gap: 6 },
  planBlockShared: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Brand.fieldBorder,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  sharedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sharedTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: Brand.blue },
  note: { color: Brand.ink, fontSize: 15, lineHeight: 21 },
  usage: { gap: 4, paddingTop: 4 },
  usageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  usagePlace: { color: Brand.ink, fontSize: 14, flex: 1 },
  usageTime: { color: Brand.blue, fontWeight: '800', fontSize: 14 },
  historyDetail: { gap: 10, paddingTop: 4 },
  historyTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyDate: { flex: 1, fontSize: 17, fontWeight: '800', color: Brand.ink },
  historyComments: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  historyCommentsText: { color: Brand.blue, fontWeight: '800', fontSize: 13 },
  historyEmployees: { color: Brand.blue, fontSize: 14, fontWeight: '700' },
});

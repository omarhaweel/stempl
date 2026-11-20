import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { ErrorBanner } from '@/components/form';
import { Card, IconButton, Screen } from '@/components/ui';
import { UserFormSheet } from '@/components/user-form-sheet';
import { Brand } from '@/constants/brand';
import { ROLE_LABEL, type AdminUser } from '@/lib/admin-types';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { authed } from '@/lib/authed';
import { formatClock } from '@/lib/time';

export default function AdminUsersScreen() {
  const { user: me, logout } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers((await authed<{ users: AdminUser[] }>('/admin/users')).users);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Noe gikk galt');
      if (e instanceof ApiError && e.status === 401) logout();
    }
  }, [logout]);

  // Reload every time the list is shown again, e.g. after a user was deleted or added on another page.
  useFocusEffect(
    useCallback(() => {
      const id = setTimeout(load, 0);
      return () => clearTimeout(id);
    }, [load]),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !users) return users;
    return users.filter((u) => `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(q));
  }, [users, query]);

  const activeCount = users?.filter((u) => u.activeSince).length ?? 0;

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
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Brukere</Text>
          <Text style={styles.muted}>Innlogget som {me?.firstName} · Administrator{me?.companyName ? ` · ${me.companyName}` : ''}</Text>
        </View>
        <IconButton icon="person-add-outline" label="Ny bruker" onPress={() => setAdding(true)} color={Brand.blue} />
        <IconButton icon="log-out-outline" label="Logg ut" onPress={logout} />
      </View>

      <View style={styles.summary}>
        <Summary value={String(users?.length ?? '–')} label="Brukere" />
        <Summary value={String(activeCount)} label="Stemplet inn nå" accent />
      </View>

      <View style={styles.search}>
        <Ionicons name="search-outline" size={20} color={Brand.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Søk etter navn eller e-post"
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
          autoCapitalize="none"
        />
      </View>

      {error ? <ErrorBanner message={error} /> : null}
      {!users && !error ? <ActivityIndicator color={Brand.blue} style={{ paddingVertical: 30 }} /> : null}
      {filtered && filtered.length === 0 ? <Text style={styles.muted}>Ingen brukere funnet</Text> : null}

      {filtered?.map((u) => (
        <Pressable key={u.id} onPress={() => router.push({ pathname: '/admin/[id]', params: { id: u.id } })}>
          <Card style={styles.userCard}>
            <View style={[styles.avatar, { backgroundColor: u.activeSince ? Brand.greenSoft : Brand.blueSoft }]}>
              <Text style={styles.avatarText}>
                {u.firstName[0]}
                {u.lastName[0]}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name}>
                {u.firstName} {u.lastName}
              </Text>
              <Text style={styles.muted} numberOfLines={1}>
                {u.email}
              </Text>
              <View style={styles.tags}>
                <Text style={styles.tag}>{ROLE_LABEL[u.role]}</Text>
                {u.activeSince ? (
                  <Text style={[styles.tag, styles.tagOn]}>Inn siden {formatClock(new Date(u.activeSince))}</Text>
                ) : null}
              </View>
              {u.role !== 'admin' ? (
                u.workplaces && u.workplaces.length > 0 ? (
                  <View style={styles.placeRow}>
                    <Ionicons name="location" size={14} color={Brand.green} />
                    <Text style={styles.placeText} numberOfLines={2}>
                      {u.workplaces.join(', ')}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.noPlace}>Ingen godkjente arbeidssteder</Text>
                )
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color={Brand.muted} />
          </Card>
        </Pressable>
      ))}

      <UserFormSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          load();
        }}
      />
    </Screen>
  );
}

/** Tinted summary tile (teal or amber) with a big number. */
function Summary({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: accent ? Brand.orangeTint : Brand.blueSoft }]}>
      <Text style={[styles.summaryValue, { color: accent ? Brand.orangeDark : Brand.blueDark }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  muted: { color: Brand.muted, fontSize: 14 },
  summary: { flexDirection: 'row', gap: 12 },
  summaryCard: { flex: 1, alignItems: 'center', paddingVertical: 16, borderRadius: 20, gap: 2 },
  summaryValue: { fontSize: 30, fontWeight: '800' },
  summaryLabel: { color: Brand.ink, fontSize: 13, fontWeight: '600' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 4px 14px rgba(15,95,90,0.08)',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: Brand.ink,
    ...(process.env.EXPO_OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  avatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800', color: Brand.ink, fontSize: 16, textTransform: 'uppercase' },
  name: { fontSize: 17, fontWeight: '800', color: Brand.ink },
  tags: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  tag: {
    fontSize: 12,
    fontWeight: '700',
    color: Brand.blue,
    backgroundColor: Brand.blueTint,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  tagOn: { color: Brand.greenDark, backgroundColor: Brand.greenSoft },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  placeText: { flex: 1, color: Brand.greenDark, fontSize: 13, fontWeight: '700' },
  noPlace: { color: Brand.muted, fontSize: 13, marginTop: 4 },
});

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { AddAdminSheet, AddCompanySheet } from '@/components/company-sheets';
import { ErrorBanner } from '@/components/form';
import { Card, ConfirmSheet, IconButton, Screen, SmallButton } from '@/components/ui';
import { Brand } from '@/constants/brand';
import type { Company } from '@/lib/admin-types';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { authed } from '@/lib/authed';

/** System administrator: add companies (by organisasjonsnummer) and their administrators. */
export default function CompaniesScreen() {
  const { user: me, logout } = useAuth();
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [addingCompany, setAddingCompany] = useState(false);
  const [addingAdminFor, setAddingAdminFor] = useState<Company | null>(null);
  const [deleting, setDeleting] = useState<Company | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCompanies((await authed<{ companies: Company[] }>('/super/companies')).companies);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Noe gikk galt');
      if (e instanceof ApiError && e.status === 401) logout();
    }
  }, [logout]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function removeCompany() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await authed(`/super/companies/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      await load();
    } catch (e) {
      setDeleteError(e instanceof ApiError ? e.message : 'Noe gikk galt');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function setActive(c: Company, isActive: boolean) {
    try {
      await authed(`/super/companies/${c.id}`, { method: 'PATCH', body: { isActive } });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Noe gikk galt');
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
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Selskaper</Text>
          <Text style={styles.muted}>Systemadministrator · {me?.firstName}</Text>
        </View>
        <IconButton icon="add" label="Legg til selskap" onPress={() => setAddingCompany(true)} color={Brand.green} />
        <IconButton icon="log-out-outline" label="Logg ut" onPress={logout} />
      </View>

      {error ? <ErrorBanner message={error} /> : null}
      {!companies && !error ? <ActivityIndicator color={Brand.blue} style={{ paddingVertical: 30 }} /> : null}
      {companies && companies.length === 0 ? (
        <Card>
          <Text style={styles.muted}>Ingen selskaper ennå. Trykk på + for å legge til et selskap med organisasjonsnummer.</Text>
        </Card>
      ) : null}

      {companies?.map((c) => (
        <Card key={c.id} style={c.isActive ? undefined : { opacity: 0.65 }}>
          <View style={styles.nameRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{c.name}</Text>
              <Text style={styles.muted}>Org.nr. {c.orgNumber} · {c.userCount} {c.userCount === 1 ? 'bruker' : 'brukere'}</Text>
            </View>
            <Text style={[styles.badge, c.isActive ? styles.badgeOn : styles.badgeOff]}>{c.isActive ? 'Aktiv' : 'Deaktivert'}</Text>
          </View>

          {c.admins.length === 0 ? (
            <Text style={styles.warn}>Ingen administrator ennå. Legg til en så selskapet kan logge inn.</Text>
          ) : (
            c.admins.map((a) => (
              <Text key={a.id} style={styles.admin} numberOfLines={1}>
                {a.firstName} {a.lastName} · {a.email}
              </Text>
            ))
          )}

          <View style={styles.actions}>
            <SmallButton title="Ny administrator" icon="person-add-outline" tone="green" onPress={() => setAddingAdminFor(c)} />
            <SmallButton
              title={c.isActive ? 'Deaktiver' : 'Aktiver'}
              icon={c.isActive ? 'pause-circle-outline' : 'play-circle-outline'}
              tone={c.isActive ? 'red' : 'blue'}
              onPress={() => setActive(c, !c.isActive)}
            />
            <SmallButton
              title="Slett selskap"
              icon="trash-outline"
              tone="red"
              onPress={() => {
                setDeleteError(null);
                setDeleting(c);
              }}
            />
          </View>
        </Card>
      ))}

      <ConfirmSheet
        visible={!!deleting}
        title="Slett selskap?"
        message={`«${deleting?.name ?? ''}» slettes permanent sammen med ${deleting?.userCount ?? 0} ${
          deleting?.userCount === 1 ? 'bruker' : 'brukere'
        } (administratorer og vanlige brukere) og alle stemplinger. Dette kan ikke angres.`}
        confirmLabel="Slett selskap og brukere"
        busy={deleteBusy}
        error={deleteError}
        onCancel={() => setDeleting(null)}
        onConfirm={removeCompany}
      />

      <AddCompanySheet
        visible={addingCompany}
        onClose={() => setAddingCompany(false)}
        onSaved={() => {
          setAddingCompany(false);
          load();
        }}
      />
      <AddAdminSheet
        company={addingAdminFor}
        onClose={() => setAddingAdminFor(null)}
        onCreated={load}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  muted: { color: Brand.muted, fontSize: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 18, fontWeight: '800', color: Brand.ink },
  badge: { fontSize: 12, fontWeight: '800', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
  badgeOn: { color: Brand.greenDark, backgroundColor: Brand.greenSoft },
  badgeOff: { color: Brand.error, backgroundColor: Brand.coralSoft },
  admin: { color: Brand.ink, fontSize: 14 },
  warn: { color: Brand.orangeDark, fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 6 },
});

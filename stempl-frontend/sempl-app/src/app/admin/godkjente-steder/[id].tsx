import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ErrorBanner, PrimaryButton } from '@/components/form';
import { LocationMap } from '@/components/location-map';
import { PlaceMapSheet, PLAN_RADIUS_M } from '@/components/place-map-sheet';
import { Card, ConfirmSheet, IconButton, Screen } from '@/components/ui';
import { Brand } from '@/constants/brand';
import type { ApprovedLocation, LocationsData } from '@/lib/admin-types';
import { ApiError } from '@/lib/api';
import { authed } from '@/lib/authed';
import type { MapFocus, MapPlace } from '@/lib/map-html';
import { MAPBOX_TOKEN } from '@/lib/mapbox';
import type { Place } from '@/lib/places';

const WIDE_BREAKPOINT = 900;

const coords = (lat: number, lon: number) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Noe gikk galt');

/** Administrator: the approved work places (godkjente arbeidssteder) of one user, with a Mapbox map. */
export default function ApprovedLocationsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const mapHeight = wide ? 520 : Math.min(420, Math.max(280, Math.round(height * 0.4)));

  const [data, setData] = useState<LocationsData | null>(null);
  const [history, setHistory] = useState<Place[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [focusCount, setFocusCount] = useState(0);
  const [deleting, setDeleting] = useState<ApprovedLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [locations, places] = await Promise.all([
        authed<LocationsData>(`/admin/users/${id}/locations`),
        authed<{ places: Place[] }>('/admin/place-history'),
      ]);
      setData(locations);
      setHistory(places.places);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [id]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const places: MapPlace[] = useMemo(
    () => (data?.locations ?? []).map((l) => ({ id: l.id, name: l.name, latitude: l.latitude, longitude: l.longitude, radiusM: l.radiusM })),
    [data],
  );

  async function add(place: Place) {
    setError(null);
    try {
      await authed(`/admin/users/${id}/locations`, {
        body: { name: place.name, latitude: place.latitude, longitude: place.longitude },
      });
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setDialogError(null);
    try {
      await authed(`/admin/locations/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      await load();
    } catch (e) {
      setDialogError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/admin/${id}` as Href));

  const header = (
    <View style={styles.headerRow}>
      <IconButton icon="arrow-back" label="Tilbake" onPress={goBack} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          Godkjente arbeidssteder
        </Text>
        {data ? (
          <Text style={styles.muted} numberOfLines={1}>
            {data.user.firstName} {data.user.lastName}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (!data) {
    return (
      <Screen>
        {header}
        {error ? <ErrorBanner message={error} /> : <ActivityIndicator color={Brand.blue} style={{ paddingVertical: 40 }} />}
      </Screen>
    );
  }

  if (data.user.role === 'admin') {
    return (
      <Screen>
        {header}
        <Card>
          <Text style={styles.body}>Administratorer kan ikke begrenses til godkjente arbeidssteder.</Text>
        </Card>
      </Screen>
    );
  }

  const map = (
    <Card>
      <LocationMap
        token={MAPBOX_TOKEN}
        places={places}
        pin={null}
        focus={focus}
        onPick={() => {}}
        style={{ height: mapHeight }}
      />
      <View style={styles.legend}>
        <View style={[styles.legendDot, { backgroundColor: Brand.green }]} />
        <Text style={styles.hint}>Godkjent arbeidssted ({PLAN_RADIUS_M} m radius)</Text>
      </View>
    </Card>
  );

  const list = (
    <Card>
      <Text style={styles.section}>Godkjente arbeidssteder ({data.locations.length})</Text>
      {data.locations.length === 0 ? (
        <Text style={styles.muted}>
          Ingen godkjente arbeidssteder ennå. Uten godkjente arbeidssteder kan brukeren stemple inn og ut fra hvor som helst.
        </Text>
      ) : (
        <Text style={styles.hint}>
          Brukeren kan bare stemple inn og ut innen {PLAN_RADIUS_M} m fra ett av disse stedene. De vises på brukerens forside.
        </Text>
      )}
      {data.locations.map((l) => (
        <View key={l.id} style={styles.locRow}>
          <Pressable
            onPress={() => {
              setFocusCount((n) => n + 1);
              setFocus({ latitude: l.latitude, longitude: l.longitude, zoom: 16, nonce: focusCount + 1 });
            }}
            style={styles.locMain}
            accessibilityLabel={`Vis ${l.name} på kartet`}>
            <View style={styles.locIcon}>
              <Ionicons name="location" size={18} color={Brand.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultName} numberOfLines={2}>
                {l.name}
              </Text>
              <Text style={styles.muted}>
                {coords(l.latitude, l.longitude)} · {l.radiusM} m
              </Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityLabel={`Fjern ${l.name}`}
            hitSlop={8}
            onPress={() => {
              setDialogError(null);
              setDeleting(l);
            }}>
            <Ionicons name="trash-outline" size={20} color={Brand.error} />
          </Pressable>
        </View>
      ))}
      <PrimaryButton title="Legg til arbeidssted" onPress={() => setAdding(true)} variant="success" />
    </Card>
  );

  return (
    <Screen wide>
      {header}
      {error ? <ErrorBanner message={error} /> : null}
      {wide ? (
        <View style={styles.columns}>
          <View style={[styles.col, { flex: 3 }]}>{map}</View>
          <View style={[styles.col, { flex: 2 }]}>{list}</View>
        </View>
      ) : (
        <>
          {list}
          {map}
        </>
      )}

      <PlaceMapSheet
        visible={adding}
        title={`Legg til arbeidssted for ${data.user.firstName}`}
        existing={data.locations}
        history={history}
        onClose={() => setAdding(false)}
        onAdd={add}
      />

      <ConfirmSheet
        visible={!!deleting}
        title="Fjerne arbeidssted?"
        message={`«${deleting?.name ?? ''}» fjernes. Brukeren kan ikke lenger stemple fra dette stedet.`}
        confirmLabel="Fjern sted"
        busy={busy}
        error={dialogError}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 24, fontWeight: '800', color: Brand.ink },
  muted: { color: Brand.muted, fontSize: 14 },
  body: { color: Brand.ink, fontSize: 16, lineHeight: 22 },
  section: { fontSize: 16, fontWeight: '800', color: Brand.ink },
  hint: { color: Brand.muted, fontSize: 13 },
  columns: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  col: { gap: 16 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  locMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  locIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.greenSoft,
  },
  resultName: { color: Brand.ink, fontWeight: '700', fontSize: 15 },
});

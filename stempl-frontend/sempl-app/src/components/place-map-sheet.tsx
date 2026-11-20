import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ErrorBanner, Field, PrimaryButton } from '@/components/form';
import { LocationMap } from '@/components/location-map';
import { IconButton } from '@/components/ui';
import { Brand } from '@/constants/brand';
import { samePlace, type Place } from '@/lib/places';
import type { MapFocus, MapPin, MapPlace } from '@/lib/map-html';
import { MAPBOX_TOKEN, reverseGeocode, searchPlaces, type PlaceResult } from '@/lib/mapbox';

export const PLAN_RADIUS_M = 200;

const coords = (lat: number, lon: number) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

/**
 * «Velg sted»: pick from the history of places the company has used in earlier dagsplaner with one
 * tap, or find a new place on the map (search, or tap/drag the pin).
 * The sheet stays open so several places can be added; `existing` are the places already chosen.
 */
export function PlaceMapSheet({
  visible,
  title,
  existing,
  shown,
  history,
  onClose,
  onAdd,
}: {
  visible: boolean;
  title: string;
  /** Places that are already chosen (they get a tick in the history list). */
  existing: Place[];
  /** Places to draw on the map (defaults to `existing`). When picking for several employees these are
   *  all places chosen for any of them, while `existing` are only the ones every employee already has. */
  shown?: Place[];
  history: Place[];
  onClose: () => void;
  onAdd: (place: Place) => void;
}) {
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pin, setPin] = useState<MapPin | null>(null);
  const [name, setName] = useState('');
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);

  // Start fresh every time the sheet is opened.
  useEffect(() => {
    if (visible) return;
    const id = setTimeout(() => {
      setFilter('');
      setQuery('');
      setResults([]);
      setPin(null);
      setName('');
      setFocus(null);
      setError(null);
    }, 0);
    return () => clearTimeout(id);
  }, [visible]);

  // Search as you type (debounced).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await searchPlaces(q, controller.signal));
        setSearchError(null);
      } catch (e) {
        if (!controller.signal.aborted) setSearchError(e instanceof Error ? e.message : 'Søket feilet');
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  const onMap = shown ?? existing;
  const places: MapPlace[] = useMemo(
    () => onMap.map((p, i) => ({ id: String(i), name: p.name, latitude: p.latitude, longitude: p.longitude, radiusM: PLAN_RADIUS_M })),
    [onMap],
  );

  const shownHistory = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? history.filter((h) => h.name.toLowerCase().includes(q)) : history;
  }, [history, filter]);

  function onQuery(text: string) {
    setQuery(text);
    if (text.trim().length < 3) {
      setResults([]);
      setSearching(false);
    }
  }

  function choose(r: PlaceResult) {
    setPin({ latitude: r.latitude, longitude: r.longitude });
    setName(r.name);
    setFocus({ latitude: r.latitude, longitude: r.longitude, zoom: 16, nonce: ++counter.current });
    setResults([]);
    setQuery(r.name);
    setError(null);
  }

  // Tap or drag on the map: pin the spot and look up its name.
  const onPick = useCallback(async (latitude: number, longitude: number) => {
    const mine = ++counter.current;
    setPin({ latitude, longitude });
    setName(`Valgt sted (${coords(latitude, longitude)})`);
    setError(null);
    setResults([]);
    const found = await reverseGeocode(latitude, longitude).catch(() => null);
    if (found && counter.current === mine) setName(found.name + (found.address ? `, ${found.address}` : ''));
  }, []);

  function addFromMap() {
    if (!pin) {
      setError('Trykk på kartet eller søk etter et sted først');
      return;
    }
    onAdd({ name: name.trim() || 'Arbeidssted', latitude: pin.latitude, longitude: pin.longitude });
    // Ready for the next place.
    setPin(null);
    setName('');
    setQuery('');
    setResults([]);
    setError(null);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <IconButton icon="close" onPress={onClose} label="Lukk" />
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {history.length > 0 ? (
              <View style={styles.historyBox}>
                <Text style={styles.section}>Tidligere steder</Text>
                {history.length > 6 ? (
                  <TextInput
                    value={filter}
                    onChangeText={setFilter}
                    placeholder="Filtrer steder"
                    placeholderTextColor="#94A3B8"
                    style={styles.filter}
                  />
                ) : null}
                <ScrollView style={styles.historyList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {shownHistory.length === 0 ? <Text style={styles.muted}>Ingen treff</Text> : null}
                  {shownHistory.map((h, i) => {
                    const added = existing.some((e) => samePlace(e, h));
                    return (
                      <Pressable
                        key={`${h.name}-${i}`}
                        onPress={() => onAdd(h)}
                        disabled={added}
                        accessibilityLabel={`Velg ${h.name}`}
                        style={({ pressed }) => [styles.historyRow, pressed && { opacity: 0.6 }]}>
                        <Ionicons name={added ? 'checkmark-circle' : 'location-outline'} size={20} color={Brand.green} />
                        <Text style={[styles.resultName, added && { color: Brand.muted }]} numberOfLines={2}>
                          {h.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            <Text style={styles.section}>Eller finn et nytt sted på kartet</Text>
            <View style={styles.search}>
              <Ionicons name="search" size={20} color={Brand.muted} />
              <TextInput
                value={query}
                onChangeText={onQuery}
                placeholder="Søk etter sted eller adresse"
                placeholderTextColor="#94A3B8"
                style={styles.searchInput}
              />
              {searching ? <ActivityIndicator color={Brand.green} /> : null}
            </View>
            {searchError ? <Text style={styles.error}>{searchError}</Text> : null}
            {results.map((r) => (
              <Pressable key={r.id} onPress={() => choose(r)} style={({ pressed }) => [styles.result, pressed && { opacity: 0.6 }]}>
                <Ionicons name="location-outline" size={20} color={Brand.green} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {r.name}
                  </Text>
                  {r.address ? (
                    <Text style={styles.muted} numberOfLines={1}>
                      {r.address}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
            {!MAPBOX_TOKEN ? <ErrorBanner message="Mangler EXPO_PUBLIC_MAPBOX_TOKEN i .env" /> : null}

            <LocationMap token={MAPBOX_TOKEN} places={places} pin={pin} focus={focus} onPick={onPick} style={{ height: 300 }} />
            <Text style={styles.hint}>
              Søk, eller trykk på kartet for å sette en nål. Nålen kan dras. Stempling er tillatt innen {PLAN_RADIUS_M} m.
            </Text>

            {pin ? (
              <>
                <Field label="Navn" value={name} onChangeText={setName} maxLength={200} />
                <Text style={styles.hint}>{coords(pin.latitude, pin.longitude)}</Text>
              </>
            ) : null}
            {error ? <ErrorBanner message={error} /> : null}
            <PrimaryButton title="Legg til stedet på kartet" onPress={addFromMap} variant="success" />
            <PrimaryButton title="Ferdig" onPress={onClose} variant="secondary" />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 12, backgroundColor: 'rgba(15,23,42,0.4)' },
  sheet: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '94%',
    borderRadius: 28,
    backgroundColor: '#F8FBFF',
    borderWidth: 1,
    borderColor: Brand.glassBorder,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, paddingBottom: 6, gap: 10 },
  title: { fontSize: 20, fontWeight: '800', color: Brand.ink, flex: 1 },
  body: { padding: 18, paddingTop: 8, gap: 12 },
  section: { fontSize: 14, fontWeight: '800', color: Brand.ink },
  historyBox: {
    gap: 8,
    padding: 12,
    borderRadius: 18,
    backgroundColor: Brand.greenSoft,
  },
  historyList: { maxHeight: 220 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  filter: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    color: Brand.ink,
    ...(process.env.EXPO_OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: Brand.field,
    borderWidth: 1.5,
    borderColor: Brand.fieldBorder,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: Brand.ink,
    ...(process.env.EXPO_OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  resultName: { color: Brand.ink, fontWeight: '700', fontSize: 15, flex: 1 },
  muted: { color: Brand.muted, fontSize: 13 },
  hint: { color: Brand.muted, fontSize: 13 },
  error: { color: Brand.error, fontSize: 13 },
});

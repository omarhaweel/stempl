// Public Mapbox token (pk.*). Set EXPO_PUBLIC_MAPBOX_TOKEN in .env.
export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

export type PlaceResult = { id: string; name: string; address: string; latitude: number; longitude: number };

const GEOCODE = 'https://api.mapbox.com/search/geocode/v6';

type Feature = {
  id: string;
  geometry: { coordinates: [number, number] };
  properties: { name?: string; full_address?: string; place_formatted?: string };
};

const toResult = (f: Feature): PlaceResult => ({
  id: f.id,
  name: f.properties.name ?? f.properties.full_address ?? 'Valgt sted',
  address: f.properties.place_formatted ?? f.properties.full_address ?? '',
  longitude: f.geometry.coordinates[0],
  latitude: f.geometry.coordinates[1],
});

/** Search a place by name or address. */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const url = `${GEOCODE}/forward?q=${encodeURIComponent(query)}&language=no&limit=6&autocomplete=true&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('Søket feilet');
  const data = (await res.json()) as { features?: Feature[] };
  return (data.features ?? []).map(toResult);
}

/** Name of the place at a position (null when nothing is found). */
export async function reverseGeocode(latitude: number, longitude: number): Promise<PlaceResult | null> {
  const url = `${GEOCODE}/reverse?longitude=${longitude}&latitude=${latitude}&language=no&limit=1&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { features?: Feature[] };
  return data.features?.[0] ? toResult(data.features[0]) : null;
}

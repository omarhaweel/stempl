import * as Location from 'expo-location';

type Position = { latitude: number; longitude: number };

const MAX_AGE_MS = 60_000; // a fix this fresh is fine for a 500 m check
const TIMEOUT_MS = 8_000;

/**
 * Current device position, or null if permission is denied or it can't be
 * found in time. The server decides whether a missing position is a problem.
 *
 * Fast path: reuse a recent fix; otherwise a balanced (network/Wi-Fi) fix
 * instead of waiting for a high-accuracy GPS lock, which can take many seconds.
 */
export async function getPosition(): Promise<Position | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const last = await Location.getLastKnownPositionAsync({ maxAge: MAX_AGE_MS, requiredAccuracy: 300 }).catch(() => null);
    if (last) return { latitude: last.coords.latitude, longitude: last.coords.longitude };

    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
    return fresh ? { latitude: fresh.coords.latitude, longitude: fresh.coords.longitude } : null;
  } catch {
    return null;
  }
}

/** Ask for permission and get a fix ahead of time so the next stempling is quick. */
export function warmUpPosition() {
  void getPosition();
}

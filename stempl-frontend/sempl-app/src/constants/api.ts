import Constants from 'expo-constants';

const API_PORT = 3000;

/**
 * Base URL of the Express backend.
 * - EXPO_PUBLIC_API_URL overrides everything (use it for a deployed server).
 * - Otherwise reuse the IP of the machine running the Expo dev server, so a
 *   real phone on the same Wi-Fi can reach the backend without hardcoding an IP.
 */
function getApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
  return `http://${host}:${API_PORT}`;
}

export const API_URL = getApiUrl();

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'auth_token';

// SecureStore is native-only; fall back to localStorage on web.
export async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
  return SecureStore.getItemAsync(KEY);
}

export async function setToken(token: string) {
  if (Platform.OS === 'web') return globalThis.localStorage?.setItem(KEY, token);
  await SecureStore.setItemAsync(KEY, token);
}

export async function clearToken() {
  if (Platform.OS === 'web') return globalThis.localStorage?.removeItem(KEY);
  await SecureStore.deleteItemAsync(KEY);
}

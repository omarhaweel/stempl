import { api } from '@/lib/api';
import { getToken } from '@/lib/token-storage';

/** api() with the stored login token attached. */
export async function authed<T>(
  path: string,
  options: { body?: unknown; method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' } = {},
): Promise<T> {
  return api<T>(path, { ...options, token: await getToken() });
}

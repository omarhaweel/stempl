import { API_URL } from '@/constants/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fieldErrors: Record<string, string> = {},
    /** The whole error response, for extra details such as `overlaps`. */
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: { body?: unknown; token?: string | null; method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' } = {},
): Promise<T> {
  const controller = new AbortController();
  // Free hosting (Render) can take up to a minute to wake the server after idle time.
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error ?? 'Forespørselen feilet', res.status, data.errors, data);
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(`Får ikke kontakt med serveren (${API_URL})`, 0);
  } finally {
    clearTimeout(timeout);
  }
}

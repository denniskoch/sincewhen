import type {
  Counter,
  CreateCounterInput,
  PublicConfig,
  UpdateCounterInput,
} from '@sincewhen/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as { error?: { message?: string; code?: string; fields?: Record<string, string[]> } } | null)
      ?.error;

    throw new ApiError(
      error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      error?.code,
      error?.fields,
    );
  }

  return payload as T;
}

export const api = {
  config: () => request<PublicConfig>('/config'),

  listCounters: () => request<{ counters: Counter[] }>('/counters').then((r) => r.counters),

  createCounter: (input: CreateCounterInput) =>
    request<{ counter: Counter }>('/counters', {
      method: 'POST',
      body: JSON.stringify(input),
    }).then((r) => r.counter),

  updateCounter: (id: number, input: UpdateCounterInput) =>
    request<{ counter: Counter }>(`/counters/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }).then((r) => r.counter),

  resetCounter: (id: number) =>
    request<{ counter: Counter }>(`/counters/${id}/reset`, { method: 'POST' }).then(
      (r) => r.counter,
    ),

  deleteCounter: (id: number) => request<void>(`/counters/${id}`, { method: 'DELETE' }),

  login: (password: string) =>
    request<{ authenticated: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  logout: () => request<{ authenticated: boolean }>('/auth/logout', { method: 'POST' }),

  session: () => request<{ authenticated: boolean }>('/auth/me'),
};

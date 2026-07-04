// Thin typed fetch wrapper around the CakeZake POS API.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

// Read the staff token (set on PIN login) so requests carry the actor identity.
function authHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const t = window.localStorage.getItem('cakezake-token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    cache: 'no-store',
    ...options,
    headers: { 'Content-Type': 'application/json', ...authHeader(), ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'DELETE',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
};

// Money helpers — API stores integer minor units (paisa for NPR).
const CURRENCY_SYMBOL = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL ?? 'Rs';
const CURRENCY_LOCALE = process.env.NEXT_PUBLIC_CURRENCY_LOCALE ?? 'en-IN';

export const formatMoney = (cents: number) =>
  `${CURRENCY_SYMBOL} ${(cents / 100).toLocaleString(CURRENCY_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Convert a major-unit amount (rupees) typed by staff into minor units (paisa).
export const dollarsToCents = (major: number) => Math.round(major * 100);

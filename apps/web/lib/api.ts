// Thin typed fetch wrapper around the CakeZake POS API.

import { cacheRead, cacheWrite, isNetworkError } from './offline';
import { enqueue, flush, type OutboxItem } from './outbox';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

// Thrown when a write was queued for later because the network was down. The
// caller can catch it to show a "will sync when back online" message instead of
// a hard error.
export class QueuedError extends Error {
  queued = true as const;
  constructor(public idempotencyKey: string) {
    super('Saved offline — will sync when the connection returns');
    this.name = 'QueuedError';
  }
}

// SaaS: which restaurant (tenant) this browser talks to — from the subdomain
// (everest.s3vya.tech) or a saved restaurant code. Empty = platform/control.
export function tenantSlug(): string {
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  const parts = host.split('.');
  if (parts.length >= 3 && !['www', 's3vya', 'api', 'app'].includes(parts[0])) return parts[0];
  return window.localStorage.getItem('s3vya-tenant') ?? '';
}
export function setTenantSlug(slug: string) {
  if (typeof window === 'undefined') return;
  if (slug.trim()) window.localStorage.setItem('s3vya-tenant', slug.trim().toLowerCase());
  else window.localStorage.removeItem('s3vya-tenant');
}

// Read the staff token (set on PIN login) so requests carry the actor identity.
function authHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const t = window.localStorage.getItem('cakezake-token');
  const slug = tenantSlug();
  return {
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
    ...(slug ? { 'X-Tenant': slug } : {}),
  };
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

// GET with a read-through cache: on success the response is cached; on a network
// failure the last-known cached copy is served so the terminal keeps rendering.
async function cachedGet<T>(path: string): Promise<T> {
  try {
    const data = await request<T>(path);
    cacheWrite(path, data);
    return data;
  } catch (err) {
    if (isNetworkError(err)) {
      const cached = cacheRead<T>(path);
      if (cached !== undefined) return cached;
    }
    throw err;
  }
}

// A mutation that, when the network is down, is queued to the outbox and retried
// on reconnect (throws QueuedError so the caller can inform the user). Use for
// fire-and-forget writes that don't need the server's response immediately
// (e.g. firing a KOT) — not for calls whose result the UI depends on right now.
async function queuedMutation<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    return await request<T>(path, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    if (isNetworkError(err)) {
      const item = enqueue(method, path, body);
      throw new QueuedError(item.idempotencyKey);
    }
    throw err;
  }
}

export const api = {
  get: <T>(path: string) => cachedGet<T>(path),
  // Perform a mutation as someone else (e.g. a manager override): the given
  // token is sent instead of the logged-in user's.
  postAs: <T>(token: string, path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), headers: { Authorization: `Bearer ${token}` } }),
  patchAs: <T>(token: string, path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body), headers: { Authorization: `Bearer ${token}` } }),
  deleteAs: <T>(token: string, path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),
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

  // Queueable variants (offline-safe, replayed on reconnect).
  postQueued: <T>(path: string, body: unknown) => queuedMutation<T>('POST', path, body),
  putQueued: <T>(path: string, body: unknown) => queuedMutation<T>('PUT', path, body),
  patchQueued: <T>(path: string, body: unknown) => queuedMutation<T>('PATCH', path, body),
};

// Replay one queued write with its stable idempotency key so the server dedupes.
function replay(item: OutboxItem): Promise<unknown> {
  return request(item.path, {
    method: item.method,
    headers: { 'Idempotency-Key': item.idempotencyKey },
    ...(item.body !== undefined ? { body: JSON.stringify(item.body) } : {}),
  });
}

// Drain the outbox (call on reconnect).
export function syncOutbox() {
  return flush((item) => replay(item).then(() => undefined), isNetworkError);
}

// Money helpers — API stores integer minor units (paisa for NPR).
// The symbol is dynamic: Settings → Preferences updates it at runtime.
let CURRENCY_SYMBOL = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL ?? 'Rs';
export function setCurrencySymbol(sym?: string | null) {
  if (sym && sym.trim()) CURRENCY_SYMBOL = sym.trim();
}
const CURRENCY_LOCALE = process.env.NEXT_PUBLIC_CURRENCY_LOCALE ?? 'en-IN';

export const formatMoney = (cents: number) =>
  `${CURRENCY_SYMBOL} ${(cents / 100).toLocaleString(CURRENCY_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Convert a major-unit amount (rupees) typed by staff into minor units (paisa).
export const dollarsToCents = (major: number) => Math.round(major * 100);

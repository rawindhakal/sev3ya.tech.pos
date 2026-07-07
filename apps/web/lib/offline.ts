// Offline resilience for the POS terminal.
//
// Two jobs:
//  1. Connectivity tracking — a heartbeat against the API /health endpoint plus
//     the browser online/offline events, exposed as a subscribable status.
//  2. A read-through cache — successful GET responses are stored in
//     localStorage so that, during a network blip, the terminal keeps rendering
//     the menu, tables, settings and the current order instead of going blank.
//
// This keeps the till usable through transient drops (the common real-world
// case) and refetches automatically the moment the connection returns.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const CACHE_PREFIX = 'cakezake-cache:';

export type ConnStatus = 'online' | 'offline';

let status: ConnStatus = 'online';
const listeners = new Set<(s: ConnStatus) => void>();

// Runs whenever we transition offline → online (set by the app to drain the
// outbox). Kept as a hook to avoid an import cycle with the api client.
let onReconnect: (() => void) | null = null;
export function setReconnectHandler(fn: () => void) {
  onReconnect = fn;
}

export function getStatus(): ConnStatus {
  return status;
}

export function onStatusChange(fn: (s: ConnStatus) => void): () => void {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}

function setStatus(next: ConnStatus) {
  if (next === status) return;
  const wasOffline = status === 'offline';
  status = next;
  listeners.forEach((fn) => fn(status));
  if (next === 'online' && wasOffline && onReconnect) onReconnect();
}

// ── Read-through cache ────────────────────────────────
export function cacheRead<T>(path: string): T | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + path);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function cacheWrite(path: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_PREFIX + path, JSON.stringify(value));
  } catch {
    /* quota / serialization — non-fatal */
  }
}

// A fetch error that means "the network is unreachable", not "the server said no".
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError; // fetch throws TypeError on connection failure
}

// ── Heartbeat ─────────────────────────────────────────
let heartbeatStarted = false;

async function ping(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

export function startHeartbeat() {
  if (heartbeatStarted || typeof window === 'undefined') return;
  heartbeatStarted = true;

  const check = async () => setStatus((await ping()) ? 'online' : 'offline');

  window.addEventListener('online', check);
  window.addEventListener('offline', () => setStatus('offline'));
  check();
  window.setInterval(check, 8000);
}

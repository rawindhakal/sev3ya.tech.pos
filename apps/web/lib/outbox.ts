// Offline write outbox.
//
// When a mutating request (POST/PATCH/PUT/DELETE) fails because the network is
// down, it is queued here instead of being lost. Each queued item carries a
// stable idempotency key, so when the connection returns and the queue is
// flushed, the server dedupes any write it already received — a KOT fired
// during a blip syncs exactly once, never twice.

export interface OutboxItem {
  id: string;
  method: string;
  path: string;
  body?: unknown;
  idempotencyKey: string;
  createdAt: number;
}

const KEY = 'cakezake-outbox';
const QUARANTINE_KEY = 'cakezake-outbox-quarantine';
const listeners = new Set<(count: number) => void>();

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function load(): OutboxItem[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as OutboxItem[];
  } catch {
    return [];
  }
}

// Thrown by enqueue()/save() when localStorage is full — a queued write must
// never disappear silently, so the caller has to surface this to the cashier
// rather than let it fall through as an ordinary error.
export class OutboxFullError extends Error {
  constructor() {
    super('Offline queue is full — reconnect to sync before recording more');
    this.name = 'OutboxFullError';
  }
}

function save(items: OutboxItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
      throw new OutboxFullError();
    }
    throw err;
  }
  listeners.forEach((fn) => fn(items.length));
}

// Dead-letter buffer for a poison item whose failure couldn't even be
// reported to /sync-failures (e.g. the report call itself dropped) — kept
// locally so ConnBadge/the recovery page can retry pushing it, rather than
// losing the record of the rejection entirely.
export interface QuarantinedItem extends OutboxItem {
  errorMessage: string;
  quarantinedAt: number;
}

export function quarantine(item: OutboxItem, err: unknown) {
  if (typeof window === 'undefined') return;
  try {
    const list = JSON.parse(window.localStorage.getItem(QUARANTINE_KEY) ?? '[]') as QuarantinedItem[];
    list.push({ ...item, errorMessage: err instanceof Error ? err.message : String(err), quarantinedAt: Date.now() });
    window.localStorage.setItem(QUARANTINE_KEY, JSON.stringify(list));
  } catch {
    /* best-effort — nothing further we can do if even this write fails */
  }
}

export function loadQuarantine(): QuarantinedItem[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(QUARANTINE_KEY) ?? '[]') as QuarantinedItem[];
  } catch {
    return [];
  }
}

export function clearQuarantineItem(id: string) {
  if (typeof window === 'undefined') return;
  const list = loadQuarantine().filter((i) => i.id !== id);
  window.localStorage.setItem(QUARANTINE_KEY, JSON.stringify(list));
}

export function pendingCount(): number {
  return load().length;
}

export function onPendingChange(fn: (count: number) => void): () => void {
  listeners.add(fn);
  fn(pendingCount());
  return () => listeners.delete(fn);
}

// Queue a write that couldn't reach the server. Returns the item's idempotency
// key so the caller can correlate it later if needed.
export function enqueue(method: string, path: string, body?: unknown): OutboxItem {
  const item: OutboxItem = {
    id: uid(),
    method,
    path,
    body,
    idempotencyKey: uid(),
    createdAt: Date.now(),
  };
  save([...load(), item]);
  return item;
}

let flushing = false;

// Replay the queue in FIFO order. Stops at the first network failure (still
// offline) and leaves the rest queued. A real server rejection (4xx/5xx) is
// NOT silently dropped — onPoison gets a chance to record it (e.g. to the
// /sync-failures recovery view) before it's removed from the active queue;
// retrying a genuine rejection forever would just spin. Called automatically
// on reconnect.
export async function flush(
  send: (item: OutboxItem) => Promise<void>,
  isNetworkError: (e: unknown) => boolean,
  onPoison: (item: OutboxItem, err: unknown) => Promise<void> | void,
): Promise<{ sent: number; remaining: number }> {
  if (flushing) return { sent: 0, remaining: pendingCount() };
  flushing = true;
  let sent = 0;
  try {
    let queue = load();
    while (queue.length) {
      const item = queue[0];
      try {
        await send(item);
      } catch (err) {
        if (isNetworkError(err)) break; // still offline — keep the rest queued, stop draining
        try {
          await onPoison(item, err);
        } catch {
          /* best-effort recording; never block the drain on it */
        }
      }
      queue = queue.slice(1);
      save(queue);
      sent += 1;
    }
    return { sent, remaining: queue.length };
  } finally {
    flushing = false;
  }
}

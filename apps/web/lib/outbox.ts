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

function save(items: OutboxItem[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
  listeners.forEach((fn) => fn(items.length));
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
// offline) and leaves the rest queued. Called automatically on reconnect.
export async function flush(
  send: (item: OutboxItem) => Promise<void>,
  isNetworkError: (e: unknown) => boolean,
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
        if (isNetworkError(err)) break; // still offline — keep the rest queued
        // A real server rejection (4xx/5xx): drop the poison item so the queue
        // can drain, but keep going with the others.
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

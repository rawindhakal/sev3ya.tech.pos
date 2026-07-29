import { ForbiddenException } from '@nestjs/common';

// In-process brute-force guard for the staff login endpoint. Keyed per
// tenant+username so one restaurant's lockouts can't affect another's, and
// so a single bad actor guessing one account doesn't lock out the whole
// tenant. Intentionally simple (no external store) — this app runs as a
// single Node process per deploy; if that ever changes to multiple
// instances behind a load balancer, this needs to move to a shared store
// (e.g. Redis) to stay effective.
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60_000;
const WINDOW_MS = 15 * 60_000;

interface Entry {
  failures: number;
  firstFailureAt: number;
  lockedUntil?: number;
}
const attempts = new Map<string, Entry>();

function keyFor(tenantId: string | null, username: string) {
  return `${tenantId ?? 'control'}:${username.trim().toLowerCase()}`;
}

export function assertLoginAllowed(tenantId: string | null, username: string) {
  const key = keyFor(tenantId, username);
  const entry = attempts.get(key);
  if (!entry) return;
  const now = Date.now();
  if (entry.lockedUntil && entry.lockedUntil > now) {
    const secs = Math.ceil((entry.lockedUntil - now) / 1000);
    throw new ForbiddenException(`Too many failed sign-in attempts — try again in ${secs}s`);
  }
  if (entry.lockedUntil && entry.lockedUntil <= now) attempts.delete(key);
}

export function recordLoginFailure(tenantId: string | null, username: string) {
  const key = keyFor(tenantId, username);
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.firstFailureAt > WINDOW_MS) {
    attempts.set(key, { failures: 1, firstFailureAt: now });
    return;
  }
  entry.failures += 1;
  if (entry.failures >= MAX_ATTEMPTS) entry.lockedUntil = now + LOCKOUT_MS;
}

export function recordLoginSuccess(tenantId: string | null, username: string) {
  attempts.delete(keyFor(tenantId, username));
}

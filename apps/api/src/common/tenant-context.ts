import { AsyncLocalStorage } from 'async_hooks';
import { PrismaClient } from '@prisma/client';

// Per-request tenant context (SaaS): the middleware resolves the tenant from
// the request and stores that tenant's own PrismaClient here. PrismaService
// transparently delegates to it, so every existing service is tenant-aware
// without any changes. No store = the platform/control database.
export interface TenantStore {
  client: PrismaClient;
  tenant: { id: string; slug: string; name: string; status: string } | null;
}

export const tenantContext = new AsyncLocalStorage<TenantStore>();

// One PrismaClient per tenant database, cached for the process lifetime.
const clients = new Map<string, PrismaClient>();

export function clientForDb(dbName: string): PrismaClient {
  let c = clients.get(dbName);
  if (!c) {
    const base = process.env.DATABASE_URL ?? '';
    let url = base.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`);
    // Cap each tenant's pool so dozens of tenant DBs can't exhaust Postgres.
    url += (url.includes('?') ? '&' : '?') + 'connection_limit=3&pool_timeout=10';
    c = new PrismaClient({ datasources: { db: { url } } });
    clients.set(dbName, c);
  }
  return c;
}

export function dropClient(dbName: string) {
  const c = clients.get(dbName);
  if (c) { c.$disconnect().catch(() => {}); clients.delete(dbName); }
}

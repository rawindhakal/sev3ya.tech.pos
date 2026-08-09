#!/usr/bin/env node
/*
 * Applies pending Prisma migrations + the multi-outlet backfill to the
 * control DB and EVERY tenant DB, using the control DB's own `tenants` table
 * as the source of truth for which tenant databases exist — never a
 * remembered/hardcoded list (same rule as migrate-and-backfill-roles.js,
 * after a past deploy caused a live outage by migrating only the one tenant
 * remembered from context).
 *
 * For each database: ensures exactly one Outlet with isDefault=true exists
 * (named from CafeSetting.restaurantName, falling back to "Main Outlet"),
 * ensures at least one Terminal exists under it, and backfills every
 * existing Order/RestaurantTable/Terminal row whose outletId is still null
 * to that default outlet — so every current single-location tenant ends up
 * with zero unassigned rows and zero UX change (see Phase 3 plan).
 *
 * Run from apps/api after `pnpm build`:
 *   node scripts/migrate-and-backfill-outlets.js            # uses .env DATABASE_URL
 *   node scripts/migrate-and-backfill-outlets.js --dry-run   # preview only, no writes
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const { PrismaClient } = require('@prisma/client');

const CONTROL_URL = process.env.DATABASE_URL;
if (!CONTROL_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }
const urlFor = (db) => CONTROL_URL.replace(/\/[^/?]+(\?|$)/, `/${db}$1`);
const dryRun = process.argv.includes('--dry-run');

async function migrateAndBackfill(label, url) {
  console.log(`\n── ${label} (${url.replace(/:[^:@]+@/, ':***@')}) ──`);
  // migrate deploy always runs, even under --dry-run — Migration A is purely
  // additive (nullable columns + new tables), no data-loss risk, and this
  // backfill needs the outlets/employee_outlets tables to exist to query
  // against. --dry-run only skips the WRITE steps below.
  execSync('node_modules/.bin/prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    let outlet = await client.outlet.findFirst({ where: { isDefault: true } });
    if (!outlet) {
      const settings = await client.cafeSetting.findUnique({ where: { id: 'singleton' } }).catch(() => null);
      const name = settings?.restaurantName?.trim() || 'Main Outlet';
      console.log(`  no default outlet — ${dryRun ? 'would create' : 'creating'} "${name}"`);
      if (!dryRun) outlet = await client.outlet.create({ data: { name, isDefault: true } });
    } else {
      console.log(`  default outlet already exists: "${outlet.name}"`);
    }

    const terminalCount = await client.terminal.count();
    if (terminalCount === 0 && outlet) {
      console.log(`  no terminals — ${dryRun ? 'would create' : 'creating'} "Till 1"`);
      if (!dryRun) await client.terminal.create({ data: { name: 'Till 1', outletId: outlet.id } });
    }

    const [ordersToBackfill, tablesToBackfill, terminalsToBackfill] = await Promise.all([
      client.order.count({ where: { outletId: null } }),
      client.restaurantTable.count({ where: { outletId: null } }),
      client.terminal.count({ where: { outletId: null } }),
    ]);
    console.log(`  rows to backfill: orders=${ordersToBackfill}, tables=${tablesToBackfill}, terminals=${terminalsToBackfill}`);
    if (!dryRun && outlet) {
      if (ordersToBackfill) await client.order.updateMany({ where: { outletId: null }, data: { outletId: outlet.id } });
      if (tablesToBackfill) await client.restaurantTable.updateMany({ where: { outletId: null }, data: { outletId: outlet.id } });
      if (terminalsToBackfill) await client.terminal.updateMany({ where: { outletId: null }, data: { outletId: outlet.id } });
    }
  } finally {
    await client.$disconnect();
  }
}

async function main() {
  await migrateAndBackfill('control DB', CONTROL_URL);

  const control = new PrismaClient();
  const tenants = await control.tenant.findMany({ select: { slug: true, dbName: true } });
  console.log(`\nFound ${tenants.length} tenant(s): ${tenants.map((t) => t.slug).join(', ') || '(none)'}`);
  for (const t of tenants) {
    await migrateAndBackfill(`tenant "${t.slug}"`, urlFor(t.dbName));
  }
  await control.$disconnect();

  console.log(dryRun ? '\nDry run complete — no changes were written.' : '\n✅ All databases migrated and backfilled.');
}

main().catch((e) => { console.error(e); process.exit(1); });

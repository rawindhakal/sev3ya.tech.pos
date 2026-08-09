#!/usr/bin/env node
/*
 * Applies pending Prisma migrations + the roles/permissions backfill
 * (seedSystemRolesAndBackfill) to the control DB and EVERY tenant DB, using
 * the control DB's own `tenants` table as the source of truth for which
 * tenant databases exist — never a remembered/hardcoded list (a past deploy
 * here caused a live outage by migrating only the one tenant remembered from
 * context; always query fresh).
 *
 * Run from apps/api after `pnpm build` (needs dist/roles/system-roles.seed.js):
 *   node scripts/migrate-and-backfill-roles.js            # uses .env DATABASE_URL
 *   node scripts/migrate-and-backfill-roles.js --dry-run   # preview only, no writes
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Load .env like the API does (no dotenv dependency games — parse directly).
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const { PrismaClient } = require('@prisma/client');
const { seedSystemRolesAndBackfill } = require('../dist/roles/system-roles.seed');

const CONTROL_URL = process.env.DATABASE_URL;
if (!CONTROL_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }
const urlFor = (db) => CONTROL_URL.replace(/\/[^/?]+(\?|$)/, `/${db}$1`);
const dryRun = process.argv.includes('--dry-run');

async function migrateAndBackfill(label, url) {
  console.log(`\n── ${label} (${url.replace(/:[^:@]+@/, ':***@')}) ──`);
  // `migrate deploy` always runs, even under --dry-run: it's additive/safe
  // (new nullable columns + new tables, see Migration A), and the backfill
  // preview below needs the roles/role_permissions tables to exist to query
  // against. --dry-run only skips the DATA writes (role creation, employee
  // assignment) inside seedSystemRolesAndBackfill.
  execSync('node_modules/.bin/prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
  const client = new PrismaClient({ datasources: { db: { url } } });
  const report = await seedSystemRolesAndBackfill(client, { dryRun });
  console.log(`  employees backfilled: ${report.backfilled}/${report.total}`);
  console.log(`  roles ${dryRun ? 'that would be created' : 'created'}: ${report.rolesCreated.length ? report.rolesCreated.join(', ') : '(none — already backfilled)'}`);
  if (report.unassigned.length) {
    console.error(`  ⚠️  ${report.unassigned.join(', ')}`);
    process.exitCode = 2;
  }
  await client.$disconnect();
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
  if (process.exitCode === 2) {
    console.error('\n⚠️  One or more databases have unassigned employees — do NOT run the cleanup migration until this is resolved.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

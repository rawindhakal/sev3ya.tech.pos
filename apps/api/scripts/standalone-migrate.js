#!/usr/bin/env node
/*
 * One-time migration: make the control plane fully standalone.
 *
 *  1. Backup the main DB (pg_dump).
 *  2. Copy it wholesale into a new tenant DB (pos_t_cakezake).
 *  3. Tenant DB: drop control-plane rows (plans/tenants/subscription_payments).
 *  4. Control DB: wipe ALL restaurant/operational data + employees — it keeps
 *     only platform data (plans, tenants, payments) + one platform admin.
 *  5. Create the platform admin (username "platform", generated password).
 *  6. Register the copied restaurant as tenant "cakezake" (ENTERPRISE, ACTIVE).
 *
 * Run from apps/api after `pnpm build` (needs dist/common/password.js):
 *   node scripts/standalone-migrate.js            # uses .env DATABASE_URL
 *   BACKUP_DIR=/root node scripts/standalone-migrate.js
 */
const { execSync } = require('child_process');
const crypto = require('crypto');
const os = require('os');
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
const { hashPassword } = require('../dist/common/password');

const CONTROL_URL = process.env.DATABASE_URL;
if (!CONTROL_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }
const SLUG = 'cakezake';
const TENANT_DB = 'pos_t_cakezake';
const urlFor = (db) => CONTROL_URL.replace(/\/[^/?]+(\?|$)/, `/${db}$1`);
// psql/pg_dump don't understand Prisma-only params like ?schema=public.
const shellUrl = (u) => u.replace(/\?.*$/, '');

// Everything operational — the restaurant's world. Stays only in the tenant copy.
const OPERATIONAL_TABLES = [
  'payments', 'order_items', 'cash_movements', 'orders', 'cash_drawer_sessions',
  'reservations', 'shifts', 'stock_movements', 'purchase_order_lines', 'purchase_orders',
  'cupping_scores', 'roast_batches', 'green_bean_batches', 'expenses', 'audit_logs',
  'idempotency_keys', 'menu_item_variants', 'menu_items', 'categories',
  'modifiers', 'modifier_groups', 'restaurant_tables', 'credit_ledger_entries', 'customers',
  'recipe_items', 'ingredients', 'suppliers', 'attendance_logs',
  'journal_lines', 'journal_entries', 'ledger_accounts', 'waiters', 'terminals',
  'employees',
];

const genPassword = () => {
  // Readable but strong: s3vya-XXXX-XXXX-XXXX from a 62-char alphabet.
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const chunk = () => Array.from(crypto.randomBytes(4)).map((b) => alpha[b % alpha.length]).join('');
  return `s3vya-${chunk()}-${chunk()}-${chunk()}`;
};

async function main() {
  const control = new PrismaClient();
  const sh = (cmd) => execSync(cmd, { stdio: ['ignore', 'inherit', 'inherit'], shell: '/bin/bash' });

  // Pre-flight counts for the verification summary.
  const [pre] = await control.$queryRawUnsafe(
    `SELECT (SELECT count(*) FROM orders) AS orders, (SELECT count(*) FROM employees) AS employees,
            (SELECT count(*) FROM menu_items) AS menu_items, (SELECT count(*) FROM customers) AS customers`,
  );
  console.log(`Pre-migration control DB: ${pre.orders} orders, ${pre.employees} employees, ${pre.menu_items} menu items, ${pre.customers} customers`);

  // 1) Backup
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backup = path.join(process.env.BACKUP_DIR || os.tmpdir(), `backup-pre-standalone-${stamp}.sql`);
  console.log(`\n[1/6] Backing up control DB → ${backup}`);
  sh(`pg_dump "${shellUrl(CONTROL_URL)}" > "${backup}"`);

  // 2) Create tenant DB and copy everything into it.
  const exists = await control.$queryRawUnsafe(`SELECT 1 FROM pg_database WHERE datname = '${TENANT_DB}'`);
  if (exists.length) { console.error(`Database ${TENANT_DB} already exists — aborting (drop it first to re-run).`); process.exit(1); }
  console.log(`[2/6] Creating ${TENANT_DB} and copying the full database…`);
  await control.$executeRawUnsafe(`CREATE DATABASE "${TENANT_DB}"`);
  sh(`pg_dump "${shellUrl(CONTROL_URL)}" | psql -q "${shellUrl(urlFor(TENANT_DB))}" > /dev/null`);

  // 3) Tenant DB: control-plane tables have no business there.
  console.log(`[3/6] Cleaning control-plane tables out of ${TENANT_DB}…`);
  const tenantDb = new PrismaClient({ datasources: { db: { url: urlFor(TENANT_DB) } } });
  await tenantDb.$executeRawUnsafe(`TRUNCATE subscription_payments, tenants, plans CASCADE`);

  // 4) Control DB: wipe all operational data + employees.
  console.log('[4/6] Wiping operational data from the control DB…');
  await control.$executeRawUnsafe(`TRUNCATE ${OPERATIONAL_TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`);

  // 5) Platform admin.
  const password = process.env.PLATFORM_ADMIN_PASSWORD || genPassword();
  console.log('[5/6] Creating platform admin "platform"…');
  await control.employee.create({
    data: {
      name: 's3vya Platform Admin', role: 'ADMIN', username: 'platform',
      passwordHash: hashPassword(password),
      canVoid: true, canDiscount: true, canManageInventory: true, canViewReports: true, canManageStaff: true,
    },
  });
  await control.cafeSetting.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', restaurantName: 's3vya Platform' },
    update: { restaurantName: 's3vya Platform' },
  });

  // 6) Register the restaurant as tenant "cakezake" on ENTERPRISE.
  console.log(`[6/6] Registering tenant "${SLUG}" (ENTERPRISE, ACTIVE)…`);
  const plan = await control.plan.upsert({
    where: { code: 'ENTERPRISE' },
    create: {
      code: 'ENTERPRISE', name: 'Enterprise', priceMonthlyCents: 600000, priceYearlyCents: 6000000,
      maxEmployees: 100, maxItems: 5000,
      features: ['Everything in Pro', 'Unlimited-scale staff & menu', 'Priority support & onboarding', 'Custom reports'],
    },
    update: {},
  });
  const tenantSettings = await tenantDb.cafeSetting.findUnique({ where: { id: 'singleton' } });
  await control.tenant.upsert({
    where: { slug: SLUG },
    create: {
      slug: SLUG, name: tenantSettings?.restaurantName || 'CakeZake', dbName: TENANT_DB,
      planId: plan.id, status: 'ACTIVE',
      paidUntil: new Date(Date.now() + 10 * 365 * 864e5), // house tenant: 10 years
      ownerName: 's3vya (house tenant)',
    },
    update: { dbName: TENANT_DB, planId: plan.id, status: 'ACTIVE' },
  });

  // ── Verification summary ──
  const [post] = await control.$queryRawUnsafe(
    `SELECT (SELECT count(*) FROM orders) AS orders, (SELECT count(*) FROM employees) AS employees,
            (SELECT count(*) FROM menu_items) AS menu_items, (SELECT count(*) FROM tenants) AS tenants`,
  );
  const [tpost] = await tenantDb.$queryRawUnsafe(
    `SELECT (SELECT count(*) FROM orders) AS orders, (SELECT count(*) FROM employees) AS employees,
            (SELECT count(*) FROM menu_items) AS menu_items, (SELECT count(*) FROM customers) AS customers`,
  );
  console.log('\n══════════ MIGRATION COMPLETE ══════════');
  console.log(`Control DB : ${post.orders} orders, ${post.employees} employee (platform admin), ${post.menu_items} menu items, ${post.tenants} tenant(s)`);
  console.log(`Tenant DB  : ${tpost.orders} orders, ${tpost.employees} employees, ${tpost.menu_items} menu items, ${tpost.customers} customers`);
  const ok = Number(post.orders) === 0 && Number(post.employees) === 1
    && Number(tpost.orders) === Number(pre.orders) && Number(tpost.employees) === Number(pre.employees);
  console.log(ok ? '✅ Counts check out.' : '⚠️  COUNT MISMATCH — inspect before going further!');
  console.log(`\nBackup     : ${backup}`);
  console.log('Platform admin credentials (SHOWN ONCE — save them now):');
  console.log(`  username : platform`);
  console.log(`  password : ${password}`);
  console.log(`Restaurant staff log in with restaurant code "${SLUG}" — same usernames/passwords as before.`);

  await tenantDb.$disconnect();
  await control.$disconnect();
  process.exit(ok ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });

// Shared by three callers so the legacy-role → permission mapping never
// drifts between them: the one-time migrate-and-backfill script, new-tenant
// provisioning (platform.service.ts), and the dev seed (prisma/seed.ts).
//
// This is the zero-regression core of the roles/permissions rollout: it
// reads each employee's ACTUAL (role, 5 flags) tuple — not an assumed clean
// set of 5 presets, since role and the flags are independent columns today
// (e.g. seed.ts gives MANAGER every flag except canManageStaff, while
// RoleGuard(['ADMIN','MANAGER']) elsewhere granted Manager the same
// accounting/attendance/CRM/IRD access as Admin purely by role name) — and
// creates exactly the Role rows needed to reproduce every distinct tuple's
// effective access, then assigns every employee to the right one.
import type { PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS, PERMISSIONS, PermissionKey } from '../common/permissions';

const FLAG_TO_PERMS: Record<string, PermissionKey[]> = {
  canVoid: [PERMISSIONS.ORDERS_VOID],
  canDiscount: [PERMISSIONS.ORDERS_DISCOUNT],
  canManageInventory: [PERMISSIONS.INVENTORY_MANAGE],
  canViewReports: [PERMISSIONS.REPORTS_VIEW],
  // roles.manage rides along with canManageStaff even though it's a brand
  // new permission with no old flag of its own: it's the same "can configure
  // staff-related access" scope, and without this, NO backfilled employee —
  // not even a legacy ADMIN — would be able to manage roles after the
  // migration, since roles.manage otherwise only exists on the protected
  // Owner role, which starts unassigned to anyone. Confirmed by testing a
  // live backfilled Admin login against POST /roles before this fix (403).
  canManageStaff: [
    PERMISSIONS.STAFF_MANAGE,
    PERMISSIONS.ROLES_MANAGE,
    PERMISSIONS.SETTINGS_MANAGE,
    PERMISSIONS.GIFTCARDS_MANAGE,
    PERMISSIONS.PROMOTIONS_MANAGE,
    PERMISSIONS.SYNC_FAILURES_MANAGE,
  ],
};

// Today's RoleGuard(['ADMIN','MANAGER'])/RoleGuard(['ADMIN']) checks grant
// access purely by role NAME, independent of the flags — layered on
// additively during backfill.
const ROLE_NAME_GRANTS: Record<string, PermissionKey[]> = {
  ADMIN: [
    PERMISSIONS.ACCOUNTING_MANAGE,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.IRD_SYNC,
    PERMISSIONS.CRM_SETTLE_CREDIT,
    PERMISSIONS.CRM_DELETE,
    PERMISSIONS.PLATFORM_MANAGE,
    PERMISSIONS.CASH_DRAWER_ADJUST_FLOAT,
  ],
  MANAGER: [
    PERMISSIONS.ACCOUNTING_MANAGE,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.IRD_SYNC,
    PERMISSIONS.CRM_SETTLE_CREDIT,
    PERMISSIONS.CRM_DELETE,
  ],
};

// Old desktop-till rule: only CASHIER could sign into the till app.
const TILL_ELIGIBLE_ROLES = new Set(['CASHIER']);

interface LegacyEmp {
  id: string;
  role: string;
  canVoid: boolean;
  canDiscount: boolean;
  canManageInventory: boolean;
  canViewReports: boolean;
  canManageStaff: boolean;
}

function effectivePermissions(e: LegacyEmp): PermissionKey[] {
  const set = new Set<PermissionKey>();
  (['canVoid', 'canDiscount', 'canManageInventory', 'canViewReports', 'canManageStaff'] as const).forEach((flag) => {
    if (e[flag]) FLAG_TO_PERMS[flag].forEach((p) => set.add(p));
  });
  (ROLE_NAME_GRANTS[e.role] ?? []).forEach((p) => set.add(p));
  if (TILL_ELIGIBLE_ROLES.has(e.role)) set.add(PERMISSIONS.POS_TILL_SIGNIN);
  return [...set].sort();
}

// Canonical presets — used only to give an auto-created role a clean,
// recognizable name when an employee's actual tuple happens to match one
// exactly, instead of a generic "<role> (custom N)". Named 'Admin', not
// 'Owner': 'Owner' is reserved for the protected, always-100%-permissions
// role created above — a legacy ADMIN employee is never a perfect match for
// it (e.g. only CASHIER could sign into the desktop till historically, so
// even a fully-flagged ADMIN lacks pos.tillSignIn), so it always needs its
// own distinct, editable role rather than colliding with the protected one.
const CANONICAL_PRESETS: { name: string; role: string; flags: Partial<LegacyEmp> }[] = [
  { name: 'Admin', role: 'ADMIN', flags: { canVoid: true, canDiscount: true, canManageInventory: true, canViewReports: true, canManageStaff: true } },
  { name: 'Manager', role: 'MANAGER', flags: { canVoid: true, canDiscount: true, canManageInventory: true, canViewReports: true, canManageStaff: false } },
  { name: 'Cashier', role: 'CASHIER', flags: { canVoid: false, canDiscount: true, canManageInventory: false, canViewReports: false, canManageStaff: false } },
  { name: 'Barista', role: 'BARISTA', flags: { canVoid: false, canDiscount: false, canManageInventory: false, canViewReports: false, canManageStaff: false } },
  { name: 'Waiter', role: 'WAITER', flags: {} },
];

export interface BackfillReport {
  total: number;
  backfilled: number;
  rolesCreated: string[];
  unassigned: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seedSystemRolesAndBackfill(client: PrismaClient, opts: { dryRun?: boolean } = {}): Promise<BackfillReport> {
  const dryRun = !!opts.dryRun;

  // 1) Ensure the protected "Owner" role exists with EVERY current
  //    permission — auto-syncs to new keys added by future phases.
  let owner = await client.role.findFirst({ where: { isProtected: true } });
  if (!owner) {
    if (!dryRun) {
      owner = await client.role.create({
        data: {
          name: 'Owner',
          isProtected: true,
          portal: 'BACK_OFFICE',
          permissions: { create: ALL_PERMISSIONS.map((key) => ({ key })) },
        },
      });
    }
  } else if (!dryRun) {
    const existing = new Set(
      (await client.rolePermission.findMany({ where: { roleId: owner.id } })).map((p) => p.key),
    );
    const missing = ALL_PERMISSIONS.filter((k) => !existing.has(k));
    if (missing.length) {
      await client.rolePermission.createMany({ data: missing.map((key) => ({ roleId: owner!.id, key })) });
    }
  }
  const ownerPermsKey = ALL_PERMISSIONS.slice().sort().join('|');

  // 2) Read every employee that hasn't been assigned a Role yet. This
  // function is called both against databases still on the old schema
  // (legacy `role`/boolean columns present, `roleId` nullable — the real
  // migration path) AND against databases that already have the cleanup
  // migration applied (new tenants provisioned after that migration landed,
  // or a dev reseed of an already-migrated local DB) — where those legacy
  // columns no longer exist at all. Query failure with "column does not
  // exist" (Postgres 42703) means the latter case: there is nothing to
  // backfill, not an error.
  let employees: LegacyEmp[] = [];
  try {
    employees = await client.$queryRawUnsafe<LegacyEmp[]>(
      `SELECT id, role, "canVoid", "canDiscount", "canManageInventory", "canViewReports", "canManageStaff"
       FROM employees WHERE "roleId" IS NULL`,
    );
  } catch (err) {
    const code = (err as { meta?: { code?: string } })?.meta?.code;
    if (code !== '42703') throw err;
  }

  // Cache key is (permission-set, portal) — NOT permissions alone. Two
  // legacy roles can compute to the exact same permission set (e.g. BARISTA
  // and WAITER both have zero flags/grants in the dev seed) but still need
  // separate Role rows if their portal differs, or the second employee
  // silently inherits the first's portal (a Waiter getting BACK_OFFICE
  // access because a Barista's role was cached first — caught by testing
  // the dry-run output against the seeded dev data before this shipped).
  const roleCache = new Map<string, string>();
  const rolesCreated: string[] = [];
  let backfilled = 0;

  for (const emp of employees) {
    const perms = effectivePermissions(emp);
    const portal = emp.role === 'WAITER' ? 'WAITER_ONLY' : 'BACK_OFFICE';
    const sigKey = `${perms.join('|')}::${portal}`;
    const ownerSigKey = `${ownerPermsKey}::BACK_OFFICE`;

    // Full-access tuple -> the protected Owner role, never a lookalike copy.
    if (owner && sigKey === ownerSigKey) {
      if (!dryRun) await client.employee.update({ where: { id: emp.id }, data: { roleId: owner.id } });
      backfilled++;
      continue;
    }

    let roleId = roleCache.get(sigKey);
    if (!roleId) {
      const preset = CANONICAL_PRESETS.find(
        (p) => p.role === emp.role && effectivePermissions({ ...emp, ...p.flags } as LegacyEmp).join('|') === perms.join('|'),
      );
      const baseName = preset?.name ?? emp.role;
      let name = baseName;
      let n = 1;
      if (!dryRun) {
        while (await client.role.findUnique({ where: { name } })) name = `${baseName} (custom ${++n})`;
        const created = await client.role.create({
          data: {
            name,
            portal,
            permissions: { create: perms.map((key) => ({ key })) },
          },
        });
        roleId = created.id;
      } else {
        roleId = `dry-run:${name}`;
      }
      roleCache.set(sigKey, roleId);
      rolesCreated.push(name);
    }
    if (!dryRun) await client.employee.update({ where: { id: emp.id }, data: { roleId } });
    backfilled++;
  }

  // Raw SQL (not the typed client) deliberately — this script runs against
  // databases both before and after the cleanup migration makes roleId
  // required, and a typed `where: { roleId: null }` filter only compiles
  // against the pre-cleanup schema shape.
  const unassigned: string[] = [];
  if (!dryRun) {
    const [{ count }] = await client.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) AS count FROM employees WHERE "roleId" IS NULL`,
    );
    if (Number(count) > 0) unassigned.push(`${count} employee row(s) still have roleId = NULL`);
  }

  return { total: employees.length, backfilled, rolesCreated, unassigned };
}

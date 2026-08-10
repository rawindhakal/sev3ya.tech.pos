// Fixed catalog — permission KEYS only mean something because a guard checks
// them somewhere in this codebase, so this list is not user-editable. What IS
// user-editable is which keys a given Role grants (see the roles module).
// Adding a new key later requires a code change here plus a guard that checks
// it, but NEVER a Prisma migration — RolePermission.key is a plain string
// column, not an enum.
export const PERMISSIONS = {
  ORDERS_DISCOUNT: 'orders.discount',
  ORDERS_VOID: 'orders.void',
  POS_TILL_SIGNIN: 'pos.tillSignIn',
  STAFF_MANAGE: 'staff.manage',
  ROLES_MANAGE: 'roles.manage',
  OUTLETS_MANAGE: 'outlets.manage',
  ATTENDANCE_MANAGE: 'attendance.manage',
  HR_MANAGE: 'hr.manage',
  SETTINGS_MANAGE: 'settings.manage',
  INVENTORY_MANAGE: 'inventory.manage',
  REPORTS_VIEW: 'reports.view',
  ACCOUNTING_MANAGE: 'accounting.manage',
  ACCOUNTING_APPROVE: 'accounting.approve',
  GIFTCARDS_MANAGE: 'giftcards.manage',
  PROMOTIONS_MANAGE: 'promotions.manage',
  SYNC_FAILURES_MANAGE: 'syncFailures.manage',
  CRM_SETTLE_CREDIT: 'crm.settleCredit',
  CRM_DELETE: 'crm.delete',
  CASH_DRAWER_ADJUST_FLOAT: 'cashDrawer.adjustFloat',
  IRD_SYNC: 'ird.sync',
  PLATFORM_MANAGE: 'platform.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

export interface PermissionCatalogEntry {
  key: PermissionKey;
  label: string;
  module: string;
}

export const PERMISSION_CATALOG: PermissionCatalogEntry[] = [
  { key: PERMISSIONS.ORDERS_DISCOUNT, label: 'Apply discounts / mark complimentary', module: 'Orders' },
  { key: PERMISSIONS.ORDERS_VOID, label: 'Void items & baskets, issue refunds', module: 'Orders' },
  { key: PERMISSIONS.POS_TILL_SIGNIN, label: 'Sign in to the desktop POS till', module: 'Orders' },
  { key: PERMISSIONS.STAFF_MANAGE, label: 'Create / edit / deactivate employees', module: 'Staff' },
  { key: PERMISSIONS.ROLES_MANAGE, label: 'Create / edit / delete roles & permissions', module: 'Staff' },
  { key: PERMISSIONS.OUTLETS_MANAGE, label: 'Manage outlets, terminals & staff assignment', module: 'Staff' },
  { key: PERMISSIONS.ATTENDANCE_MANAGE, label: 'Manage attendance devices & punches', module: 'Staff' },
  { key: PERMISSIONS.HR_MANAGE, label: 'Manage leave, shifts, employee documents, performance notes & payroll adjustments', module: 'HRM' },
  { key: PERMISSIONS.SETTINGS_MANAGE, label: 'Change restaurant settings, menu, printing', module: 'Settings' },
  { key: PERMISSIONS.INVENTORY_MANAGE, label: 'Manage inventory & purchasing', module: 'Inventory' },
  { key: PERMISSIONS.REPORTS_VIEW, label: 'View reports, MIS, P&L, audit log', module: 'Reports & Accounting' },
  { key: PERMISSIONS.ACCOUNTING_MANAGE, label: 'Manage chart of accounts & journal entries', module: 'Reports & Accounting' },
  { key: PERMISSIONS.ACCOUNTING_APPROVE, label: 'Approve or reject pending journal entries', module: 'Reports & Accounting' },
  { key: PERMISSIONS.IRD_SYNC, label: 'Trigger IRD fiscal sync', module: 'Reports & Accounting' },
  { key: PERMISSIONS.GIFTCARDS_MANAGE, label: 'Issue / top up gift cards', module: 'Gift Cards & Promotions' },
  { key: PERMISSIONS.PROMOTIONS_MANAGE, label: 'Manage coupons', module: 'Gift Cards & Promotions' },
  { key: PERMISSIONS.SYNC_FAILURES_MANAGE, label: 'View & acknowledge sync recovery failures', module: 'Sync Recovery' },
  { key: PERMISSIONS.CRM_SETTLE_CREDIT, label: 'Settle customer credit accounts', module: 'CRM' },
  { key: PERMISSIONS.CRM_DELETE, label: 'Delete customer records', module: 'CRM' },
  { key: PERMISSIONS.CASH_DRAWER_ADJUST_FLOAT, label: 'Adjust cash drawer opening float mid-day', module: 'Cash Drawer' },
  { key: PERMISSIONS.PLATFORM_MANAGE, label: 'Access the s3vya Platform Console', module: 'Platform' },
];

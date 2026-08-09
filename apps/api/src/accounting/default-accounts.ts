import { AccountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Shared by JournalService and PostingService (kept in its own file so
// neither has to import the other just for this — the very first
// transaction a restaurant ever posts might be an auto-posted order payment
// before anyone has opened the Accounting page, so the chart can't only be
// seeded lazily from JournalService's own methods).
export const DEFAULT_ACCOUNTS: { code: string; name: string; type: AccountType; group: string; isSystem?: boolean }[] = [
  { code: '1000', name: 'Cash in Hand', type: 'ASSET', group: 'Current Assets', isSystem: true },
  { code: '1100', name: 'Bank & Wallets', type: 'ASSET', group: 'Current Assets', isSystem: true },
  { code: '1200', name: 'Sundry Debtors (Customer Credit)', type: 'ASSET', group: 'Current Assets', isSystem: true },
  { code: '1300', name: 'Inventory / Stock', type: 'ASSET', group: 'Current Assets', isSystem: true },
  { code: '1400', name: 'Fixed Assets', type: 'ASSET', group: 'Fixed Assets' },
  { code: '2000', name: 'Sundry Creditors (Suppliers)', type: 'LIABILITY', group: 'Current Liabilities', isSystem: true },
  { code: '2100', name: 'VAT Payable', type: 'LIABILITY', group: 'Duties & Taxes', isSystem: true },
  { code: '2200', name: 'Salaries Payable', type: 'LIABILITY', group: 'Current Liabilities' },
  { code: '2300', name: 'Gift Cards Outstanding', type: 'LIABILITY', group: 'Current Liabilities', isSystem: true },
  { code: '3000', name: "Owner's Capital", type: 'EQUITY', group: 'Capital Account' },
  { code: '3100', name: 'Drawings', type: 'EQUITY', group: 'Capital Account' },
  { code: '4000', name: 'Sales Account', type: 'INCOME', group: 'Sales Accounts', isSystem: true },
  { code: '4100', name: 'Other Income', type: 'INCOME', group: 'Indirect Income' },
  { code: '5000', name: 'Purchases', type: 'EXPENSE', group: 'Purchase Accounts', isSystem: true },
  { code: '5100', name: 'Rent', type: 'EXPENSE', group: 'Indirect Expenses' },
  { code: '5200', name: 'Salaries & Wages', type: 'EXPENSE', group: 'Indirect Expenses' },
  { code: '5300', name: 'Utilities', type: 'EXPENSE', group: 'Indirect Expenses' },
  { code: '5400', name: 'Marketing', type: 'EXPENSE', group: 'Indirect Expenses' },
  { code: '5500', name: 'Miscellaneous Expenses', type: 'EXPENSE', group: 'Indirect Expenses' },
  { code: '5600', name: 'Repairs & Maintenance', type: 'EXPENSE', group: 'Indirect Expenses', isSystem: true },
  { code: '5700', name: 'Supplies', type: 'EXPENSE', group: 'Indirect Expenses', isSystem: true },
];

// Exported for reuse by the auto-posting hooks in orders/purchasing/crm/
// finance services, so the "which account does this payment method post to"
// mapping lives in exactly one place.
export const BANK_METHODS = ['BANK', 'CARD', 'FONEPAY', 'ESEWA', 'KHALTI'] as const;

// System account codes, named — avoids magic-string codes scattered across
// every auto-posting hook.
export const ACCOUNT_CODES = {
  CASH: '1000',
  BANK: '1100',
  DEBTORS: '1200',
  CREDITORS: '2000',
  VAT_PAYABLE: '2100',
  GIFTCARDS_OUTSTANDING: '2300',
  SALES: '4000',
  PURCHASES: '5000',
  RENT: '5100',
  SALARIES: '5200',
  UTILITIES: '5300',
  MARKETING: '5400',
  MISC_EXPENSES: '5500',
  MAINTENANCE: '5600',
  SUPPLIES: '5700',
} as const;

// Seed the default chart (idempotent) — always runs, relying on `code`'s
// unique constraint + skipDuplicates so it's a no-op for accounts that
// already exist. This must NOT short-circuit on "chart already has rows":
// a later deploy can add new system accounts (e.g. 2300 for gift cards) to
// DEFAULT_ACCOUNTS, and every already-provisioned tenant needs those to get
// created too, not just brand-new tenants.
export async function ensureChart(client: Pick<PrismaService, 'ledgerAccount'>) {
  // A tenant may have added their own custom accounts (Chart of Accounts →
  // "+ Add account"), so "row count" can't be used to short-circuit this —
  // it wouldn't distinguish "all defaults present + some custom ones" from
  // "missing a default that shipped in a later release". `code` is unique
  // and skipDuplicates makes this a cheap no-op INSERT for the common case.
  await client.ledgerAccount.createMany({
    data: DEFAULT_ACCOUNTS.map((a) => ({ ...a, isSystem: a.isSystem ?? false })),
    skipDuplicates: true,
  });
}

// App version + human changelog (shown under Settings → About & Changelog).
export const APP_VERSION = '2.2.0';

// The desktop till shell (apps/desktop) versions independently of the web
// platform above — bump this whenever apps/desktop/package.json's version
// changes, so the Settings → Desktop Application download links (which
// build their filename from this constant) always point at the build that
// was actually uploaded, instead of a stale hardcoded filename drifting out
// of sync with what's really on the server.
export const DESKTOP_APP_VERSION = '0.2.1';

export const CHANGELOG: { version: string; date: string; changes: string[] }[] = [
  {
    version: '2.2.0', date: '2026-08-10',
    changes: [
      'Fixed the attendance fingerprint sync — punch direction (in/out/break/overtime) and verify method (fingerprint/card/password/face) are now captured and shown per punch instead of being discarded; the Attendance page shows how many times each employee punched and at what time, with a per-employee drill-down',
      'The device\'s own user-enrollment table (OPERLOG) now syncs too, so you can see what PIN/name/card the fingerprint device itself has on file for cross-checking against staff records',
      'New HRM section: Overview, Leave & Time-off (types, requests, approve/reject with computed balances), Shift Scheduling (templates + a weekly roster grid with scheduled-vs-actual comparison), Employee Documents (personal info + expiry-tracked documents like ID/contracts), and Performance & Discipline (notes, warnings, commendations)',
      'Payroll gains Bonus/Deduction/Advance adjustments that net into a real take-home pay figure, plus a printable payslip per employee',
      'New AI Sales Analysis page: predicts tomorrow\'s revenue, order count and top items from your own sales history (a transparent statistical model, not a black box) with a plain-language explanation of the estimate',
    ],
  },
  {
    version: '2.1.0', date: '2026-08-10',
    changes: [
      'KOT/BOT printing is now driven by a single shared format — the manual "Print KOT" button and the auto-print daemon that silently prints tickets fired from the Waiter Panel now always produce byte-identical tickets (same field order, same ticket-number format) instead of two implementations that could drift apart',
      'Fixed: printing settings (fonts, toggles, titles) could go stale for hours on a till left open across a shift — the POS, Waiter Panel and auto-print daemon now re-check saved templates every minute instead of only at launch',
      'Fixed: bills/KOTs that looked correct on screen could get clipped when printed from a browser (not the desktop app) — the print page size now matches the configured paper width instead of the browser\'s default page size',
      'New: adjustable print Margin (0–10mm) for both the Bill and KOT/BOT templates under Settings → Printing, with a live preview',
    ],
  },
  {
    version: '2.0.0', date: '2026-08-09',
    changes: [
      'Custom Roles & Permissions: replaced the fixed Admin/Manager/Cashier/Barista/Waiter roles with fully custom, admin-editable roles — create any role, grant exactly the permissions it needs, from a live catalog',
      'New Roles & Permissions page (Staff) — one protected "Owner" role always has full access as a break-glass account; every other role is yours to define',
      'Real general-ledger accounting: sales, purchase receipts, supplier payments, customer credit settlements and expenses now all post real, balanced double-entry journal entries automatically — the ledger, trial balance and chart of accounts are no longer just derived reports, they\'re backed by real postings',
      'New configurable Approval Workflows for accounting — require sign-off above a chosen amount for any transaction type before it posts to the books, with a Pending Approvals queue and full approve/reject audit trail; leave unconfigured and everything posts instantly as before',
      'Multi-Outlet support: a restaurant can now run more than one physical location under a single login — one shared staff list, customer base and set of books, with per-outlet reporting filters on the dashboard, Reports, Sales Report and Accounting',
      'Multi-Terminal support: named tills per outlet, now genuinely wired into sign-in, order attribution, the Kitchen Display (a kitchen only ever sees its own outlet\'s tickets) and cash-drawer sessions',
      'New Outlets & Terminals admin page — add locations, manage their tills, and optionally restrict which outlets a given employee can sign in to',
    ],
  },
  {
    version: '1.9.0', date: '2026-07-28',
    changes: [
      'Global loading indicator: a top progress bar now shows automatically during saves, prints, and page loads across the whole app',
      'Bold, larger KOT/BOT/Bill printing with clearer sections — KOT/BOT now show KOT No, Date, Time, Order Type, Table No, Guest Count and Order Taken By; bills add Bill No, Rate column, Net Amount Before Tax, Cashier name, and Payment Mode/Txn ID',
      'Fixed low-contrast checkboxes in dark mode',
      'New Discounts & Complimentary report (Sales Reports) — total discount %, who authorized each discount/comp, by-authorizer rollup',
      'New Stock Variance report (Inventory) — ideal recipe-based consumption vs. physical stock-take counts, the leakage/theft signal',
      'New Vendor Payment Ledger (Purchasing) — received value vs. paid vs. due per supplier, with a payment history log',
    ],
  },
  {
    version: '1.8.0', date: '2026-07-18',
    changes: [
      'Fully standalone platform: the control plane now holds only platform data — CakeZake itself became tenant "cakezake" with its own isolated database',
      'Platform Console is now a separate, standalone admin panel (own login, own layout) reachable only on the main s3vya domain',
      'Platform admins can remotely manage each restaurant\'s settings and toggle features/modules (KDS, reservations, CRM, inventory, purchasing, finance) without touching their DB directly',
      'Per-tenant connection pooling so many restaurant databases can share the server safely',
    ],
  },
  {
    version: '1.7.0', date: '2026-07-17',
    changes: [
      'SaaS platform: every restaurant gets its own fully isolated database',
      'Platform Console — provision restaurants, plans (Starter/Pro/Enterprise), suspend/activate',
      'Subscription payments by cash or direct bank transfer with references; validity extends automatically',
      'Restaurant code on sign-in (or subdomain) routes each till to its own restaurant',
      'Nepali fiscal-year management: exact Shrawan 1 → Ashadh-end windows, per-FY invoice numbers on Tax Invoices and IRD sync',
    ],
  },
  {
    version: '1.6.0', date: '2026-07-17',
    changes: [
      'Custom items now choose Kitchen/Bar/Billing — KOTs print for custom dishes',
      'Cancel & transfer support partial quantities; both need manager approval',
      'Fixed: cancelling one item no longer drops unsaved lines from the basket',
      'Void basket requires admin/manager sign-in with an audited reason',
      'New billing flow: Estimated Bill before payment; Tax Invoice + Invoice after',
      'All browser prompts replaced with proper dialogs (desktop-app friendly)',
      'Empty tables no longer show as occupied; re-opening reuses the empty order',
      'New-order sound on POS & Kitchen Display; live refresh every 5s',
      'Waiters can capture customer details on any order',
      'Membership numbers (e.g. RADH1), business PAN + IRD lookup, auto loyalty discount up to Rs 500',
      'Softer, eye-comfortable dark theme',
    ],
  },
  { version: '1.5.0', date: '2026-07-14', changes: ['Filterable Sales Reports (Detailed/KOT/BOT) with CSV & PDF export', 'Dynamic currency symbol + default guest count', 'Keyboard-focus & reduced-motion accessibility pass'] },
  { version: '1.4.0', date: '2026-07-13', changes: ['ZKTeco fingerprint attendance + payroll; desktop till LAN bridge', 'Settings → Desktop Application download page', 'CSV template with portions for menu import/export', 'Hierarchical sidebar with SVG icons'] },
  { version: '1.3.0', date: '2026-07-11', changes: ['Full accounting: journals, chart of accounts, ledger, trial balance', 'Day/Sales/Cash/Bank books, Balance Sheet, MIS & IRD reports', 'Silent printing on desktop; VAT-inclusive pricing; editable categories'] },
  { version: '1.2.0', date: '2026-07-10', changes: ['Role-locked access; PIN retired for manager username/password approvals', 'Table seating timers; BS dates everywhere; Tally XML; IRD CBMS sync'] },
  { version: '1.1.0', date: '2026-07-09', changes: ['Deployed to s3vya.tech; credit-facility ledger; auto-print waiter KOTs', 'Printer settings + bill/KOT template designer; PWA waiter app'] },
  { version: '1.0.0', date: '2026-07-07', changes: ['Initial platform: POS, KDS, waiter panel, inventory, purchasing, CRM, reports'] },
];

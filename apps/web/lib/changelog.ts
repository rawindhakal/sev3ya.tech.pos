// App version + human changelog (shown under Settings → About & Changelog).
export const APP_VERSION = '1.8.0';

export const CHANGELOG: { version: string; date: string; changes: string[] }[] = [
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

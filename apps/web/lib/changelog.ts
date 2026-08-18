// App version + human changelog (shown under Settings → About & Changelog).
export const APP_VERSION = '2.8.2';

// The desktop till shell (apps/desktop) versions independently of the web
// platform above — bump this whenever apps/desktop/package.json's version
// changes, so the Settings → Desktop Application download links (which
// build their filename from this constant) always point at the build that
// was actually uploaded, instead of a stale hardcoded filename drifting out
// of sync with what's really on the server.
export const DESKTOP_APP_VERSION = '0.2.1';

export const CHANGELOG: { version: string; date: string; changes: string[] }[] = [
  {
    version: '2.8.2', date: '2026-08-18',
    changes: [
      'Reverted the v2.8.0 print-width change — it fixed clipped edges on some printers but caused completely blank prints on at least one real printer. Back to the previous (imperfect but working) sizing approach while a safer fix is investigated.',
    ],
  },
  {
    version: '2.8.1', date: '2026-08-18',
    changes: [
      'QR table self-orders now print straight to the kitchen/bar automatically, without waiting for a staff member to acknowledge them at the POS first',
      'Fixed the POS table-selection screen not showing a table as occupied after a guest placed a self-order until the cashier left and re-entered the screen — it now updates live',
    ],
  },
  {
    version: '2.8.0', date: '2026-08-18',
    changes: [
      'Fixed printed bills and KOTs being cut off on both edges on some thermal printers — the printed page is now sized to exactly the intended content width instead of a wider page with the content centered inside it',
      'Bill and KOT item tables now list Item before Qty (previously Qty first)',
      'New optional bill fields: Pan No, a numeric Table No (in addition to table name), Transaction Date / Invoice Issue Date, Total, and Taxable AMT — all off by default, enable them under Settings → Printing to match a specific invoice format',
      'New optional KOT fields: Table Area, Table No, UserName, and Service Provider',
      'New "Payment mode beside totals" layout option for the bill, placing the Mode of Payment box next to the totals instead of below them',
      'Tables can now have an optional numeric Table No (Settings → Tables & Areas), separate from the table name',
    ],
  },
  {
    version: '2.7.0', date: '2026-08-16',
    changes: [
      'Module toggles in Settings (Reservations, Inventory, Purchasing, Customers, Finance, KDS, and the new Marketing and HRM groups) now actually block page and API access when switched off, instead of only hiding the sidebar entry',
      'Fixed a bug where a failed sign-in attempt (wrong restaurant code, wrong password) could leave the wrong restaurant "remembered" for the next sign-in attempt on that device',
      'Fixed the Accounting Balance Sheet understating/misreporting Accounts Payable — partially-received purchase orders now count, using what was actually received rather than what was ordered, and payments already made to suppliers are now subtracted',
      'Security: added rate limiting to defend against automated password-guessing, on top of the existing per-account lockout',
      'Daily automated database backups now run on the server, in addition to the backups already taken before every deployment',
    ],
  },
  {
    version: '2.6.0', date: '2026-08-13',
    changes: [
      'New Settings → Printing options: HS Code column on the item table (per-item, editable in Menu), "Amount in Words" line under Grand Total, Received Amount / Change lines for cash overpayment, Cashier/Customer signature lines, a boxed Payment Mode section, a plain-numbers currency style, and a one-line-per-row order-info layout',
      'New customizable order-info lines: Area, Fiscal Year, and Service Provider (till name) — plus the Nepali date line is now reorderable/relabelable like every other line instead of being fixed',
      'HS Code is snapshotted onto each order item at the time of sale, so a reprinted bill always shows the code that applied then, even if the menu item\'s code changes later',
    ],
  },
  {
    version: '2.5.2', date: '2026-08-13',
    changes: [
      'Fixed Dashboard charts showing the wrong hour/day for orders paid overnight — hourly and day-of-week bucketing was computed in server (UTC) time instead of Nepal time, shifting an order paid at 12:30 AM onto the previous day\'s 6 PM slot',
    ],
  },
  {
    version: '2.5.1', date: '2026-08-13',
    changes: [
      'Settings → Printing: choose a font for the bill and KOT/BOT tickets (monospace, Arial, system sans-serif, Verdana, Tahoma, Georgia, Courier New)',
      'Every line on the bill\'s order-info block (Time/Table/Guest Count/Cashier/Waiter/Customer) and totals block (Sub Total/Discount/Service Charge/VAT) can now be individually shown, hidden, renamed, and reordered — same for the KOT/BOT order-info block',
    ],
  },
  {
    version: '2.5.0', date: '2026-08-12',
    changes: [
      'Kitchen (KOT) and bar (BOT) tickets now get their own dedicated numbering — a daily-resetting KOT # and BOT #, separate from both the order number and the real invoice number',
      'Real invoice numbers (INV-#) are shown on the Sales Report\'s Detailed/KOT/BOT presets, linked to each ticket — invoice numbers are only ever assigned once a bill is actually paid',
      'Cancelled items no longer show an invoice number in the Cancelled Items report, since a cancelled order was never invoiced',
      'Dashboard rebuilt with 14 new charts: hourly sales, top 5 items, payment breakdown, order source, sales by server, labor vs. sales, menu engineering, discounts & voids, average ticket time, sales by category, a day-by-hour heatmap, table turnaround, new vs. returning guests, and payment methods over time',
      'New Settings → Preferences field for the kitchen\'s target ticket time, shown as a reference line on the new Average Ticket Time chart',
    ],
  },
  {
    version: '2.4.1', date: '2026-08-12',
    changes: [
      'Dashboard "Recent Orders" no longer shows cancelled orders that never had any value (an empty table opened and voided by mistake) — a cancelled order that did have items rung up before being voided still shows',
      'The 👁 "view bill" action is now exclusive to the Detailed Sales Report — it no longer appears on KOT/BOT/Cancelled Items or other report presets',
      'Detailed Sales Report now shows one row per bill instead of one row per item — click a row to expand and see its itemized line items',
    ],
  },
  {
    version: '2.4.0', date: '2026-08-11',
    changes: [
      'New Settings → Tables & Areas page — add, edit, and actually delete tables (the old POS "Manage" mode could only toggle status/VIP, not rename or remove a table)',
      'Areas can now be renamed (relabels every table in it at once) or removed (its tables become "Unassigned", never deleted) — with a live table count per area',
      'Deleting a table is now safe: a table with order/reservation history is hidden instead of destroyed (restorable), a table mid-order is blocked with a clear message, and only a genuinely unused table is actually removed',
    ],
  },
  {
    version: '2.3.0', date: '2026-08-11',
    changes: [
      'Fixed: orders taken on the Waiter Panel now correctly attribute the actual waiter — "Order Taken By" on printed KOTs/BOTs/bills was silently blank for every order a waiter placed themselves',
      'Table QR ordering redesigned: a proper printable, downloadable branded card (generated on-device, no third-party service) instead of a bare QR image with a broken whole-page print',
      'Guest self-orders (scan-to-order) no longer silently auto-print to the kitchen — they wait in a new "pending guest orders" queue on the POS screen until a waiter or cashier acknowledges them, which then prompts to print the KOT/BOT',
      'New per-item and per-category printer routing — e.g. route one dish to a second kitchen printer, or a specific drink to a particular bar printer, instead of every kitchen/bar ticket going to the same one printer',
      'Renamed "Send to kitchen" to "Send Order" on the guest ordering page',
    ],
  },
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

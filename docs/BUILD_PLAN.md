# CakeZake POS — Phased Build Plan

Mapping the 200-feature requirements matrix (`REQUIREMENTS.md`) to incremental,
shippable phases. We build **module by module, must-have first**, keeping a
working app at every step.

Currency: **NPR (Rs)** · VAT: **13%** · Payment tenders: **Offline, Cash,
FonePay, Bank, eSewa, Khalti, Card, Credit**.

---

## ✅ Done so far (foundation + core)
- Monorepo (NestJS + Prisma + PostgreSQL + Next.js), menu/items, modifiers
- POS ordering flow: order-type popup, dine-in table view, item search,
  modifier picker, live bill, KOT/Bill/Pay actions, receipt printing
- Orders/KOT board, Tables floor page
- Analytics dashboard (today KPIs, monthly sales chart, payments by method,
  top items/tables, avg guest time, turnaround, waiter overview)
- **NPR currency + 8 Nepal payment tenders**
- **Order-level discounts** in POS (matrix #8)

## 🔜 Phase 1 — Complete POS & Billing depth (matrix #1–25)
High value, extends what exists. Backend already supports multi-tender + discount.
- [x] Multi-payment settlement UI — split one bill across tenders (#5)
- [x] Hold & resume tickets / parked carts (#4)
- [x] Refund & void auditing with mandatory remarks (#10)
- [x] Open-item billing (custom name/price) (#16)
- [x] Price tiers by order type — dine-in/takeaway/delivery (#15)
- [ ] Split bill by seat / item / equal parts (#3)
- [ ] Cash drawer open/close + petty cash log (#17)
- [ ] Editable receipt header/footer branding + tax IDs (#11)
- [ ] Dynamic tax/service-charge configurator UI (#7)
- [ ] Token generation, combo autosuggest, e-receipt via SMS/WhatsApp (#9, #22, #23)

## Phase 2 — Table & Floor Management (matrix #26–40, all must-have)
- Visual drag-drop floor plan, table status timers, merge/join, transfer,
  seat-wise orders, reservations & waitlist, QR ordering per table, VIP tags.

## Phase 3 — Kitchen Display System / KDS (matrix #41–55, all must-have)
- Live KDS screen (websockets), color prep timers, multi-station routing,
  item aggregation, bump bar, recipe popups, KDS↔POS two-way sync.

## Phase 4 — Inventory & Recipe Management (matrix #56–80, all must-have)
- Recipe/BOM, ingredient stock depletion on sale, low-stock alerts,
  wastage, stock takes, unit conversions, variance reports.

## Phase 5 — People & Operations (must-have)
- Employee & Shift Management (#111–125): auth, roles, clock-in/out, rosters
- Purchasing & Supplier Management (#126–140): POs, GRN, supplier ledgers
- Admin, Multi-Store & Security (#156–170): RBAC, multi-branch, audit logs
  > Note: authentication/roles here also unlock manager-approval features in
  > Phase 1 (discount/refund approval).

## Phase 6 — Advanced Analytics & Reporting Engine (matrix #171–200, must-have)
- Configurable report builder, exports (PDF/Excel), forecasting, X/Z reports,
  cost/margin analysis, sales heatmaps.

## Extras (lower priority — matrix flags these "Extra Feature")
- Specialty Coffee & Roastery add-on (#81–95)
- CRM, Loyalty & Marketing (#96–110)
- Financial Accounting & Expense Management (#141–155)

---

### Suggested next step
**Phase 1 continued** (multi-payment settlement + refund/void audit) — it
completes the billing surface the user just configured. Alternatively jump to
**Phase 3 (KDS)** if kitchen operations are the priority.

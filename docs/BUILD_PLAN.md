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
- [x] Cash drawer open/close + petty cash log (#17)
- [x] Editable receipt header/footer branding + tax IDs (#11)
- [x] Dynamic tax/service-charge configurator UI (#7)
- [~] Split bill — equal parts done; by-seat / by-item still to do (#3)
- [ ] Token generation, combo autosuggest, e-receipt via SMS/WhatsApp (#9, #22, #23)
- [ ] Hardware-tied: barcode scanner, customer display, weighted scale, pre-auth

## 🔜 Phase 2 — Table & Floor Management (matrix #26–40, all must-have)
- [x] Table status timers — color-coded seated time (#27)
- [x] Table transfer engine — move order to another table (#31)
- [x] Table merging & joining (#28)
- [x] Max occupancy constraints (#36)
- [x] VIP table highlighting (#39)
- [x] Reservation & waitlist management (#30)
- [x] Visual drag-drop floor plan layout (#26)
- [ ] QR code digital ordering per table (#37)
- [ ] Seat-wise order tracking (#29)
- [ ] Section allocation for servers (#32)
- [ ] Vacant/dirty alerts (#35), booking deposit (#33), pre-order (#34),
      table sharing (#38), server-call (#40)

## 🔜 Phase 3 — Kitchen Display System / KDS (matrix #41–55, all must-have)
- [x] Live KDS screen with color-coded prep timers (charcoal→amber@3m→crimson@5m) (#41)
- [x] Order-ready per-item taps + bump to clear tickets (#44)
- [x] KDS↔POS status sync — item ready advances order to READY (#50)
- [x] Ingredient/out-of-stock flag endpoint from kitchen (#51)
- [x] Token display: Processing / Ready split (spec §4.2)
- [ ] Multi-station routing (espresso/bakery/kitchen) (#42)
- [ ] Item aggregation view (#43), recipe pop-up (#45), priority sort (#46)
- [ ] Historical bump recall (#47), performance metrics (#48), sound alerts (#49)
- [ ] Course splitting (#53), expo screen (#54), smart batching (#55)

## 🔜 Phase 4 — Inventory & Recipe Management (matrix #56–80, all must-have)
- [x] Real-time ingredient stock tracking, auto-deduct on sale (#56)
- [x] Recipe mapping / BOM per menu item (#57)
- [x] Low-stock auto-alert thresholds (#58)
- [x] Physical stock-take with variance logging (#59)
- [x] Wastage & spillage tracker (#60)
- [x] Stock valuation (#75)
- [ ] PO workflow (#61), GRN (#62), FIFO/avg costing (#63)
- [ ] Reorder engine (#70), theoretical vs actual (#71), menu engineering (#72)
- [ ] UOM converter (#74), lot/expiry (#69), allergens (#77), add-on deduct (#78),
      recipe costing simulator (#79), purchase returns (#80), etc.

## 🔜 Phase 5 — People & Operations (must-have)
Employee & Shift Management (#126–140):
- [x] PIN time clocking — clock in/out + active shifts (#126)
- [x] Role-based permission matrix — roles + granular perms (#129)
- [x] PIN login gate on the POS terminal (spec §2.1); void/discount gated by permission
- [ ] Shift scheduler (#127), tip pooling (#128), break tracking (#132),
      performance leaderboard (#133), task checklists (#135), labor-cost widget (#139)
Purchasing & Supplier Management (#141–155):
- [x] Centralized vendor directory (#141)
- [x] Purchase-order workflow (draft → ordered → received)
- [x] GRN / split-delivery receiving that adds stock (#146)
- [x] Auto-generate PO from stock deficits (#150)
- [x] Supplier catalog mapping — ingredient → primary supplier (#67)
- [ ] MOQ warnings (#144), lead-time (#145), RMA returns (#147), pricing history
      (#148), scorecarding (#151), payment-term alerts (#153), purchase ledger audit (#155)
Admin, Multi-Store & Security (#156–170):
- [x] Signed staff tokens (HMAC) issued on PIN login
- [x] Backend permission ENFORCEMENT — void/refund require canVoid (guards)
- [x] Immutable audit log of VOID / REFUND / LOGIN + protected /audit viewer
- [x] Back-office manager-PIN prompt to authorise sensitive actions
- [ ] Full route protection on all endpoints, multi-branch, config hardening

## 🔜 Phase 6 — Advanced Analytics & Reporting Engine (matrix #186–200)
- [x] End-of-day / Z-report summary — gross, tax, discounts, avg ticket (#186)
- [x] Hourly sales distribution bar chart (#187)
- [x] Menu performance BCG matrix — margin from recipe cost (#188)
- [x] Payment channel disaggregation (#192)
- [x] Online/delivery vs dine-in split (#197)
- [x] Table turnover velocity (#196)
- [x] Waste & spillage cost impact (#198), stock-take variance value (#190)
- [x] Void & cancellation audit list; date-range picker + print
- [ ] LTV (#189), labor-cost coverage (#191), upsell metrics (#194),
      multi-branch comparison (#195), reorder forecasting (#199),
      scheduled PDF dispatch (#200)

## Extras (matrix flags these "Extra Feature")
CRM, Loyalty & Marketing (#111–125):
- [x] Points-based loyalty engine — auto-award on sale (#111)
- [x] Tiered membership Silver/Gold/Platinum by spend (#112)
- [x] RFM segmentation — At Risk / Loyal / High Spender / New (#115)
- [x] Behavior history + first-time tag via phone lookup in POS (#123, #124)
- [x] GDPR one-click delete (#125)
- [ ] Gift cards/wallet (#113), birthday campaigns (#114), punch-card (#116),
      SMS broadcast (#117), referrals (#118), surveys (#119)

Financial Accounting & Expense Management (#156–170):
- [x] Daily P&L ledger — gross − VAT − COGS − expenses = net profit (#156)
- [x] Granular expense categorization ledger (#157)
- [x] Tax filing summary — VAT/service charge collected (#162)
- [x] Accounts-payable aging from open POs (#164)
- [x] Break-even volume/revenue calculator (#165)
- [ ] Double-entry COA (#158), bank reconciliation (#159), depreciation (#160),
      multi-currency (#161), AR B2B ledger (#166), amortization (#168), budgets (#169)

Specialty Coffee & Roastery (#81–95):
- [x] Green-bean batch tracking — origin/estate/process/moisture/aging (#81, #86)
- [x] Roast profile log — charge/drop temp, dev time, Agtron (#82, #93)
- [x] Green→roasted shrinkage auto-calc; output feeds Coffee Beans stock (#83, #87)
- [x] SCA cupping score cards — aroma/flavor/acidity/body/balance (#84)
- [ ] Roaster hardware sync (#82), production scheduling (#85), wholesale portal
      (#88), grinder dial-in (#89), water chemistry (#90), blend components (#94)

---

### Suggested next step
**Phase 1 continued** (multi-payment settlement + refund/void audit) — it
completes the billing surface the user just configured. Alternatively jump to
**Phase 3 (KDS)** if kitchen operations are the priority.

# Session Log — 2026-07-29: Dashboard/POS UI-UX overhaul + VAT breakdown fixes

Purpose of this file: a self-contained record of one working session so that
future-me (or anyone else) can open this file, understand what changed, why,
and where, without re-reading the full chat transcript.

## Trigger

User report: "Dashboard is not functioning, fix it. Use the
`ui-ux-pro-max` skill, transform the UI/UX completely, dark theme looks bad,
make the POS page suitable for touch-screen devices." Followed later by a
separate, explicit ask: "fix the vat breakdown on the waiter panel also."

## 1. Dashboard "not functioning" — investigated, turned out to be a false alarm

Checked before touching any code:
- `curl` against the local API dashboard endpoints directly.
- Production PM2 error logs on the VPS.
- Direct Postgres query to confirm "0 orders today" was numerically correct.
- Production and local browser checks.

Conclusion: the dashboard was functionally correct. The complaint was about
visual/UX quality, not a functional bug — so the work became a redesign, not
a bug hunt. (General lesson: don't assume "not working" means broken; verify
with curl/DB/logs before changing code.)

## 2. Real bugs found and fixed

### 2a. Dark-mode chart was unreadable
`apps/web/components/LineChart.tsx` had hardcoded hex colors on raw SVG
`stroke`/`fill` attributes (`#e2e8f0`, `#cbd5e1`, `#0f172a`, etc). Tailwind's
`dark:` variant **cannot** target SVG attribute values directly, so the
gridlines/axis text were nearly invisible in dark mode.

Fix: introduced CSS custom properties in `apps/web/app/globals.css`:
```css
:root {
  --chart-grid: #eef1f5;
  --chart-axis: #94a3b8;
  --chart-tooltip-bg: #0f172a;
  --chart-tooltip-text: #ffffff;
  --chart-tooltip-sub: #cbd5e1;
}
.dark {
  --chart-grid: #263041;
  --chart-axis: #64748b;
  --chart-tooltip-bg: #f8fafc;
  --chart-tooltip-text: #0f172a;
  --chart-tooltip-sub: #475569;
}
```
Then referenced via `stroke="var(--chart-grid)"` etc. in the SVG. **This
pattern (CSS custom properties + `var()`) is the reusable fix for any future
SVG-based component that needs to be dark-mode aware** — Tailwind dark
classes don't work on SVG paint attributes.

### 2b. Touch targets too small on POS cart
`apps/web/app/pos/page.tsx` — quantity stepper buttons were `h-6 w-6` (24px),
violating the 44×44px CRITICAL minimum (WCAG / Apple HIG / Material Design).
Resized to `h-11 w-11` (44px), added `touch-manipulation` (kills the 300ms
tap delay) and `active:scale-90` press feedback. Same treatment applied to
order-mode buttons, Void Basket, Cancel, search input, +Custom/+Add Item,
category chips, menu grid cards, and header utility buttons (kept the header
as a deliberately "compact utility row" at 36–38px — documented inline in the
code as an intentional tradeoff, reserving strict 44px for high-frequency
primary actions).

### 2c. Emoji used as functional icons
Violates the skill's `no-emoji-icons` rule (icons should be SVG, themeable via
`currentColor`, consistent stroke width). Built a hand-rolled icon set instead
of adding a new npm dependency (lucide-react etc.) mid-session:

- **New file**: `apps/web/components/icons.tsx` — Heroicons-outline-style
  (24×24 viewBox, strokeWidth 1.75, round caps/joins, `currentColor`). Icons:
  `ReceiptIcon, BanknoteIcon, UsersIcon, CalendarIcon, ClockIcon,
  TurnaroundIcon, CheckCircleIcon, ChartBarIcon, TableIcon, ChefHatIcon,
  PlusIcon, SearchIcon, TrendUpIcon, TrendDownIcon, MinusIcon, CustomIcon,
  UtensilsIcon, BagIcon, BikeIcon, BoltIcon, SettingsIcon, XIcon, LockIcon,
  BellIcon, MoonIcon, InboxIcon`.
- Swapped emoji → these icons throughout `apps/web/app/page.tsx` (Dashboard)
  and `apps/web/app/pos/page.tsx` (POS terminal): KPI card icons, order-mode
  icons (dine-in/takeaway/delivery/quick), header icons (dark-mode/lock/
  bell/settings), search/plus affordances, empty states.
- **Left untouched on purpose**: a few decorative brand-mascot cake emoji
  (loading/empty screens) — those are branding, not functional icons, so the
  `no-emoji-icons` rule doesn't apply.
- **Known remaining gap, not yet fixed**: `apps/web/components/ThemeToggleMini.tsx`
  still uses ☀️/🌙 emoji for its own toggle label. Noted but intentionally
  not touched this session (wasn't part of the explicit ask, avoided scope
  creep). Fix later if doing another icon-consistency pass.

### 2d. Dashboard full redesign
`apps/web/app/page.tsx` was rewritten (not just patched): icon+colored-badge
KPI cards (`TONES` mapping for brand/emerald/indigo/amber), proper loading
state (`Spinner`), proper error state (`InboxIcon` + retry, extracted a
reusable `load()` function), icon-treated empty states everywhere (chart,
payments, top items/tables/waiters, recent orders), responsive padding
(`p-4 sm:p-8`), `min-h-[44px]` on the primary "+ New Order" CTA. Verified via
typecheck, build, and direct browser check (dark mode, populated + empty
states).

### 2e. Back-office dark theme polish
`apps/web/app/globals.css` — refined the existing `.dark .bg-white` /
`.dark .text-slate-*` `!important`-override system (used by non-POS admin
pages) for better elevation/contrast: darker body background (`#0B1220`),
card background/border (`#161f30`/`#26324a`) with `box-shadow: none` on cards
in dark mode, refined slate-50/100, text-900→400 mappings, border colors,
input and `.btn-ghost` colors + hover state.

Note: the POS terminal itself already had its own working `--pos-*` token
system (`--pos-bg`, `--pos-card`, `--pos-surface`, `--pos-text-*`) defined in
`:root`/`.dark` in `globals.css` — confirmed via direct DOM inspection
(`getComputedStyle`) to be correct; it was *not* broken, just needed the
touch/icon polish described above. (One apparent "half-applied theme" bug
turned out to be a stale browser-automation screenshot artifact, not a real
bug — confirmed by querying `getComputedStyle`/CSS vars directly on the DOM
rather than trusting the screenshot.)

## 3. VAT breakdown bug — same bug class, fixed in 3 places this session

### The canonical formula (mirrors backend `computeTotals` in
`apps/api/src/common/settings.ts`)

Given `Settings.vatRate`, `Settings.serviceChargeRate`,
`Settings.pricesIncludeVat`:

```
chargeableBase = subtotal + serviceCharge   // serviceCharge = round(subtotal * serviceChargeRate)

if pricesIncludeVat:
    total = chargeableBase                       // no additive tax — price already includes it
    tax   = round(total * vatRate / (1 + vatRate)) // back-calculated
else:
    tax   = round(chargeableBase * vatRate)        // added on top
    total = chargeableBase + tax

netBeforeTax = total - tax   // universally correct pre-VAT net figure in BOTH modes
```

This exact shape now lives in three places, deliberately kept consistent:
- `apps/api/src/common/settings.ts` — `computeTotals` (server, source of
  truth).
- `apps/web/components/Receipt.tsx` — printed receipt (fixed earlier this
  session, not detailed here since it predates this log).
- `apps/web/app/pos/page.tsx` — POS terminal cart footer (fixed earlier this
  session).
- `apps/web/app/waiter/page.tsx` — Waiter Panel (fixed in this session, see
  below).

### Waiter Panel bug (`apps/web/app/waiter/page.tsx`) — worst of the three

Before the fix, this page:
- Never fetched `/settings` **at all**.
- Hardcoded `const vatRate = 0.13;`.
- Always computed `total = sub + Math.round(sub * vatRate)` — i.e. always
  "additive", even for restaurants configured with `pricesIncludeVat: true`.
- Had zero service-charge handling.

Fix applied:
1. Added `Settings` to the type import and a `settings` state var, fetched
   inside the existing mount `useEffect` (`api.get<Settings>('/settings')`).
2. Replaced the `totals` `useMemo` to read `vatRate` / `serviceChargeRate` /
   `pricesIncludeVat` from `settings` (falling back to `0.13` / `0` / `false`
   only if settings hasn't loaded yet) and compute
   `{ sub, count, serviceCharge, tax, total, netBeforeTax }` using the
   canonical formula above.
3. Updated the **cart modal** total line to also show the VAT amount inline:
   `Total (incl. VAT)` + a small "of which VAT (13%): Rs 17.26"-style line.
4. Updated the **read-only BILL modal** (previously had a hardcoded
   `VAT 13%` label and recomputed tax wrong — `Math.round(totals.sub *
   vatRate)`, ignoring service charge and `pricesIncludeVat` entirely) to
   show, in order: Subtotal → Service charge (only if > 0) → Net amount
   before tax (only if `pricesIncludeVat`) → VAT (dynamic %) → TOTAL.

Verified end-to-end in the browser against a live Takeaway order with
`pricesIncludeVat: true`, Rs 150 item:
- Cart modal: `Total (incl. VAT) Rs 150.00` / `of which VAT (13%): Rs 17.26`.
- Bill modal: `Subtotal Rs 150.00` / `Net amount before tax Rs 132.74` /
  `VAT (13%) Rs 17.26` / `TOTAL Rs 150.00`.
- `132.74 + 17.26 = 150.00` ✓, `150 × 0.13 / 1.13 = 17.26` ✓ — matches the
  formula exactly.
- `pnpm exec tsc --noEmit` clean, `pnpm build` clean.

## 4. Design guidance reused this session (from the `ui-ux-pro-max` skill)

Priority order applied, highest first:
1. **Accessibility (CRITICAL)** — contrast, focus states (not deeply audited
   this session beyond existing state).
2. **Touch & Interaction (CRITICAL)** — 44×44px min targets, 8px+ spacing,
   `touch-manipulation`, press feedback (`active:scale-*`). This was the
   main driver for the POS page changes.
3. **Style Selection (HIGH)** — no emoji as functional icons; SVG icon set
   instead; consistent stroke width/size across the app.
4. **Typography & Color / dark-mode-pairing** — CSS custom properties for
   anything SVG-based, since Tailwind `dark:` can't reach SVG paint
   attributes.

Deliberately **not** followed: the skill's generic suggested color palettes.
Kept the existing brand palette (pink/rose `brand-*`, POS emerald `#2ECC71`)
since the ask was "improve execution quality," not "rebrand."

## 5. Standing rules still in force (unrelated to this session's edits, but relevant if continuing)

- Never deploy/push to production without an explicit "push to live"
  instruction from the user. Nothing in this session was deployed — all
  changes are local/uncommitted as of this log.
- Never rotate the VPS SSH credential or any live credential unilaterally.
- Production lives at `s3vya.tech` (VPS `147.93.19.1`), shared multi-tenant
  box — don't wipe it. Tenants: `cakezake`, `naivedya`.
- There is a separate, larger **pending plan** (not started this session) at
  `/Users/rabindhakal/.claude/plans/soft-prancing-cook.md` for migrating
  CakeZake to a proper multi-tenant SaaS with a standalone Platform Admin
  panel and wildcard `*.s3vya.tech` DNS — unrelated to the UI/UX + VAT work
  in this log, don't conflate the two.

## 6. Outstanding / not done this session

- `ThemeToggleMini.tsx` emoji icons (☀️🌙) — noted, not fixed (see 2c).
- Nothing from this session has been committed to git or deployed — all
  changes are local edits in the working tree as of the end of this session.
- The "transform the UI/UX completely" ask was addressed for Dashboard + POS
  (+ Waiter Panel VAT correctness); other back-office pages (menu, orders,
  settings, reports, etc.) were **not** part of this redesign pass and still
  use the older `.dark` `!important`-override system as-is.

## 7. Files touched this session (for quick diffing)

- `apps/web/components/icons.tsx` — new file, SVG icon set.
- `apps/web/app/globals.css` — `--chart-*` tokens, dark-theme color
  refinements.
- `apps/web/components/LineChart.tsx` — dark-mode-safe SVG colors, empty
  state icon.
- `apps/web/app/page.tsx` — full Dashboard rewrite.
- `apps/web/app/pos/page.tsx` — touch targets + icon swap + header cleanup.
- `apps/web/app/waiter/page.tsx` — VAT/settings fetch fix, bill breakdown UI.

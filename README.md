# 🍰 CakeZake POS

A full-stack, multi-terminal **restaurant / café Point-of-Sale platform** —
front-of-house billing, kitchen display, inventory, purchasing, CRM, finance,
roastery, and a back-office admin — built as a pnpm monorepo.

> Currency **NPR (Rs)** · VAT & service charge configurable · all money stored
> as integer paisa.

## Apps

| Path           | What it is                                                    |
| -------------- | ------------------------------------------------------------- |
| `apps/api`     | **NestJS 10 + Prisma 5 + PostgreSQL** — the backend & business logic |
| `apps/web`     | **Next.js 14** (App Router + Tailwind) — POS terminal, KDS, waiter panel & back-office |
| `apps/desktop` | **Electron** shell that runs the POS billing terminal natively (cashier till) |

## Feature modules

- **POS terminal** — Dine-In / Takeaway / Home-Delivery / Quick-Bill; inline
  table floor (transfer, merge, move items, VIP, timers); item variants/portions,
  modifiers & per-item notes; %/Rs & item-wise discounts (manager-approved);
  split-tender payment, loyalty redemption, customer credit; KOT/BOT station
  routing with **incremental** firing; item cancellation tickets; receipt printing.
- **Kitchen Display (KDS)** — live color-coded prep timers, bump, tokens.
- **Waiter panel** — handheld order-taking; bills settle only at the main POS.
- **Menu & modifiers**, **Inventory & recipes** (auto stock deduction on sale,
  stock-take, wastage, valuation), **Purchasing** (suppliers, PO → GRN, auto-PO).
- **Employees & roles** (PIN clocking, permission matrix), **security**
  (signed tokens, enforced void/refund, audit log).
- **CRM & loyalty** (tiers, RFM, points, credit), **Finance** (P&L, expenses,
  tax, AP aging, break-even), **Roastery** (green beans, roast shrinkage, cupping).
- **Reports** (Z-report, hourly, menu-engineering BCG, payment/type splits).
- **Multi-terminal**: each till has its own identity, cash drawer and
  **session-based business day** (open at first login → count-out Z-report at day-end).
- **Admin control panel**: enable/disable modules, edit preferences, dark/light theme.

## Prerequisites

- Node ≥ 20, **pnpm ≥ 9**, and **PostgreSQL** running locally.

## Setup

```bash
pnpm install                       # installs api + web (approves prisma builds)
createdb cakezake_pos              # create the database
cp apps/api/.env.example apps/api/.env    # set DATABASE_URL to your Postgres user
pnpm db:migrate                    # apply Prisma migrations
pnpm db:seed                       # sample menu, staff, ~30 days of orders, etc.
```

## Run

```bash
pnpm dev            # API (:4000/api) + web (:3000) together
# or individually:
pnpm dev:api
pnpm dev:web
```

- Back-office & terminals: **http://localhost:3000**
- POS terminal: **/pos** · Waiter: **/waiter** · Kitchen: **/kds**
- API health: **http://localhost:4000/api/health**

**Dev PINs** — Admin `1111` · Manager `2222` · Cashier `3333` · Barista `4444`.

## Desktop billing app

A native cashier till that loads the `/pos` terminal — see
[`apps/desktop/README.md`](apps/desktop/README.md).

```bash
pnpm --filter desktop install
POS_URL=http://localhost:3000 pnpm --filter desktop start   # KIOSK=1 for full-screen
```

## Useful scripts

| Command           | Description                       |
| ----------------- | --------------------------------- |
| `pnpm dev`        | Run API + web in parallel         |
| `pnpm build`      | Production build of both apps     |
| `pnpm db:migrate` | Apply Prisma migrations           |
| `pnpm db:seed`    | Seed sample data                  |
| `pnpm db:studio`  | Open Prisma Studio (DB GUI)       |

## Docs

- `docs/REQUIREMENTS.md` — the full 200-feature requirements matrix.
- `docs/BUILD_PLAN.md` — phased build plan and what's implemented.

## Access & permissions

The back-office requires a staff PIN sign-in; sections are gated by role
permissions (reports/finance → *view reports*; inventory/purchasing → *manage
inventory*; menu/staff/settings → *manage staff*). Sensitive actions (void,
refund, discount) are enforced server-side and audited.

---

Built with Next.js · NestJS · Prisma · PostgreSQL · Electron.

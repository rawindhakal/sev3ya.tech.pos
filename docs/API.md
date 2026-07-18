# s3vyaPOS API Documentation

REST API for s3vyaPOS (CakeZake POS) — a multi-tenant restaurant POS backend built with NestJS + Prisma + PostgreSQL.

- **Base URL (production):** `https://s3vya.tech/api` (or `https://<tenant>.s3vya.tech/api`)
- **Base URL (local dev):** `http://localhost:4000/api`
- **Global prefix:** every route below is relative to `/api` — e.g. "`GET /orders`" means `GET /api/orders`.
- **Health check:** `GET /health` — no auth, no tenant resolution needed. Runs `SELECT 1` against the current database as a real readiness probe, not just a static 200. Returns `{ status: "ok", service: "cakezake-pos-api", time }`.

---

## 1. Conventions

### Money
All monetary amounts are **integers in minor units** (paisa for NPR), named `*Cents` — e.g. `totalCents: 25425` is Rs 254.25. Never send/expect decimals.

### Validation
Every request body is validated with a global `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`:
- Unknown fields in the body are **rejected** (400), not silently dropped.
- Types are coerced (e.g. numeric query strings → numbers where a DTO declares `@IsInt()`).
- A failed validation returns `400 Bad Request` with a `message` array describing each violation.

### Errors
There is no custom exception filter — errors are plain default NestJS `HttpException` JSON:
```json
{ "statusCode": 400, "message": "Order is already paid", "error": "Bad Request" }
```
`message` can be a `string` (thrown manually, e.g. `BadRequestException('...')`) or a `string[]` (class-validator failures).

### CORS
Allowed origins: `CORS_ORIGINS` env var (comma-separated) plus any `https://<slug>.s3vya.tech` subdomain. `credentials: true`. Allowed headers: `Content-Type, Authorization, Idempotency-Key, X-Tenant`.

### Idempotency
The desktop/offline client can send an `Idempotency-Key` header on a queued write; the server stores the first response (`IdempotencyKey` table) and replays it verbatim on retry instead of re-executing — safe for network-drop retries (e.g. re-firing a KOT).

---

## 2. Multi-Tenancy

s3vyaPOS is a **database-per-tenant** SaaS. Every request is routed to either the **control-plane database** (platform admin data: plans, tenants, subscription payments) or one **tenant's own isolated database** (that restaurant's menu, orders, staff, everything else) — never both.

**How the tenant is resolved** (`platform/tenant.middleware.ts`), checked on every request in this order:
1. `X-Tenant: <slug>` header, if present.
2. Otherwise, the subdomain of the `Host` header — first label, if the host has ≥3 dot-separated parts and that label isn't reserved (`www`, `s3vya`, `localhost`, `api`, `app`).
3. Neither resolves → **control-plane context** (no tenant).

If a slug resolves: the tenant is looked up (60s in-memory cache), `404` if unknown. If the tenant's status is `SUSPENDED`, or its trial/subscription period has lapsed, every request gets `402 Payment Required` instead of being processed — including login.

A valid tenant sets an `AsyncLocalStorage` context for the rest of the request with that tenant's own `PrismaClient` (one pooled client per tenant DB, `connection_limit=3`, cached for the process lifetime). All services are written tenant-agnostically — they always just use "the current Prisma client," transparently proxied to the right database.

**Practical implication for API clients:** every route documented below (except `/platform/*` and `/public/*`) operates against whichever tenant the request resolves to. Send `X-Tenant: <slug>` explicitly (recommended for anything that isn't a browser on the tenant's own subdomain) or rely on subdomain resolution.

`/platform/*` routes are **control-plane only** — they self-check (`assertControlContext()`) and throw `403` if a tenant context is active, so a tenant's own admin can never reach them even with the right role. `/public/plans` is unauthenticated and tenant-agnostic (marketing site pricing).

---

## 3. Authentication

### Token format
A custom **HMAC-SHA256 signed token** (not JWT): `base64url(payload).base64url(hmac-sha256(payload))`, signed with the `AUTH_SECRET` env var. Sent as:

```
Authorization: Bearer <token>
```

**Payload** (`TokenPayload`):

| Field | Type | Notes |
|---|---|---|
| `sub` | string | Employee id |
| `name` | string | Employee display name |
| `role` | string | `ADMIN` \| `MANAGER` \| `CASHIER` \| `BARISTA` \| `WAITER` |
| `canVoid` | boolean | Permission flag |
| `canDiscount` | boolean | Permission flag |
| `canManageInventory` | boolean | Permission flag |
| `canViewReports` | boolean | Permission flag |
| `canManageStaff` | boolean | Permission flag |
| `exp` | number | Unix seconds expiry |

**TTL:** 12 hours (43200s) from issuance. Expired or tampered tokens fail verification (constant-time signature comparison).

### Logging in
```
POST /employees/login
Body: { "username": string, "password": string }
→ Employee object + { "token": "<signed token>" }
```
Store the token and send it on every subsequent request. There is no refresh endpoint — re-login when it expires (12h), which is why the desktop till has a "Remember me / auto sign-in" feature that re-authenticates with securely stored credentials rather than trying to refresh a token.

### Guards
Three guard types gate routes (`common/auth.guard.ts`):

| Guard | Behavior |
|---|---|
| `AuthGuard(permission?)` | Requires a valid token. `401` if missing/invalid. If a permission key is given (e.g. `'canVoid'`), also requires `payload[permission] === true`, else `403`. |
| `RoleGuard([roles])` | Requires a valid token whose `role` is in the given list. `401`/`403` as above. |
| `SoftAuthGuard` | Never rejects — attaches `req.employee` (the decoded payload) if a valid token was sent, otherwise `null`. Used where the **service layer** does its own conditional permission check (see below), because the required permission depends on request state (e.g. "only needs `canVoid` if the item was already sent to the kitchen"). |

`@CurrentEmployee()` is a param decorator that reads `req.employee`.

### The "one-off manager approval" pattern
Several actions (void, refund, cancel an already-fired item, mark a bill complimentary) are gated by a **specific manager/admin's own token**, not just "is someone logged in." The POS UI implements this as: cashier triggers the action → a modal asks a manager to sign in with *their own* username/password right there → that manager's token (not the cashier's session token) is used for that one API call only. Server-side, this is enforced either via `AuthGuard('canX')` directly on the route (the sent token itself must carry the permission) or, for `SoftAuthGuard` routes, via an explicit check in the service (`if (wasFired && !actor?.canVoid) throw ForbiddenException(...)`).

---

## 4. Orders

The core transactional module. An order moves through `OPEN → SENT_TO_KITCHEN → ... → BILLED → PAID` (or `CANCELLED` / `REFUNDED`).

### Order object shape
```ts
{
  id, number, type: 'DINE_IN'|'TAKEAWAY'|'DELIVERY', status,
  tableId, table: { id, name, area } | null,
  waiterId, waiter: { id, name } | null,
  guestCount, customerName, customerPhone, customerId,
  items: OrderItem[], payments: Payment[],
  subtotalCents, discountCents, discountLabel, isComplimentary,
  serviceChargeCents, taxCents, totalCents,
  notes, redeemedPoints,
  fiscalYear /* "2082/83" */, fiscalInvoiceNo,
  irdSyncedAt, irdSyncStatus, irdSyncMessage,
  terminalId, voidReason, refundReason, refundCents, refundedAt,
  seatedAt, kotFiredAt, billedAt, paidAt, createdAt, updatedAt
}
```
`OrderItem`: `{ id, orderId, menuItemId, nameSnapshot, unitPriceCents, quantity, modifiers: [{name,priceCents}], kotStatus, station, kotPrintedAt, discountCents, notes, cancelledAt, cancelReason, cancelledBy, createdAt, updatedAt }`.

### Endpoints

| Method | Path | Guard | Body | Description |
|---|---|---|---|---|
| GET | `/orders` | — | query `status?`, `today?` (`1`/`true`) | List orders, newest first |
| GET | `/orders/active` | — | — | Unsettled orders (`status` not in `PAID`/`CANCELLED`) — powers the POS "running orders" rail |
| GET | `/orders/kot-queue` | — | — | Fired-but-unprinted KOT/BOT items (polled by the desktop auto-printer) |
| POST | `/orders/kot-queue/printed` | — | `{ itemIds: string[] }` | Mark items as printed |
| GET | `/orders/:id` | — | — | Full order |
| POST | `/orders` | — | `CreateOrderDto` | Create a new order (optionally with initial `items`) |
| PUT | `/orders/:id/cart` | — | `SaveCartDto` | Reconcile the cart — add/update/remove lines, set discount. Reuses existing fired lines' KOT status; new lines start `PENDING` |
| PATCH | `/orders/:id` | — | `UpdateOrderDto` | Update waiter/guest count/notes/customer |
| POST | `/orders/:id/kot` | — | — | Fire all `PENDING` lines to the kitchen/bar (marks `SENT_TO_KITCHEN`) |
| POST | `/orders/:id/customer` | — | `AttachCustomerDto` | Attach/create a customer on the order |
| POST | `/orders/:id/items/:itemId/cancel` | `SoftAuthGuard` (+ service check) | `CancelItemDto` | Cancel a line (optionally partial quantity). **Requires `canVoid` if the item was already fired** — send that manager's token |
| POST | `/orders/:id/bill` | — | — | Mark `BILLED` (pre-payment "estimated bill" state) |
| POST | `/orders/:id/complimentary` | `AuthGuard('canDiscount')` | `ComplimentaryDto` | Zero out the whole bill and tag it `isComplimentary`. Must be called with a `canDiscount`-permitted token |
| POST | `/orders/:id/pay` | — | `PayDto` | Settle payment(s), close the order, free the table, stamp fiscal-year invoice number, deduct recipe stock, award loyalty points |
| POST | `/orders/:id/refund` | `AuthGuard('canVoid')` | `RefundDto` | Refund a paid order (full or partial) |
| POST | `/orders/:id/transfer` | — | `{ tableId: string }` | Move an order to a different table |
| POST | `/orders/:id/merge` | — | `{ fromOrderId: string }` | Merge another order's items into this one |
| POST | `/orders/:id/transfer-items` | `SoftAuthGuard` | `{ itemIds: string[], targetTableId: string, quantities?: Record<string,number> }` | Move specific items to another table's order |
| DELETE | `/orders/:id` | `SoftAuthGuard` (+ service check) | `VoidDto` | Void (with items → **requires `canVoid`** + mandatory `reason`) or silently discard an empty draft |

### Request DTOs

**`CreateOrderDto`**: `type` (required, `OrderType`), `tableId?`, `waiterId?`, `guestCount?` (int ≥1), `customerName?`, `customerPhone?`, `terminalId?`, `items?: CartLineDto[]`.

**`CartLineDto`** (used in both `create` and `saveCart`): `id?` (existing item id, to reconcile), `menuItemId?` — **or** `name?` + `unitPriceCents?` for an open/custom item, `variantId?` (chosen portion), `station?` (`KITCHEN`\|`BAR`\|`BILLING`), `quantity` (required, int ≥1), `discountCents?` (item-level), `modifiers?: [{name, priceCents}]`, `notes?`.

**`SaveCartDto`**: `items: CartLineDto[]` (required), `discountCents?` (order-level discount amount), `discountLabel?` (name of the preset applied, or `"Custom"` — display/reporting only), `isComplimentary?` (boolean — **note:** the server can only ever *carry forward or clear* this flag here, never set it `true` from `false`; only `POST /:id/complimentary` can do that), `notes?`, `waiterId?`, `guestCount?`.

**`PayDto`**: `payments: [{ method: PaymentMethod, amountCents }]` (required — sum must cover `totalCents`; empty array is valid for a Rs 0 / complimentary order), `redeemPoints?`, `customerPhone?`.

**`CancelItemDto`**: `quantity?` (partial cancel), `reason` (required).

**`VoidDto`**: `reason?` (required by the *service* once the order has items).

**`RefundDto`**: `reason` (required), `amountCents?` (defaults to full total).

**`ComplimentaryDto`**: `reason?`.

**`PaymentMethod` enum**: `OFFLINE | CASH | FONEPAY | BANK | ESEWA | KHALTI | CARD | CREDIT`. `CREDIT` tenders post to the customer's house-account balance instead of the cash drawer.

---

## 5. Menu

### Categories — `/categories`
| Method | Path | Body |
|---|---|---|
| GET | `/categories` | — |
| GET | `/categories/:id` | — |
| POST | `/categories` | `{ name (required), sortOrder?, isActive? }` |
| PATCH | `/categories/:id` | partial |
| DELETE | `/categories/:id` | — |

### Menu items — `/menu-items`
| Method | Path | Body |
|---|---|---|
| GET | `/menu-items` | query `categoryId?` |
| GET | `/menu-items/:id` | — |
| POST | `/menu-items` | `{ name, priceCents≥0, categoryId (required), description?, takeawayPriceCents?, deliveryPriceCents?, station?, isAvailable?, imageUrl?, modifierGroupIds?: string[], variants?: [{name, priceCents≥0, sortOrder?}] }` |
| PATCH | `/menu-items/:id` | partial |
| DELETE | `/menu-items/:id` | — |

Price tiers: `priceCents` is dine-in; `takeawayPriceCents`/`deliveryPriceCents` override it per order type when set (falls back to `priceCents`).

### Modifiers — `/modifier-groups`
| Method | Path | Body |
|---|---|---|
| GET / POST | `/modifier-groups` | `{ name (required), minSelect?, maxSelect?, sortOrder? }` |
| GET / PATCH / DELETE | `/modifier-groups/:id` | partial |
| POST | `/modifier-groups/:groupId/modifiers` | `{ name (required), priceCents?, sortOrder? }` |
| PATCH / DELETE | `/modifiers/:id` | partial |

---

## 6. Floor: Tables & Reservations

### Tables — `/tables`
| Method | Path | Body |
|---|---|---|
| GET | `/tables` | query `groupBy=area` |
| POST | `/tables` | `{ name (required), seats?, area?, isVip? }` |
| POST | `/tables/layout` | `{ positions: [{id, posX, posY}] }` — save floor-plan drag positions |
| PATCH | `/tables/:id` | `{ status?: TableStatus, posX?, posY?, ... }` |
| DELETE | `/tables/:id` | — |

`TableStatus`: `AVAILABLE | OCCUPIED | RESERVED | CLEANING`.

### Reservations — `/reservations`
| Method | Path | Body |
|---|---|---|
| GET | `/reservations` | query `date?`, `status?` |
| GET | `/reservations/waitlist` | — |
| POST | `/reservations` | `{ customerName (required), phone?, partySize?, reservedAt?, tableId?, notes?, isWaitlist? }` |
| PATCH | `/reservations/:id` | partial |
| POST | `/reservations/:id/seat` | — |
| POST | `/reservations/:id/cancel` | — |
| POST | `/reservations/:id/no-show` | — |
| DELETE | `/reservations/:id` | — |

`ReservationStatus`: `BOOKED | SEATED | CANCELLED | NO_SHOW`.

---

## 7. Customers (CRM & Loyalty) — `/customers`

| Method | Path | Guard | Body | Description |
|---|---|---|---|---|
| GET | `/customers` | — | query `search?` | List/search |
| GET | `/customers/stats` | — | — | Aggregate CRM stats |
| GET | `/customers/lookup` | — | query `phone` | Quick lookup while billing (suggested loyalty redemption etc.) |
| GET | `/customers/pan-lookup` | — | query `pan` | Calls the external IRD PAN registry (best-effort, 8s timeout) |
| GET | `/customers/:id` | — | — | Full profile |
| POST | `/customers` | — | `{ name, phone (required), panNumber?, isBusiness?, email?, birthday? }` | Create |
| PATCH | `/customers/:id` | — | partial | Update |
| POST | `/customers/:id/settle-credit` | `RoleGuard(['ADMIN','MANAGER'])` | `{ amountCents≥1 (required), method?, note? }` | Pay down a house-account balance |
| GET | `/customers/:id/ledger` | — | — | Full credit ledger (charges + payments, running balance) |
| DELETE | `/customers/:id` | — | — | GDPR delete |

Loyalty points, `totalSpentCents`, `visitCount` accrue automatically at `pay()` time. `memberCode` (e.g. `RADH1`) is auto-generated from initials + a sequence.

---

## 8. Inventory & Purchasing

### Inventory — `/inventory`
| Method | Path | Body |
|---|---|---|
| GET | `/inventory/ingredients` | — |
| POST | `/inventory/ingredients` | `{ name (required), unit?, stockQty?, reorderLevel?, costPerUnitCents? }` |
| PATCH | `/inventory/ingredients/:id` | partial |
| DELETE | `/inventory/ingredients/:id` | — |
| POST | `/inventory/ingredients/:id/movement` | `{ type: StockMovementType, quantity, reason? }` |
| POST | `/inventory/ingredients/:id/stock-take` | `{ countedQty≥0, reason? }` |
| GET | `/inventory/movements` | query `ingredientId?` |
| GET | `/inventory/valuation` | — total stock value |
| GET | `/inventory/recipe/:menuItemId` | — |
| POST | `/inventory/recipe` | `{ menuItemId, ingredientId, quantity (required) }` |
| DELETE | `/inventory/recipe/:id` | — |

`StockMovementType`: `PURCHASE | SALE_DEDUCTION | WASTAGE | STOCK_TAKE | ADJUSTMENT`. `SALE_DEDUCTION` movements are created automatically at payment time from each sold item's recipe.

### Purchasing — root-level (`@Controller()`, no prefix beyond the path itself)
| Method | Path | Body |
|---|---|---|
| GET / POST | `/suppliers` | `{ name (required), contact?, address?, taxId? }` |
| GET / PATCH / DELETE | `/suppliers/:id` | partial |
| GET | `/purchase-orders` | query `status?` |
| GET | `/purchase-orders/:id` | — |
| POST | `/purchase-orders` | `{ supplierId (required), notes?, lines: [{ingredientId, quantity, unitCostCents}] }` |
| POST | `/purchase-orders/auto-generate` | — creates draft POs from ingredients below `reorderLevel` |
| POST | `/purchase-orders/:id/order` | — mark `ORDERED` |
| POST | `/purchase-orders/:id/receive` | `{ receipts: [{lineId, receiveQty}] }` — partial/split delivery supported |
| POST | `/purchase-orders/:id/cancel` | — |

`PurchaseOrderStatus`: `DRAFT | ORDERED | PARTIAL | RECEIVED | CANCELLED`.

---

## 9. Cash Drawer & Terminals

### Cash Drawer — `/cash-drawer`
| Method | Path | Guard | Body |
|---|---|---|---|
| GET | `/cash-drawer/current` | — | query `terminalId?` |
| GET | `/cash-drawer/sessions` | — | — |
| GET | `/cash-drawer/sessions/:id` | — | — |
| GET | `/cash-drawer/report` | — | query `sessionId?`, `terminalId?` — Z-report |
| POST | `/cash-drawer/open` | — | `{ openingFloatCents≥0 (required), openedBy?, terminalId? }` |
| POST | `/cash-drawer/movement` | — | `{ type: 'PAY_IN'\|'PAY_OUT', amountCents≥1 (required), reason?, terminalId? }` |
| POST | `/cash-drawer/close` | — | `{ countedCents≥0 (required), closedBy?, notes?, terminalId? }` — computes variance vs. expected |
| PATCH | `/cash-drawer/opening-float` | `RoleGuard(['ADMIN'])` | `{ openingFloatCents }` — mid-day correction |

### Terminals — `/terminals`
`GET /terminals`, `POST /terminals` `{ name (required) }`.

### Waiters — `/waiters`
| Method | Path | Body |
|---|---|---|
| GET | `/waiters` | — active waiters only |
| POST | `/waiters` | `{ name (required) }` |
| PATCH | `/waiters/:id` | `{ name?, isActive? }` |
| DELETE | `/waiters/:id` | — **soft delete**: sets `isActive: false`, row is kept |

---

## 10. Staff, Attendance & Shifts

### Employees — `/employees`
| Method | Path | Body |
|---|---|---|
| GET | `/employees` | — |
| POST | `/employees/login` | `{ username, password }` → employee + token |
| GET | `/employees/active-shifts` | — |
| POST | `/employees` | `{ name, role: StaffRole, username, password (all required), deviceUserId?, monthlySalaryCents?, canVoid?, canDiscount?, canManageInventory?, canViewReports?, canManageStaff? }` |
| PATCH | `/employees/:id` | partial (password optional — omit to keep current) |
| DELETE | `/employees/:id` | — |
| POST | `/employees/:id/clock-in` | — |
| POST | `/employees/:id/clock-out` | — |
| GET | `/employees/:id/shifts` | — |

`StaffRole`: `ADMIN | MANAGER | CASHIER | BARISTA | WAITER`.

### Attendance (ZKTeco fingerprint) — `/attendance`
| Method | Path | Guard | Body |
|---|---|---|---|
| POST | `/attendance/sync` | `RoleGuard(['ADMIN','MANAGER'])` | — pull punches directly from the device (LAN-only; only reachable from the desktop till) |
| POST | `/attendance/ingest` | `AuthGuard()` | `{ punches: [{deviceUserId, at}] }` — pushed by the desktop app's LAN bridge |
| POST | `/attendance/relink` | `RoleGuard(['ADMIN','MANAGER'])` | — re-attach previously-unmapped punches after assigning device IDs |
| POST | `/attendance/manual` | `RoleGuard(['ADMIN','MANAGER'])` | `{ employeeId, at }` |
| GET | `/attendance/logs` | — | query `from?`, `to?`, `employeeId?` |
| GET | `/attendance/summary` | — | query `from?`, `to?` |
| GET | `/attendance/payroll` | — | query `month?` — salary ÷ 26 × present days |

---

## 11. Kitchen Display (KDS) — `/kds`

| Method | Path | Body |
|---|---|---|
| GET | `/kds/tickets` | — live KOT/BOT tickets |
| GET | `/kds/tokens` | — running token-number rail |
| POST | `/kds/items/:id/ready` | — |
| POST | `/kds/orders/:id/bump` | — mark a whole ticket done |
| POST | `/kds/items/:id/out-of-stock` | `{ menuItemId }` — 86 an item mid-service |

---

## 12. Reports, Accounting & Analytics

### Dashboard — `/analytics`
`GET /analytics/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD` — both optional, default to today. Drives the Dashboard's quick date filter (Today/Yesterday/This week/This month/Custom). Returns KPIs, sales-by-day series, payments-by-method, top items/tables, waiter overview, and recent orders — all scoped to the given window (except the 30-day rolling average, which is independent of the selected range).

### Sales Reports (MIS) — `/mis`
Every route returns a uniform shape: `{ title, columns: [{key, label, type: 'text'|'money'|'number'}], rows, kpis? }`.

| Method | Path | Query | Description |
|---|---|---|---|
| GET | `/mis/sales-detail` | `from, to, categoryId?, itemId?, method?, type?, station?, groupBy=detail\|item\|category\|method\|day` | The main filterable Sales Report — bill-wise detail or aggregated by item/category/payment/day. Each row (in `detail` mode) carries an `orderId` for looking up the bill |
| GET | `/mis/cancelled-items` | `from, to, station?` | Every cancelled order line with reason and who approved it |
| GET | `/mis/account-summary` | `from?, to?` | |
| GET | `/mis/vat-summary` | `fy?` (Nepali fiscal year, e.g. `2082`) | |
| GET | `/mis/daily-sales` | `from?, to?` | |
| GET | `/mis/collections` | `from?, to?` | |
| GET | `/mis/monthly-sales/:groupBy` | `groupBy = item\|category\|customer`, `fy?` | |
| GET | `/mis/sales-returns` | `from?, to?` | |
| GET | `/mis/party-balances` | — | Customer credit balances |
| GET | `/mis/stock-ledger` | `from?, to?` | |

### Finance — `/finance`
| Method | Path | Body |
|---|---|---|
| GET | `/finance/pnl` | query `from?, to?` — P&L statement |
| GET | `/finance/ap-aging` | — accounts-payable aging buckets |
| GET | `/finance/expenses` | query `from?, to?` |
| POST | `/finance/expenses` | `{ category: ExpenseCategory, amountCents≥1 (required), description?, incurredAt? }` |
| DELETE | `/finance/expenses/:id` | — |

`ExpenseCategory`: `RENT | UTILITIES | SALARY | MARKETING | MAINTENANCE | SUPPLIES | OTHER`.

### Accounting (double-entry) — `/accounting`
| Method | Path | Guard | Body |
|---|---|---|---|
| GET / POST | `/accounting/accounts` | POST: `RoleGuard(['ADMIN','MANAGER'])` | Chart of accounts |
| GET / PATCH / DELETE | `/accounting/accounts/:id` | mutations gated | — |
| GET | `/accounting/journal` | — | query `from?, to?` |
| POST | `/accounting/journal` | `RoleGuard(['ADMIN','MANAGER'])` | `{ date?, type?, narration?, lines: [{accountId, drCents?, crCents?}] }` — must balance |
| DELETE | `/accounting/journal/:id` | `RoleGuard(['ADMIN','MANAGER'])` | — |
| GET | `/accounting/ledger/:accountId` | — | query `from?, to?` |
| GET | `/accounting/trial-balance` | — | — |
| GET | `/accounting/sales-book` \| `/purchase-register` \| `/cash-book` \| `/bank-book` | — | query `from?, to?` |
| GET | `/accounting/day-book` | — | query `date` |
| GET | `/accounting/balance-sheet` | — | query `asOf?` |

System accounts (cash, bank, sales, VAT, debtors) are seeded and undeletable; their ledger views merge live POS activity automatically, not just manual vouchers.

### IRD Nepal (CBMS e-billing) — `/ird`
| Method | Path | Guard | Description |
|---|---|---|---|
| GET | `/ird/report` | — | query `from?, to?` |
| POST | `/ird/sync` | `RoleGuard(['ADMIN','MANAGER'])` | Push unsynced invoices to IRD's CBMS API |
| GET | `/ird/tally-xml` | — | query `from?, to?` — returns `application/xml` as a file download |

### Reports & Audit
- `GET /reports?from=&to=` — legacy summary report.
- `GET /audit` — `AuthGuard('canViewReports')` — staff action audit trail (void/refund/cancel/complimentary/reset-data/etc.).

---

## 13. Settings — `/settings`

| Method | Path | Guard | Body |
|---|---|---|---|
| GET | `/settings` | — | Full config (see shape below) |
| PATCH | `/settings` | — | Partial `UpdateSettingsDto` |
| POST | `/settings/reset-data` | `AuthGuard('canManageStaff')` | `{ categories?: string[] }` — see below |
| GET | `/settings/discount-presets` | — | query `active=1` to filter |
| POST | `/settings/discount-presets` | `AuthGuard('canManageStaff')` | `{ name (required), type?: 'PCT'\|'RS', value (required), sortOrder? }` |
| PATCH | `/settings/discount-presets/:id` | `AuthGuard('canManageStaff')` | partial |
| DELETE | `/settings/discount-presets/:id` | `AuthGuard('canManageStaff')` | — |

**`GET /settings` response:**
```ts
{
  currency, vatRate, serviceChargeRate, pricesIncludeVat, currencySymbol,
  defaultGuestCount, restaurantName, address, phone, taxId,
  receiptHeader, receiptFooter, wifiPassword,
  billTemplate, kotTemplate,
  attendanceDevice: { ip, port },
  ird: { enabled, username, sellerPan, apiUrl, hasPassword }, // password itself never returned
  features: { reservations, inventory, purchasing, roastery, modifiers, crm, finance, kds } // module on/off toggles
}
```

**`UpdateSettingsDto`** fields (all optional): `restaurantName, address, phone, taxId, vatRate (0–1 fraction), serviceChargeRate (0–1), pricesIncludeVat, currencySymbol, defaultGuestCount, receiptHeader, receiptFooter, wifiPassword, featReservations, featInventory, featPurchasing, featRoastery, featModifiers, featCrm, featFinance, featKds, billTemplate (object), kotTemplate (object), irdEnabled, irdUsername, irdPassword, irdSellerPan, irdApiUrl, zkDeviceIp, zkDevicePort`.

**Reset data categories** (`SettingsService.RESET_CATEGORIES`): `transactions, reservations, purchasing, inventory, menu, customers, expenses, roastery, attendance, auditLog`. Omitting `categories` (or sending `[]`) resets **everything**. Staff logins and settings are never touched by this endpoint regardless of selection. `transactions` covers orders/items/payments/cash sessions/journal vouchers — everything every report reads from. `menu` and `customers` are the two destructive-to-master-data categories (menu catalogue, customer profiles) and are opt-in only in the UI.

**Discount presets**: `type: 'PCT'` → `value` is a whole percentage (e.g. `10` = 10%). `type: 'RS'` → `value` is in **cents** (e.g. `10000` = Rs 100).

---

## 14. Platform (SaaS Control Plane) — `/platform`

**Control-plane only.** Requires `RoleGuard(['ADMIN'])` on every route, plus a self-check that throws `403` if any tenant context is active (so a tenant's own admin, even with role `ADMIN`, can never reach these). Access this via the bare `s3vya.tech` domain (no `X-Tenant` header, no tenant subdomain).

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/platform/plans` | — | Subscription plan catalogue |
| GET | `/platform/tenants` | — | All tenants + their plan + recent payments |
| GET | `/platform/stats` | — | MRR, active/trial/suspended counts, collections |
| POST | `/platform/tenants` | `{ name, slug, planCode?, ownerName?, ownerPhone?, ownerEmail?, adminUsername, adminPassword, trialDays? }` | **Provisions a new tenant**: creates its database, runs migrations, seeds the owner's admin account, registers it in the control DB |
| POST | `/platform/tenants/:id/status` | `{ status: 'TRIAL'\|'ACTIVE'\|'SUSPENDED' }` | |
| POST | `/platform/payments` | `{ tenantId, planCode?, amountCents, method: 'CASH'\|'BANK_TRANSFER', reference?, months?, note? }` | Record a manual subscription payment; verifying extends `paidUntil` and reactivates a suspended/trial tenant |
| GET | `/platform/me` | — | `{ platform: true }` — used by the console to confirm access |
| GET | `/platform/tenants/:id/settings` | — | Read a tenant's `CafeSetting` + feature flags remotely |
| POST | `/platform/tenants/:id/settings` | partial `CafeSetting` fields | Update a tenant's settings/feature flags remotely, without touching their DB directly |
| GET | `/platform/tenants/:id/summary` | — | Employee count, paid-order count, last sale date |
| DELETE | `/platform/tenants/:id` | query `dropDb=1\|true` | Remove a tenant; `dropDb` additionally drops its database |

### Public — `/public`

`GET /public/plans` — unauthenticated, tenant-agnostic plan catalogue for the marketing landing page's pricing section.

---

## 15. Data Model Reference

### Enums
| Enum | Values |
|---|---|
| `OrderType` | `DINE_IN`, `TAKEAWAY`, `DELIVERY` |
| `OrderStatus` | `OPEN`, `SENT_TO_KITCHEN`, `READY`, `SERVED`, `BILLED`, `PAID`, `REFUNDED`, `CANCELLED` |
| `KotStatus` | `PENDING`, `PREPARING`, `READY`, `SERVED` |
| `PrepStation` | `KITCHEN`, `BAR`, `BILLING` |
| `PaymentMethod` | `OFFLINE`, `CASH`, `FONEPAY`, `BANK`, `ESEWA`, `KHALTI`, `CARD`, `CREDIT` |
| `TableStatus` | `AVAILABLE`, `OCCUPIED`, `RESERVED`, `CLEANING` |
| `ReservationStatus` | `BOOKED`, `SEATED`, `CANCELLED`, `NO_SHOW` |
| `StaffRole` | `ADMIN`, `MANAGER`, `CASHIER`, `BARISTA`, `WAITER` |
| `CreditEntryType` | `CHARGE`, `PAYMENT` |
| `ExpenseCategory` | `RENT`, `UTILITIES`, `SALARY`, `MARKETING`, `MAINTENANCE`, `SUPPLIES`, `OTHER` |
| `DiscountType` | `PCT`, `RS` |
| `CashMovementType` | `OPENING`, `PAY_IN`, `PAY_OUT` |
| `StockMovementType` | `PURCHASE`, `SALE_DEDUCTION`, `WASTAGE`, `STOCK_TAKE`, `ADJUSTMENT` |
| `PurchaseOrderStatus` | `DRAFT`, `ORDERED`, `PARTIAL`, `RECEIVED`, `CANCELLED` |
| `AccountType` | `ASSET`, `LIABILITY`, `EQUITY`, `INCOME`, `EXPENSE` |
| `TenantStatus` (control DB only) | `TRIAL`, `ACTIVE`, `SUSPENDED` |

### Models (tenant database — one per restaurant)
`Category`, `MenuItem`, `MenuItemVariant`, `ModifierGroup`, `Modifier` — menu catalogue.
`RestaurantTable`, `Reservation` — floor plan & bookings.
`Order`, `OrderItem`, `Payment` — transactions (see §4 for full `Order`/`OrderItem` shape).
`Waiter`, `Employee`, `Shift` — staff & clock-in/out.
`Customer`, `CreditLedgerEntry` — CRM, loyalty points, house-account credit.
`Expense` — P&L expenses.
`GreenBeanBatch`, `RoastBatch`, `CuppingScore` — roastery module.
`AuditLog` — immutable log of sensitive actions.
`CafeSetting` — singleton (`id: "singleton"`) restaurant config, incl. `feat*` module toggles, IRD credentials, printable templates.
`DiscountPreset` — named POS discounts.
`Terminal`, `CashDrawerSession`, `CashMovement` — tills & cash sessions.
`Ingredient`, `Supplier`, `PurchaseOrder`, `PurchaseOrderLine`, `RecipeItem`, `StockMovement` — inventory & purchasing.
`IdempotencyKey` — offline-write dedup store.
`LedgerAccount`, `JournalEntry`, `JournalLine` — chart of accounts & manual vouchers.
`AttendanceLog` — fingerprint punches.

### Models (control-plane database only)
`Plan`, `Tenant`, `SubscriptionPayment` — SaaS billing/provisioning; not present in a tenant's own database.

---

## 16. Permission Matrix

| Permission flag | Gates |
|---|---|
| `canVoid` | Voiding an order with items; refunding a paid order; cancelling an already-fired kitchen/bar item |
| `canDiscount` | Marking a bill complimentary (`POST /orders/:id/complimentary`) |
| `canManageInventory` | *(reserved — not currently enforced by any guard; inventory routes are open to any signed-in context)* |
| `canViewReports` | `GET /audit` |
| `canManageStaff` | `POST /settings/reset-data`; `POST/PATCH/DELETE /settings/discount-presets`; the frontend also uses this flag to gate the Employees/Settings UI sections generally |

`RoleGuard(['ADMIN'])` additionally gates all of `/platform/*`. `RoleGuard(['ADMIN','MANAGER'])` gates chart-of-accounts/journal mutations, IRD sync, and attendance device sync/manual-entry.

---

## 17. Known Gaps

Honest callouts for anyone integrating against this API:

- **No refresh token** — a 12h-expired token requires a fresh `POST /employees/login`.
- **`canManageInventory` is unused** — the permission flag exists on `Employee` and is settable, but no route currently checks it; inventory/purchasing endpoints have no guard at all.
- **No tips/gratuity field** anywhere in the `Order` model or payment flow.
- **No happy-hour / time-based / scheduled pricing** — `DiscountPreset` values are static; nothing time-conditional exists.
- **CRUD routes with no auth guard** (menu, categories, modifiers, tables, reservations, inventory, purchasing, terminals, waiters, employees create/update/delete): reachable by anyone who can reach the API at all (any valid tenant context), regardless of role. Only the routes explicitly listed with a guard in the tables above are actually gated. Don't assume a route is protected just because the frontend hides the button.

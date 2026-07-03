# 🍰 CakeZake POS

A scalable restaurant Point-of-Sale platform. Built to grow feature-by-feature:
menu & items, modifiers, table management, orders & KOT, billing, and sales
forecasting.

## Tech stack

| Layer     | Technology                                   |
| --------- | -------------------------------------------- |
| Frontend  | **Next.js 14** (App Router) + Tailwind CSS   |
| Backend   | **NestJS 10** (modular, DI, scalable)        |
| ORM       | **Prisma 5**                                 |
| Database  | **PostgreSQL**                               |
| Monorepo  | **pnpm workspaces**                          |

Why NestJS: a POS naturally grows multiple clients (web POS, kitchen display,
mobile). A decoupled, modular API scales cleanly — each feature is its own
module, and websockets/queues/auth are first-class when we need them.

## Project layout

```
cakezake-pos/
├─ apps/
│  ├─ api/           NestJS backend
│  │  ├─ prisma/     schema + migrations + seed
│  │  └─ src/
│  │     ├─ categories/     ✅ implemented
│  │     ├─ menu-items/     ✅ implemented
│  │     ├─ modifiers/      ✅ implemented
│  │     └─ prisma/ health/ …
│  └─ web/           Next.js frontend
│     ├─ app/        dashboard, menu, modifiers pages
│     ├─ components/ Sidebar, Modal
│     └─ lib/        api client + types
└─ pnpm-workspace.yaml
```

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- PostgreSQL running locally

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Create the database
createdb cakezake_pos

# 3. Configure the API env
cp apps/api/.env.example apps/api/.env
#   → edit DATABASE_URL to match your Postgres user

# 4. Run migrations + seed sample data
pnpm db:migrate      # applies schema
pnpm db:seed         # loads categories, items, modifiers, tables
```

## Running

```bash
# Run API + web together
pnpm dev

# …or individually
pnpm dev:api         # http://localhost:4000/api
pnpm dev:web         # http://localhost:3000
```

- Web app: **http://localhost:3000**
- API health: **http://localhost:4000/api/health**

## Useful scripts

| Command             | Description                          |
| ------------------- | ------------------------------------ |
| `pnpm dev`          | Run API + web in parallel            |
| `pnpm build`        | Production build of both apps        |
| `pnpm db:migrate`   | Apply Prisma migrations              |
| `pnpm db:seed`      | Seed sample data                     |
| `pnpm db:studio`    | Open Prisma Studio (DB GUI)          |

## API reference (current)

| Method | Endpoint                              | Description                |
| ------ | ------------------------------------- | ------------------------- |
| GET    | `/api/health`                         | Readiness (checks DB)     |
| GET    | `/api/categories`                     | List categories           |
| POST   | `/api/categories`                     | Create category           |
| PATCH  | `/api/categories/:id`                 | Update category           |
| DELETE | `/api/categories/:id`                 | Delete category           |
| GET    | `/api/menu-items?categoryId=`         | List menu items           |
| POST   | `/api/menu-items`                     | Create item               |
| PATCH  | `/api/menu-items/:id`                 | Update item               |
| DELETE | `/api/menu-items/:id`                 | Delete item               |
| GET    | `/api/modifier-groups`                | List modifier groups      |
| POST   | `/api/modifier-groups`                | Create group              |
| POST   | `/api/modifier-groups/:id/modifiers`  | Add option to group       |
| DELETE | `/api/modifier-groups/modifiers/:id`  | Delete option             |

## Roadmap

- [x] Menu & items management
- [x] Modifiers & modifier groups
- [ ] Table management (floor plan, status)
- [ ] Orders & KOT (kitchen order tickets, live updates)
- [ ] Billing & payments (split, tax, discounts)
- [ ] Sales analytics & demand forecasting
- [ ] Auth & staff roles

Money is stored in **integer cents** everywhere to avoid floating-point errors.

---

Built with Next.js · NestJS · Prisma · PostgreSQL

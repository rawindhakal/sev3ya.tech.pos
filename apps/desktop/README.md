# CakeZake POS — Desktop (Cashier Billing)

A native desktop shell (Electron) that runs the **POS billing terminal** for
cashiers. It loads the same web `/pos` route, so it has the **exact same
features** as the web POS — order modes, tables, KOT/BOT, split payment,
day-end, etc. What a cashier can do is governed by their **PIN login role**
(discounts/voids need permission or a manager override), and there is **no
admin/back-office chrome** in the desktop window.

## Prerequisites

- The API (`apps/api`) and web app (`apps/web`) running and reachable.
- Node ≥ 20 and pnpm.

## Run (development)

```bash
# from the repo root — start API + web first
pnpm dev

# then, in another terminal, launch the desktop app
pnpm --filter desktop install     # first time (downloads Electron)
POS_URL=http://localhost:3000 pnpm --filter desktop start
```

- `POS_URL` — base URL of the running web app (default `http://localhost:3000`).
  The window always opens at `<POS_URL>/pos`.
- Add `KIOSK=1` (or run `pnpm --filter desktop kiosk`) for full-screen till mode.

> pnpm blocks Electron's install script by default. If you see a build-scripts
> warning, run `pnpm approve-builds` (electron is already allow-listed in
> `pnpm-workspace.yaml`).

## Package installers

```bash
pnpm --filter desktop dist          # current OS
pnpm --filter desktop dist:mac      # macOS .dmg
pnpm --filter desktop dist:win      # Windows NSIS installer
```

Output goes to `apps/desktop/release/`. Point the built app at your production
web URL by setting `POS_URL` before packaging, or ship a small config.

## How cashier-only scope works

- The window opens directly to `/pos` and hides all application menus.
- The POS PIN login identifies the cashier; the back-office pages, reports,
  finance, inventory, etc. are simply **not part of this window**.
- Permission-gated actions (discount, void, refund) still require the cashier's
  own permission or an on-screen **manager-PIN override**.

## TODO before shipping to tills

- Add an app icon (`build/icon.icns` / `build/icon.ico`).
- Optionally hard-code / lock the `POS_URL` and terminal name for each till.

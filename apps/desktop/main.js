'use strict';

// s3vyaPOS — desktop billing shell (Electron).
// Loads the web POS terminal (cashier billing) in a native window. It is the
// SAME app as the web /pos route, so it has the exact same features; the
// cashier's login scopes what they can do (no admin/back-office chrome).

const { app, BrowserWindow, Menu, Tray, nativeImage, shell, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

// Where the running web app lives. Defaults to the live production server;
// override with POS_URL for local dev. Always opens straight to the POS terminal.
const BASE_URL = (process.env.POS_URL || 'https://s3vya.tech').replace(/\/$/, '');
const POS_URL = `${BASE_URL}/pos`;
const KIOSK = process.env.KIOSK === '1';

let tray = null; // module-level so it isn't garbage-collected (Electron requires this)

// Small brand-colored dot, built as a raw bitmap so the tray works without a
// bundled icon asset (none exists in this repo — electron-builder falls back
// to its own default for the app/installer icon, but Tray needs one handed
// to it directly). BGRA byte order, per nativeImage.createFromBitmap.
function buildTrayIcon() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const r = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const i = (y * size + x) * 4;
      if (dx * dx + dy * dy <= r * r) {
        buf[i] = 0x68; buf[i + 1] = 0x33; buf[i + 2] = 0xe2; buf[i + 3] = 0xff; // B G R A — brand pink #e23368
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

// Minimize-to-tray: clicking the native minimize button hides the window and
// removes it from the taskbar/dock entirely instead of just minimizing it,
// keeping the till running quietly with only a tray icon. The tray menu (or
// clicking the icon) brings it back.
function createTray(win) {
  if (tray) return;
  tray = new Tray(buildTrayIcon());
  tray.setToolTip('s3vyaPOS — Billing');
  const showWindow = () => {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  };
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open s3vyaPOS', click: showWindow },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
    ]),
  );
  tray.on('click', () => (win.isVisible() && !win.isMinimized() ? win.hide() : showWindow()));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#1A1A1A',
    title: 's3vyaPOS — Billing',
    autoHideMenuBar: true,
    kiosk: KIOSK,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 'minimize' below actually hides the window (so it can be restored
      // from the tray) rather than truly minimizing it — a hidden window is
      // backgrounded more aggressively by Chromium, throttling setInterval
      // timers (AutoPrintAgent's KOT-queue poll, the waiter-call/table
      // polls) down to roughly once a minute or pausing them outright. That
      // silently stalled auto-print until the till was reopened. Same fix
      // already applied to the print worker window below.
      backgroundThrottling: false,
    },
  });

  // Cashier terminal: no application/dev menu chrome.
  Menu.setApplicationMenu(null);

  // Tray creation must never be able to stop the till from opening. It ran
  // unguarded here before — if it threw for any reason (a Windows machine
  // with no notification area available, a driver/GPU quirk, anything),
  // createWindow() aborted right at this line: the BrowserWindow was
  // already constructed and visible on screen, but win.loadURL(POS_URL)
  // below was never reached, so the till just showed a permanently blank
  // window with no error — indistinguishable from "the app isn't opening"
  // to whoever's staring at it.
  try {
    createTray(win);
  } catch (err) {
    console.error('[s3vyaPOS] Tray creation failed, continuing without it:', err);
  }
  win.on('minimize', (event) => {
    event.preventDefault();
    win.hide();
  });

  win.loadURL(POS_URL);

  // Open any external links in the system browser, never a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // If the terminal server isn't reachable (internet/LAN blip), show a waiting
  // screen and keep auto-retrying so the till reconnects on its own the moment
  // the server is back — no manual relaunch needed.
  //
  // Deliberately NOT using 'did-finish-load' to detect success and cancel the
  // retry loop (an earlier version of this code did, and it was broken):
  // Chromium fires 'did-finish-load' for a failed top-level navigation too —
  // once for its own error-page commit, which still reports the ORIGINAL
  // target URL via webContents.getURL() despite the load having failed, and
  // again when we load the "waiting for server" placeholder. Both satisfy
  // almost any "a page finished loading" check (including one that requires
  // the URL to exactly equal POS_URL, since the error-page commit reports
  // exactly that URL) — so the retry timer got cancelled within
  // milliseconds of being armed, and the till just sat on "Waiting for the
  // terminal server…" forever without ever actually retrying.
  //
  // The fix: don't try to detect success at all. Each failure schedules
  // exactly one retry; if that retry succeeds, 'did-fail-load' simply never
  // fires again, so no further retry gets scheduled — the loop terminates
  // itself. No separate "cancel on success" listener needed.
  let retryTimer = null;
  win.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* ERR_ABORTED */) return;
    win.loadURL(
      'data:text/html,' +
        encodeURIComponent(
          `<body style="background:#1A1A1A;color:#fff;font-family:sans-serif;display:flex;height:100vh;align-items:center;justify-content:center;text-align:center">
             <div><h2>🍰 s3vyaPOS</h2>
             <p>Waiting for the terminal server at <code>${POS_URL}</code>…</p>
             <p style="opacity:.6">Reconnecting automatically. The till resumes as soon as the server is back.</p></div></body>`,
        ),
    );
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => win.loadURL(POS_URL), 4000);
  });
}

// A promise that always settles within `ms`, even if the underlying promise
// never resolves/rejects (e.g. a print driver that hangs forever). Without
// this, one stuck operation can freeze the whole till indefinitely.
function withTimeout(p, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label ? label + ' ' : ''}timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

// ── Printing bridge ──────────────────────────────────
// List OS printers for the Settings → Printing page.
ipcMain.handle('printers:list', async (event) => {
  const printers = await event.sender.getPrintersAsync();
  return printers.map((p) => ({ name: p.name, displayName: p.displayName, isDefault: p.isDefault }));
});

// Print ticket HTML silently to a chosen printer (thermal-receipt style).
// A hidden window renders the HTML, prints, then closes. Hardened against
// the two failure modes that used to hang or silently no-op the till:
//  1. A printer that was renamed/unplugged/uninstalled since it was chosen
//     in Settings → Printing — we now check it still exists first and fall
//     back to the OS default instead of Electron just swallowing the print.
//  2. `webContents.print()` on a hidden (`show:false`) window can stall
//     indefinitely on some Windows printer drivers because a backgrounded
//     renderer gets throttled before it finishes painting — fixed with
//     `backgroundThrottling:false` plus a hard timeout as a last resort.
ipcMain.handle('print:html', async (event, { html, printerName, widthMm = 80 }) => {
  let resolvedPrinter = printerName || undefined;
  let printerWarning;
  if (printerName) {
    try {
      const available = await event.sender.getPrintersAsync();
      const stillThere = available.some((p) => p.name === printerName);
      if (!stillThere) {
        resolvedPrinter = undefined; // let the OS pick its default instead
        printerWarning = `Printer "${printerName}" is no longer available (unplugged, renamed, or driver removed) — used the system default instead. Re-select it under Settings → Printing.`;
      }
    } catch {
      // If we can't even list printers, just try with what we were given.
    }
  }

  const worker = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  try {
    await withTimeout(worker.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)), 10000, 'Ticket render');
    const micronsWide = Math.round(widthMm * 1000);
    await withTimeout(
      new Promise((resolve, reject) => {
        worker.webContents.print(
          {
            silent: true,
            printBackground: true,
            deviceName: resolvedPrinter,
            margins: { marginType: 'none' },
            pageSize: { width: micronsWide, height: 297000 }, // receipt roll
          },
          (success, reason) => (success ? resolve() : reject(new Error(reason || 'Printer rejected the job — check it has paper and is powered on.'))),
        );
      }),
      20000,
      'Print',
    );
    return { ok: true, warning: printerWarning };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  } finally {
    worker.destroy();
  }
});

// ── Remembered cashier session (Remember me / auto sign-in) ─────────────
// Credentials are encrypted with the OS keychain (safeStorage) before ever
// touching disk — the renderer never sees plaintext outside the login form.
const credsPath = () => path.join(app.getPath('userData'), 'cashier-session.json');

ipcMain.handle('creds:save', (_event, { restaurant, username, password }) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: 'Secure storage is not available on this device' };
    }
    const encrypted = safeStorage.encryptString(password || '');
    fs.writeFileSync(
      credsPath(),
      JSON.stringify({ restaurant: restaurant || '', username: username || '', password: encrypted.toString('base64') }),
      'utf8',
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('creds:load', () => {
  try {
    if (!fs.existsSync(credsPath())) return null;
    const raw = JSON.parse(fs.readFileSync(credsPath(), 'utf8'));
    if (!raw.username || !raw.password) return null;
    const password = safeStorage.decryptString(Buffer.from(raw.password, 'base64'));
    return { restaurant: raw.restaurant || '', username: raw.username, password };
  } catch {
    return null;
  }
});

ipcMain.handle('creds:clear', () => {
  try {
    fs.unlinkSync(credsPath());
  } catch {
    /* nothing saved */
  }
  return { ok: true };
});

// Last-resort safety net: log anything that slips past the try/catch above
// instead of the process just vanishing with the till showing nothing and
// no clue why. Does not attempt to recover — an uncaught exception this
// late means something is genuinely wrong — but at least leaves a trail.
process.on('uncaughtException', (err) => {
  console.error('[s3vyaPOS] Uncaught exception in main process:', err);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

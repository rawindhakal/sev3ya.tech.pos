'use strict';

// s3vyaPOS — desktop billing shell (Electron).
// Loads the web POS terminal (cashier billing) in a native window. It is the
// SAME app as the web /pos route, so it has the exact same features; the
// cashier's login scopes what they can do (no admin/back-office chrome).

const { app, BrowserWindow, Menu, shell, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

// Where the running web app lives. Defaults to the live production server;
// override with POS_URL for local dev. Always opens straight to the POS terminal.
const BASE_URL = (process.env.POS_URL || 'https://s3vya.tech').replace(/\/$/, '');
const POS_URL = `${BASE_URL}/pos`;
const KIOSK = process.env.KIOSK === '1';

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
    },
  });

  // Cashier terminal: no application/dev menu chrome.
  Menu.setApplicationMenu(null);

  win.loadURL(POS_URL);

  // Open any external links in the system browser, never a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // If the terminal server isn't reachable (internet/LAN blip), show a waiting
  // screen and keep auto-retrying so the till reconnects on its own the moment
  // the server is back — no manual relaunch needed.
  let retryTimer = null;
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
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

  // Clear the retry loop once a real page loads.
  win.webContents.on('did-finish-load', () => {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  });
}

// ── ZKTeco attendance bridge ─────────────────────────
// The till sits on the same LAN as the fingerprint scanner (TCP 4370), so it
// pulls punches from the device and the web app pushes them to the cloud API —
// same pattern as the KOT auto-printer.
const Zkteco = require('zkteco-js');

// A promise that always settles within `ms`, even if the underlying promise
// never resolves/rejects (e.g. a device or print driver that hangs forever).
// Without this, one stuck operation can freeze the whole till indefinitely.
function withTimeout(p, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label ? label + ' ' : ''}timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

ipcMain.handle('zk:pull', async (_event, { ip, port = 4370 }) => {
  if (!ip) return { error: 'No device IP configured' };
  const device = new Zkteco(ip, port, 10000, 4000);
  try {
    await withTimeout(device.createSocket(), 15000);
    const u = await withTimeout(device.getUsers(), 20000);
    const a = await withTimeout(device.getAttendances(), 30000);
    const users = (u?.data ?? []).map((x) => ({
      deviceUserId: String(x.userId ?? x.user_id ?? x.uid ?? ''),
      name: x.name ?? '',
    }));
    const punches = (a?.data ?? [])
      .map((r) => {
        const at = new Date(r.record_time ?? r.recordTime ?? r.timestamp);
        return {
          deviceUserId: String(r.user_id ?? r.deviceUserId ?? r.uid ?? ''),
          at: isNaN(at.getTime()) ? null : at.toISOString(),
        };
      })
      .filter((p) => p.deviceUserId && p.at);
    return { users, punches };
  } catch (err) {
    return { error: String(err.message || err) };
  } finally {
    try { await device.disconnect(); } catch { /* already closed */ }
  }
});

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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

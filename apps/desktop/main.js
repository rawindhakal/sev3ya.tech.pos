'use strict';

// s3vyaPOS — desktop billing shell (Electron).
// Loads the web POS terminal (cashier billing) in a native window. It is the
// SAME app as the web /pos route, so it has the exact same features; the
// cashier's login scopes what they can do (no admin/back-office chrome).

const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');

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

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms / 1000}s`)), ms))]);

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
// A hidden window renders the HTML, prints, then closes.
ipcMain.handle('print:html', async (_event, { html, printerName, widthMm = 80 }) => {
  const worker = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  try {
    await worker.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const micronsWide = Math.round(widthMm * 1000);
    await new Promise((resolve, reject) => {
      worker.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: printerName || undefined,
          margins: { marginType: 'none' },
          pageSize: { width: micronsWide, height: 297000 }, // receipt roll
        },
        (success, reason) => (success ? resolve() : reject(new Error(reason || 'print failed'))),
      );
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  } finally {
    worker.destroy();
  }
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

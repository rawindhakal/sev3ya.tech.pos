'use strict';

// CakeZake POS — desktop billing shell (Electron).
// Loads the web POS terminal (cashier billing) in a native window. It is the
// SAME app as the web /pos route, so it has the exact same features; the
// cashier's PIN login scopes what they can do (no admin/back-office chrome).

const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

// Where the running web app lives. Point this at your deployment (or leave the
// default for a local dev server). Always opens straight to the POS terminal.
const BASE_URL = (process.env.POS_URL || 'http://localhost:3000').replace(/\/$/, '');
const POS_URL = `${BASE_URL}/pos`;
const KIOSK = process.env.KIOSK === '1';

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#1A1A1A',
    title: 'CakeZake POS — Billing',
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

  // Show a friendly message if the web app isn't reachable yet.
  win.webContents.on('did-fail-load', () => {
    win.loadURL(
      'data:text/html,' +
        encodeURIComponent(
          `<body style="background:#1A1A1A;color:#fff;font-family:sans-serif;display:flex;height:100vh;align-items:center;justify-content:center;text-align:center">
             <div><h2>🍰 CakeZake POS</h2>
             <p>Could not reach the server at <code>${POS_URL}</code>.</p>
             <p>Start the web app, then relaunch — or set <code>POS_URL</code>.</p></div></body>`,
        ),
    );
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

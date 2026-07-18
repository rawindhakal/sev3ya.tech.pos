'use strict';

// Safe bridge between the web POS and the desktop shell. Exposes just enough
// for printing: list the OS printers and print raw ticket HTML silently to a
// chosen printer (used for auto-printing KOTs fired by waiters).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cakezakeDesktop', {
  isDesktop: true,
  platform: process.platform,
  // → [{ name, displayName, isDefault }]
  listPrinters: () => ipcRenderer.invoke('printers:list'),
  // Prints the given HTML silently. { html, printerName?, widthMm? }
  printHtml: (opts) => ipcRenderer.invoke('print:html', opts),
  // Pull users + punches from the ZKTeco scanner on the LAN. { ip, port? }
  // → { users: [{deviceUserId,name}], punches: [{deviceUserId,at}] } | { error }
  pullAttendance: (opts) => ipcRenderer.invoke('zk:pull', opts),
  // Remembered cashier session (Remember me / auto sign-in). Credentials are
  // OS-keychain encrypted in the main process — never stored in plaintext.
  saveCreds: (restaurant, username, password) => ipcRenderer.invoke('creds:save', { restaurant, username, password }),
  loadCreds: () => ipcRenderer.invoke('creds:load'),
  clearCreds: () => ipcRenderer.invoke('creds:clear'),
});

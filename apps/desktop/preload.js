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
});

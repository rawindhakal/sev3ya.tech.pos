'use strict';

// Minimal, safe bridge — lets the web app detect it's running inside the
// desktop shell (e.g. to show "Terminal 1" defaults) without exposing Node.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('cakezakeDesktop', {
  isDesktop: true,
  platform: process.platform,
});

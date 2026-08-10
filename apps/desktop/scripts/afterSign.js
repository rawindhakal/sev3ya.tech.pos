'use strict';

// electron-builder's own automatic signing (when no paid Apple Developer ID
// is configured, as here) only produces a shallow "linker-signed" ad-hoc
// signature that doesn't seal Info.plist/resources. After being repackaged
// into a DMG and downloaded (quarantined), macOS finds that seal
// inconsistent and reports the app as "damaged and can't be opened" — a
// scary, seemingly unrecoverable dead end — instead of the normal,
// bypassable "unidentified developer" Gatekeeper prompt.
//
// A full *deep* ad-hoc signature (still free, no certificate needed) fixes
// the "damaged" report. It does not eliminate Gatekeeper's unsigned-app
// warning entirely — that requires a paid Apple Developer ID + notarization
// — but turns it into the standard, expected "click Open Anyway" flow.
const { execFileSync } = require('child_process');
const path = require('path');

module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  execFileSync('codesign', ['--deep', '--force', '--sign', '-', appPath], { stdio: 'inherit' });
};

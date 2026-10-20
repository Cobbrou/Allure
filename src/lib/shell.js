// Platform module for the native shell (Capacitor). Loaded only inside the app, never in
// the browser.

import { App } from '@capacitor/app';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';

/** Android back button: close an open sheet, else go back in the app, else leave it. */
export function initShell() {
  App.addListener('backButton', ({ canGoBack }) => {
    const sheet = document.querySelector('dialog[open]');
    if (sheet) sheet.close();
    else if (canGoBack && location.hash.replace(/^#\/?/, '')) history.back();
    else App.minimizeApp(); // like other Android apps: the recording, if any, keeps its state
  });
}

/** Status and navigation bar icons: dark on the light theme, light on the dark one. */
export const systemBars = (light) => SystemBars.setStyle({ style: light ? SystemBarsStyle.Light : SystemBarsStyle.Dark });

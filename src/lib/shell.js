// Platform module for the native shell (Capacitor). Loaded only inside the app, never in
// the browser.

import { App } from '@capacitor/app';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { go } from '../router.js';

// Launcher shortcuts (res/xml/shortcuts.xml) open "app.allure://record/sport/<sport>".
// Only that link is followed: any app can send one to the exported activity.
const openLink = (url) => {
  const sport = url?.match(/^app\.allure:\/\/record\/sport\/([a-z-]+)$/)?.[1];
  if (sport) go(`/record/sport/${sport}`);
};

/** Android back button: close an open sheet, else go back in the app, else leave it. */
export function initShell() {
  App.addListener('backButton', ({ canGoBack }) => {
    const sheet = document.querySelector('dialog[open]');
    if (sheet) sheet.close();
    else if (canGoBack && location.hash.replace(/^#\/?/, '')) history.back();
    else App.minimizeApp(); // like other Android apps: the recording, if any, keeps its state
  });
  App.addListener('appUrlOpen', ({ url }) => openLink(url)); // app already running
  App.getLaunchUrl().then((r) => openLink(r?.url)); // cold start
}

/** Status and navigation bar icons: dark on the light theme, light on the dark one. */
export const systemBars = (light) => SystemBars.setStyle({ style: light ? SystemBarsStyle.Light : SystemBarsStyle.Dark });

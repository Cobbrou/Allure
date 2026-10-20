// Platform module for Bluetooth sensors: a heart rate strap, or a watch broadcasting its heart
// rate, through Web Bluetooth (Chrome on Android and desktop; not iOS Safari). The Android
// WebView has no Web Bluetooth, so the native shell uses @capacitor-community/bluetooth-le.

import { t } from './i18n.js';
import { Capacitor } from '@capacitor/core';

/** Bpm from a Heart Rate Measurement (GATT 0x2A37) value: flag bit 0 says 8 or 16 bits. */
export function parseHeartRate(view) {
  return view.getUint8(0) & 1 ? view.getUint16(1, true) : view.getUint8(1);
}

export const hasBluetooth = () =>
  Capacitor.isNativePlatform() || (typeof navigator !== 'undefined' && !!navigator.bluetooth);

const RETRY_DELAYS = [1000, 3000, 10000]; // ms before each reconnect attempt after a drop

/**
 * Let the athlete pick a heart rate sensor and stream its bpm to onBpm. A dropped link
 * (out of range, a body shadowing the signal) is retried after each RETRY_DELAYS; onLost
 * fires once they all failed. Must run from a user gesture. Returns { name, disconnect }.
 * Closing the picker rejects with a NotFoundError, like Web Bluetooth.
 */
export async function connectHeartRate(onBpm, onLost) {
  let stopped = false;
  const onDrop = async () => {
    for (const delay of RETRY_DELAYS) {
      await new Promise((r) => setTimeout(r, delay));
      if (stopped) return;
      try { await link.subscribe(); return; } catch { /* next attempt */ }
    }
    if (!stopped) onLost();
  };
  const link = await (Capacitor.isNativePlatform() ? nativeLink : webLink)(onBpm, onDrop);
  await link.subscribe();
  return { name: link.name || t('Ceinture cardio'), disconnect: () => { stopped = true; link.disconnect(); } };
}

async function webLink(onBpm, onDrop) {
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
  device.addEventListener('gattserverdisconnected', onDrop);
  return {
    name: device.name,
    subscribe: async () => {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const ch = await service.getCharacteristic('heart_rate_measurement');
      ch.addEventListener('characteristicvaluechanged', (e) => onBpm(parseHeartRate(e.target.value)));
      await ch.startNotifications();
    },
    disconnect: () => device.gatt.disconnect(),
  };
}

/** Native shell: same flow, with the plugin's device picker dialog. */
async function nativeLink(onBpm, onDrop) {
  const { BleClient, numberToUUID } = await import('@capacitor-community/bluetooth-le');
  const HEART_RATE = numberToUUID(0x180d), MEASUREMENT = numberToUUID(0x2a37);
  await BleClient.initialize(); // asks for the Bluetooth (Android 12+) or location permission
  if (!(await BleClient.isEnabled())) await BleClient.requestEnable();
  await BleClient.setDisplayStrings({
    scanning: t('Recherche des capteurs…'), cancel: t('Annuler'),
    availableDevices: t('Capteurs disponibles'), noDeviceFound: t('Aucun capteur trouvé'),
  });
  const device = await BleClient.requestDevice({ services: [HEART_RATE] }).catch((e) => {
    if (/cancel/i.test(e.message)) e.name = 'NotFoundError';
    throw e;
  });
  return {
    name: device.name,
    subscribe: async () => {
      await BleClient.connect(device.deviceId, onDrop);
      await BleClient.startNotifications(device.deviceId, HEART_RATE, MEASUREMENT, (v) => onBpm(parseHeartRate(v)));
    },
    disconnect: () => BleClient.disconnect(device.deviceId),
  };
}

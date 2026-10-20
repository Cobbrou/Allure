// Platform module for Bluetooth sensors: a heart rate strap through Web Bluetooth (Chrome on
// Android and desktop; not iOS Safari). A native BLE plugin can replace it.

import { t } from './i18n.js';

/** Bpm from a Heart Rate Measurement (GATT 0x2A37) value: flag bit 0 says 8 or 16 bits. */
export function parseHeartRate(view) {
  return view.getUint8(0) & 1 ? view.getUint16(1, true) : view.getUint8(1);
}

export const hasBluetooth = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;

const RETRY_DELAYS = [1000, 3000, 10000]; // ms before each reconnect attempt after a drop

/**
 * Let the athlete pick a heart rate strap and stream its bpm to onBpm. A dropped link
 * (out of range, a body shadowing the signal) is retried after each RETRY_DELAYS; onLost
 * fires once they all failed. Must run from a user gesture. Returns { name, disconnect }.
 */
export async function connectHeartRate(onBpm, onLost) {
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
  let stopped = false;
  const subscribe = async () => {
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('heart_rate');
    const ch = await service.getCharacteristic('heart_rate_measurement');
    ch.addEventListener('characteristicvaluechanged', (e) => onBpm(parseHeartRate(e.target.value)));
    await ch.startNotifications();
  };
  device.addEventListener('gattserverdisconnected', async () => {
    for (const delay of RETRY_DELAYS) {
      await new Promise((r) => setTimeout(r, delay));
      if (stopped) return;
      try { await subscribe(); return; } catch { /* next attempt */ }
    }
    if (!stopped) onLost();
  });
  await subscribe();
  return { name: device.name || t('Ceinture cardio'), disconnect: () => { stopped = true; device.gatt.disconnect(); } };
}

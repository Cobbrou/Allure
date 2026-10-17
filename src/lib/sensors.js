// Platform module for Bluetooth sensors: a heart rate strap through Web Bluetooth (Chrome on
// Android and desktop; not iOS Safari). A native BLE plugin can replace it.

import { t } from './i18n.js';

/** Bpm from a Heart Rate Measurement (GATT 0x2A37) value: flag bit 0 says 8 or 16 bits. */
export function parseHeartRate(view) {
  return view.getUint8(0) & 1 ? view.getUint16(1, true) : view.getUint8(1);
}

export const hasBluetooth = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;

/**
 * Let the athlete pick a heart rate strap and stream its bpm to onBpm. onLost fires when
 * it disconnects. Must run from a user gesture. Returns { name, disconnect }.
 */
export async function connectHeartRate(onBpm, onLost) {
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
  device.addEventListener('gattserverdisconnected', onLost);
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService('heart_rate');
  const ch = await service.getCharacteristic('heart_rate_measurement');
  ch.addEventListener('characteristicvaluechanged', (e) => onBpm(parseHeartRate(e.target.value)));
  await ch.startNotifications();
  return { name: device.name || t('Ceinture cardio'), disconnect: () => device.gatt.disconnect() };
}

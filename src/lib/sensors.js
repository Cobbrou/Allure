// Platform module for Bluetooth sensors: a heart rate strap (or a watch broadcasting its heart
// rate), a bike cadence sensor or a power meter, through Web Bluetooth (Chrome on Android and
// desktop; not iOS Safari). The Android WebView has no Web Bluetooth, so the native shell uses
// @capacitor-community/bluetooth-le.

import { t } from './i18n.js';
import { Capacitor } from '@capacitor/core';

/** Bpm from a Heart Rate Measurement (GATT 0x2A37) value: flag bit 0 says 8 or 16 bits. */
export function parseHeartRate(view) {
  return view.getUint8(0) & 1 ? view.getUint16(1, true) : view.getUint8(1);
}

/** Crank data { revs, time } (time in 1/1024 s) from a CSC Measurement (0x2A5B), or null. */
export function parseCsc(view) {
  const flags = view.getUint8(0);
  if (!(flags & 2)) return null; // speed-only sensor
  const at = flags & 1 ? 7 : 1; // wheel data (uint32 revs + uint16 time) comes first
  return { revs: view.getUint16(at, true), time: view.getUint16(at + 2, true) };
}

/** { power (W), crank? } from a Cycling Power Measurement (0x2A63). */
export function parsePower(view) {
  const flags = view.getUint16(0, true);
  const power = view.getInt16(2, true);
  if (!(flags & 0x20)) return { power };
  // Optional fields before the crank data: pedal balance (1 byte), torque (2), wheel data (6).
  const at = 4 + (flags & 1 ? 1 : 0) + (flags & 4 ? 2 : 0) + (flags & 0x10 ? 6 : 0);
  return { power, crank: { revs: view.getUint16(at, true), time: view.getUint16(at + 2, true) } };
}

const STILL = 3; // readings in a row without a new crank turn before cadence drops to 0

/**
 * Turns successive crank samples into cadence (rpm). Both counters are uint16 and wrap.
 * Returns undefined while there is nothing new to say (first sample, a repeated one).
 */
export function cadenceMeter() {
  let prev = null, still = 0;
  return (crank) => {
    if (!crank) return undefined;
    const p = prev;
    prev = crank;
    if (!p) return undefined;
    const revs = (crank.revs - p.revs + 0x10000) % 0x10000;
    const dt = (crank.time - p.time + 0x10000) % 0x10000;
    if (!revs || !dt) return ++still >= STILL ? 0 : undefined;
    still = 0;
    return Math.round((revs * 60 * 1024) / dt);
  };
}

/** What each sensor kind reads: GATT service and characteristic, and a reader per connection. */
const KINDS = {
  hr: { service: 0x180d, characteristic: 0x2a37, get name() { return t('Ceinture cardio'); }, reader: () => (v) => ({ hr: parseHeartRate(v) }) },
  cadence: {
    service: 0x1816, characteristic: 0x2a5b, get name() { return t('Capteur de cadence'); },
    reader: () => { const cad = cadenceMeter(); return (v) => { const c = cad(parseCsc(v)); return c === undefined ? null : { cad: c }; }; },
  },
  power: {
    service: 0x1818, characteristic: 0x2a63, get name() { return t('Capteur de puissance'); },
    reader: () => {
      const cad = cadenceMeter();
      return (v) => { const { power, crank } = parsePower(v); const c = cad(crank); return c === undefined ? { power } : { power, cad: c }; };
    },
  },
};

export const hasBluetooth = () =>
  Capacitor.isNativePlatform() || (typeof navigator !== 'undefined' && !!navigator.bluetooth);

const RETRY_DELAYS = [1000, 3000, 10000]; // ms before each reconnect attempt after a drop

/**
 * Let the athlete pick a sensor of a kind ('hr' | 'cadence' | 'power') and stream its readings
 * ({ hr } | { cad } | { power, cad? }) to onData. A dropped link (out of range, a body
 * shadowing the signal) is retried after each RETRY_DELAYS; onLost fires once they all failed.
 * Must run from a user gesture. Returns { name, disconnect }.
 * Closing the picker rejects with a NotFoundError, like Web Bluetooth.
 */
export async function connectSensor(kind, onData, onLost) {
  const k = KINDS[kind];
  const read = k.reader();
  const onValue = (v) => { const d = read(v); if (d) onData(d); };
  let stopped = false;
  const onDrop = async () => {
    for (const delay of RETRY_DELAYS) {
      await new Promise((r) => setTimeout(r, delay));
      if (stopped) return;
      try { await link.subscribe(); return; } catch { /* next attempt */ }
    }
    if (!stopped) onLost();
  };
  const link = await (Capacitor.isNativePlatform() ? nativeLink : webLink)(k, onValue, onDrop);
  await link.subscribe();
  return { name: link.name || k.name, disconnect: () => { stopped = true; link.disconnect(); } };
}

async function webLink({ service, characteristic }, onValue, onDrop) {
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [service] }] });
  device.addEventListener('gattserverdisconnected', onDrop);
  return {
    name: device.name,
    subscribe: async () => {
      const server = await device.gatt.connect();
      const ch = await (await server.getPrimaryService(service)).getCharacteristic(characteristic);
      ch.addEventListener('characteristicvaluechanged', (e) => onValue(e.target.value));
      await ch.startNotifications();
    },
    disconnect: () => device.gatt.disconnect(),
  };
}

/** Native shell: same flow, with the plugin's device picker dialog. */
async function nativeLink({ service, characteristic }, onValue, onDrop) {
  const { BleClient, numberToUUID } = await import('@capacitor-community/bluetooth-le');
  const SERVICE = numberToUUID(service), CHARACTERISTIC = numberToUUID(characteristic);
  await BleClient.initialize(); // asks for the Bluetooth (Android 12+) or location permission
  if (!(await BleClient.isEnabled())) await BleClient.requestEnable();
  await BleClient.setDisplayStrings({
    scanning: t('Recherche des capteurs…'), cancel: t('Annuler'),
    availableDevices: t('Capteurs disponibles'), noDeviceFound: t('Aucun capteur trouvé'),
  });
  const device = await BleClient.requestDevice({ services: [SERVICE] }).catch((e) => {
    if (/cancel/i.test(e.message)) e.name = 'NotFoundError';
    throw e;
  });
  return {
    name: device.name,
    subscribe: async () => {
      await BleClient.connect(device.deviceId, onDrop);
      await BleClient.startNotifications(device.deviceId, SERVICE, CHARACTERISTIC, onValue);
    },
    disconnect: () => BleClient.disconnect(device.deviceId),
  };
}

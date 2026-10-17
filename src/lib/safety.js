// Safety check-in while recording: when the athlete stops moving for too long, ask whether
// all is well, then prepare an alert to their emergency contacts with the last position.
// Pure logic; the SMS itself is opened by the page (no backend can send it for them yet).

import { locale, t } from './i18n.js';

export const STILL_AFTER = 5 * 60000; // ms without moving before the check-in question
export const GRACE = 60000; // ms to answer before the alert

/**
 * Check-in stage at `now`: null (all good), { stage: 'ask', left } (seconds left to answer)
 * or { stage: 'alert' }. okAt: when the athlete last answered "all good". A manual pause is
 * a deliberate stop, so it never triggers a check-in.
 */
export function checkIn(rec, now, okAt = 0, { after = STILL_AFTER, grace = GRACE } = {}) {
  if (!rec || rec.paused) return null;
  const still = now - Math.max(rec.lastMove, okAt);
  if (still < after) return null;
  if (still < after + grace) return { stage: 'ask', left: Math.ceil((after + grace - still) / 1000) };
  return { stage: 'alert' };
}

const hhmm = (t) => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

/** Alert text for the contacts: how long the athlete has been still (or an SOS), and a map link. */
export function alertText(rec, now, sos = false) {
  const min = Math.max(1, Math.round((now - rec.lastMove) / 60000));
  const where = rec.pos
    ? t('Dernière position ({time}) : {url}', { time: hhmm(rec.pos.time), url: `https://www.openstreetmap.org/?mlat=${rec.pos.lat.toFixed(5)}&mlon=${rec.pos.lon.toFixed(5)}#map=17/${rec.pos.lat.toFixed(5)}/${rec.pos.lon.toFixed(5)}` })
    : t('Position GPS indisponible.');
  const what = sos ? t("j'ai besoin d'aide pendant ma sortie.") : t("je ne bouge plus depuis {min} min pendant ma sortie et je n'ai pas répondu.", { min });
  return t('Alerte Allure : {what} {where}', { what, where });
}

/** Normalized phone number: digits and a leading +, or null when too short to dial. */
export function cleanPhone(raw) {
  const p = String(raw).trim().replace(/(?!^\+)[^\d]/g, '');
  return p.replace(/\D/g, '').length >= 3 ? p : null;
}

// ponytail: `?body=` is what Android expects; recent iOS accepts it too, older iOS wanted `&body=`.
/** sms: link to every contact with the message pre-filled. */
export const smsUrl = (contacts, body) => `sms:${contacts.map((c) => c.phone).join(',')}?body=${encodeURIComponent(body)}`;

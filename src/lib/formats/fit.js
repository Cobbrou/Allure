import { t } from '../i18n.js';
import { Decoder, Stream } from '@garmin/fitsdk';

const SEMICIRCLE = 180 / 2 ** 31;

/**
 * Parse a binary FIT activity (Garmin, Coros, Wahoo…) into { type, points, laps }. laps: start times, ms.
 * Without GPS (treadmill, home trainer, pool): { type, samples, distance, movingTime, laps } instead,
 * samples being { time, hr, dist, power? } and the totals taken from the session.
 */
export function parseFit(bytes) {
  const decoder = new Decoder(Stream.fromByteArray(bytes));
  if (!decoder.isFIT()) throw new Error('Fichier FIT invalide.');
  const { messages, errors } = decoder.read();
  const records = messages.recordMesgs ?? [];
  if (errors.length && !records.length) throw new Error(`Fichier FIT illisible : ${errors[0].message}`);
  const points = records
    .filter((r) => r.positionLat != null && r.positionLong != null)
    .map((r) => ({
      lat: r.positionLat * SEMICIRCLE,
      lon: r.positionLong * SEMICIRCLE,
      ele: r.enhancedAltitude ?? r.altitude ?? null,
      time: r.timestamp ? +r.timestamp : null,
      hr: r.heartRate ?? null,
      ...(r.power != null && { power: r.power }),
    }));
  const laps = (messages.lapMesgs ?? []).map((l) => +l.startTime).filter(Number.isFinite);
  const session = messages.sessionMesgs?.[0];
  if (points.length >= 2) return { type: session?.sport, points, laps };
  const samples = records
    .filter((r) => r.timestamp)
    .map((r) => ({ time: +r.timestamp, hr: r.heartRate ?? null, dist: r.distance ?? null, ...(r.power != null && { power: r.power }) }));
  if (samples.length < 2) throw new Error(t('Aucune donnée exploitable dans ce fichier.'));
  return { type: session?.sport, samples, distance: session?.totalDistance, movingTime: session?.totalTimerTime, laps };
}

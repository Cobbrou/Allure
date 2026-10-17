import { t } from '../i18n.js';
import { Decoder, Stream } from '@garmin/fitsdk';

const SEMICIRCLE = 180 / 2 ** 31;

/** Parse a binary FIT activity (Garmin, Coros, Wahoo…) into { type, points, laps }. laps: start times, ms. */
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
  if (points.length < 2) throw new Error(t('Aucun point GPS dans ce fichier FIT (activité en salle ?).'));
  const laps = (messages.lapMesgs ?? []).map((l) => +l.startTime).filter(Number.isFinite);
  return { type: messages.sessionMesgs?.[0]?.sport, points, laps };
}

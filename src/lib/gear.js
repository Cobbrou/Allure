// Gear: shoes and bikes, with the distance done on them.
// Gear: { id, name, kind: 'shoes' | 'bike', initial (m done before Allure), alert (m | null),
//         isDefault (assigned to new activities of its sports), retired }.
// Activities point to it with `meta.gear` (id).

import { t } from './i18n.js';

// alert: default distance after which shoes should be replaced.
export const GEAR_KINDS = {
  shoes: { get label() { return t('Chaussures'); }, icon: '👟', sports: ['run', 'hike', 'walk'], alert: 700_000 },
  bike: { get label() { return t('Vélo|matériel'); }, icon: '🚲', sports: ['ride'], alert: null },
};

/** Distance (initial included), activity count, moving time and last use of one gear. */
export function gearUsage(gear, metas) {
  const used = metas.filter((m) => m.gear === gear.id);
  return {
    distance: (gear.initial ?? 0) + used.reduce((s, m) => s + m.distance, 0),
    count: used.length,
    movingTime: used.reduce((s, m) => s + (m.movingTime ?? 0), 0),
    last: used.reduce((t, m) => Math.max(t, m.date), 0) || null,
  };
}

/** Active gear usable for `sport`. */
export const gearFor = (gears, sport) => gears.filter((g) => !g.retired && GEAR_KINDS[g.kind]?.sports.includes(sport));

/** Id of the default gear for `sport`, or undefined. */
export const defaultGear = (gears, sport) => gearFor(gears, sport).find((g) => g.isDefault)?.id;

/** Make `id` the default of its kind (one default per kind), or clear it if it already is. */
export function toggleDefault(gears, id) {
  const target = gears.find((g) => g.id === id);
  return gears.map((g) => (g.kind !== target.kind ? g : { ...g, isDefault: g.id === id && !target.isDefault }));
}

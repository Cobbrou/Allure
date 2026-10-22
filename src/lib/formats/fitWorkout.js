import { Encoder, Profile } from '@garmin/fitsdk';
import { t } from '../i18n.js';
import { stepLabel } from '../workout.js';

const INTENSITY = { warmup: 'warmup', work: 'active', rest: 'recovery', walk: 'recovery', cooldown: 'cooldown' };

/**
 * A started workout (lib/workout.js startWorkout: steps with resolved pace ranges) as a FIT
 * workout file for a watch. Steps are written flat, no repeat steps; a pace range becomes a
 * speed target, an RPE goes into the step name. Raw FIT units: ms, cm, mm/s.
 */
export function workoutFit(w, now = Date.now()) {
  const e = new Encoder();
  e.onMesg(Profile.MesgNum.FILE_ID, { type: 'workout', manufacturer: 'development', product: 0, serialNumber: 1, timeCreated: new Date(now) });
  e.onMesg(Profile.MesgNum.WORKOUT, { sport: 'running', subSport: 'generic', numValidSteps: w.steps.length, wktName: (w.name ?? 'Allure').slice(0, 15) });
  w.steps.forEach((s, i) => {
    const range = s.target?.range, rpe = s.target?.rpe;
    e.onMesg(Profile.MesgNum.WORKOUT_STEP, {
      messageIndex: i,
      wktStepName: `${rpe ? `${t('RPE {n}', { n: rpe })} ` : ''}${stepLabel(s, w.reps)}`.slice(0, 15), // RPE first: names are cut
      durationType: s.type === 'time' ? 'time' : 'distance',
      durationValue: Math.round(s.type === 'time' ? s.value * 1000 : s.value * 100),
      intensity: INTENSITY[s.kind],
      ...(range
        ? { targetType: 'speed', targetValue: 0, customTargetValueLow: Math.round(1e6 / range[1]), customTargetValueHigh: Math.round(1e6 / range[0]) }
        : { targetType: 'open' }),
    });
  });
  return e.close();
}

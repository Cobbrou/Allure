import { t } from '../lib/i18n.js';
import { useState } from 'react';
import { manualActivity } from '../lib/activity.js';
import { saveActivities, updateActivity } from '../lib/db.js';
import { distLen, distUnit, elevLen, elevUnit, shortLen, shortUnit } from '../lib/format.js';
import { SPORTS } from '../lib/sports.js';
import { rpeLabel } from '../lib/training.js';
import { back } from '../router.js';

// "2026-10-20T07:30" in local time, the value format of <input type="datetime-local">.
const localInput = (ms) => new Date(ms - new Date(ms).getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
const num = (v) => Number(String(v).replace(',', '.')) || 0;

/**
 * Add an activity without GPS (gym, treadmill, pool…), or edit the numbers of one (id).
 * onSaved(id) runs once it is stored.
 */
export default function ManualPage({ id, activities, onSaved }) {
  const old = id && activities?.find((a) => a.id === id);
  if (id && !old) return <Top title={t('Activité manuelle')} to="/" />;
  return <Form old={old} onSaved={onSaved} />;
}

function Form({ old, onSaved }) {
  const [sport, setSport] = useState(old?.sport ?? 'run');
  const [name, setName] = useState(old?.name ?? '');
  const [date, setDate] = useState(localInput(old?.date ?? Date.now()));
  const time = old?.movingTime ?? 0;
  const [h, setH] = useState(time ? String(Math.floor(time / 3600)) : '');
  const [min, setMin] = useState(time ? String(Math.floor(time / 60) % 60) : '');
  const [sec, setSec] = useState(time ? String(Math.round(time % 60)) : '');
  const swim = SPORTS[sport].display === 'pace100';
  const len = swim ? shortLen() : distLen(), unit = swim ? shortUnit() : distUnit();
  const [dist, setDist] = useState(old?.distance ? String(+(old.distance / len).toFixed(2)) : '');
  const [gain, setGain] = useState(old?.gain ? String(Math.round(old.gain / elevLen())) : '');
  const [rpe, setRpe] = useState(old?.rpe ?? 0); // 0: not set
  const movingTime = num(h) * 3600 + num(min) * 60 + num(sec);
  const when = new Date(date).getTime();
  const valid = movingTime > 0 && Number.isFinite(when);

  const save = async (e) => {
    e.preventDefault();
    const { meta, points } = manualActivity({
      id: old?.id, name: name.trim(), sport, date: when, movingTime,
      distance: num(dist) * len, gain: swim || !gain ? null : num(gain) * elevLen(), rpe,
    });
    // Editing keeps what the numbers don't cover: description, notes, gear.
    if (old) await updateActivity({ ...old, ...meta, rpe: rpe || undefined });
    else await saveActivities([{ meta, points }]);
    onSaved(meta.id);
  };

  return (
    <>
      <Top title={t(old ? 'Modifier les chiffres' : 'Activité manuelle')} to={old ? `/activity/${old.id}` : '/record'} />
      <main className="detail">
        <form className="card edit" onSubmit={save}>
          <fieldset>
            <legend>{t('Sport')}</legend>
            <div className="sport-picker">
              {Object.entries(SPORTS).map(([sid, s]) => (
                <label key={sid} className={sid === sport ? 'selected' : ''}>
                  <input type="radio" name="sport" value={sid} checked={sid === sport} onChange={() => setSport(sid)} />
                  <span>{s.icon}</span>{s.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label>{t('Titre')}
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={t('Séance de fractionné, tapis…')} />
          </label>
          <label>{t('Date et heure de départ')}
            <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <fieldset>
            <legend>{t('Durée')}</legend>
            <div className="duration-fields">
              <label><input inputMode="numeric" value={h} onChange={(e) => setH(e.target.value)} placeholder="0" aria-label={t('Heures')} />h</label>
              <label><input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} placeholder="0" aria-label={t('Minutes')} />min</label>
              <label><input inputMode="numeric" value={sec} onChange={(e) => setSec(e.target.value)} placeholder="0" aria-label={t('Secondes')} />s</label>
            </div>
          </fieldset>
          <label>{t('Distance ({unit}, facultatif)', { unit })}
            <input inputMode="decimal" value={dist} onChange={(e) => setDist(e.target.value)} placeholder="0" />
          </label>
          {!swim && (
            <label>{t('Dénivelé positif ({unit}, facultatif)', { unit: elevUnit() })}
              <input inputMode="numeric" value={gain} onChange={(e) => setGain(e.target.value)} placeholder="0" />
            </label>
          )}
          <label>
            <span>{t('Effort perçu')} · <b>{rpe ? `${rpe}/10 ${rpeLabel(rpe)}` : t('Non renseigné')}</b></span>
            <input type="range" min={0} max={10} step={1} value={rpe} onChange={(e) => setRpe(Number(e.target.value))}
              aria-valuetext={rpe ? `${rpe}/10 ${rpeLabel(rpe)}` : t('Non renseigné')} />
            <span className="hint">{t('Sans cardio, c’est lui qui compte dans ta forme.')}</span>
          </label>
          <button type="submit" disabled={!valid}>{t(old ? 'Enregistrer' : "Ajouter l'activité")}</button>
        </form>
      </main>
    </>
  );
}

function Top({ title, to }) {
  return (
    <header className="topbar">
      <a className="back" href={`#${to}`} aria-label={t('Retour')} onClick={(e) => { e.preventDefault(); back(to); }}>‹</a>
      <h1>{title}</h1>
      <span className="back" aria-hidden="true" />
    </header>
  );
}

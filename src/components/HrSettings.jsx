import { t } from '../lib/i18n.js';
import { useEffect, useState } from 'react';
import { isImperial, parseNum } from '../lib/format.js';

const LB = 2.20462; // pounds per kg: weight is stored in kg

/** Max and resting heart rate, FTP, weight. Empty fields fall back to the estimate from history. */
export default function HrSettings({ hr, ftpEstimate, saved, onSave }) {
  const [max, setMax] = useState(saved?.max ?? '');
  const [rest, setRest] = useState(saved?.rest ?? '');
  const [ftp, setFtp] = useState(saved?.ftp ?? '');
  const k = isImperial() ? LB : 1;
  const shownWeight = (w) => (w ? String(Math.round(w * k)) : '');
  const [weight, setWeight] = useState(shownWeight(saved?.weight));
  const [done, setDone] = useState(false);
  useEffect(() => { setMax(saved?.max ?? ''); setRest(saved?.rest ?? ''); setFtp(saved?.ftp ?? ''); setWeight(shownWeight(saved?.weight)); }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps -- k follows the units, which remount the page
  const num = (v, lo, hi) => (v === '' ? undefined : Math.min(hi, Math.max(lo, Math.round(parseNum(v)))));
  const submit = async (e) => {
    e.preventDefault();
    const kg = weight === '' ? undefined : Math.round(Math.min(250, Math.max(30, Number(weight) / k)) * 10) / 10;
    await onSave({ max: num(max, 120, 230), rest: num(rest, 30, 100), ftp: num(ftp, 50, 600), weight: kg });
    setDone(true);
  };
  return (
    <form className="card edit hr-settings" onSubmit={submit}>
      <h3>{t('Cardio et puissance')}</h3>
      <p className="muted">{t("La FC sert aux zones cardio, à l'effort relatif et à la courbe de forme ; la FTP à l'intensité et à la charge des sorties vélo ; le poids aux calories.")}</p>
      <details>
      <summary className="muted">{t('Ajuster manuellement')}</summary>
      <div className="row">
        <label>{t('FC max')}
          <input type="number" inputMode="numeric" min="120" max="230" placeholder={t('{n} (estimée)', { n: hr.max })} value={max}
            onChange={(e) => { setMax(e.target.value); setDone(false); }} />
        </label>
        <label>{t('FC repos')}
          <input type="number" inputMode="numeric" min="30" max="100" placeholder={hr.restFromWatch ? t('{n} (montre)', { n: hr.rest }) : String(hr.rest)} value={rest}
            onChange={(e) => { setRest(e.target.value); setDone(false); }} />
        </label>
        <label>{t('FTP (W)')}
          <input type="number" inputMode="numeric" min="50" max="600" placeholder={ftpEstimate ? t('{n} (estimée)', { n: ftpEstimate }) : t('Auto')} value={ftp}
            onChange={(e) => { setFtp(e.target.value); setDone(false); }} />
        </label>
        <label>{t(isImperial() ? 'Poids (lb)' : 'Poids (kg)')}
          <input type="number" inputMode="decimal" min={Math.round(30 * k)} max={Math.round(250 * k)} placeholder="—" value={weight}
            onChange={(e) => { setWeight(e.target.value); setDone(false); }} />
        </label>
      </div>
      <div className="row"><button type="submit">{t(done ? 'Enregistré ✓' : 'Enregistrer')}</button></div>
      </details>
    </form>
  );
}

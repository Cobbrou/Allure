import { useEffect, useState } from 'react';

/** Max and resting heart rate, FTP. Empty fields fall back to the estimate from history. */
export default function HrSettings({ hr, ftpEstimate, saved, onSave }) {
  const [max, setMax] = useState(saved?.max ?? '');
  const [rest, setRest] = useState(saved?.rest ?? '');
  const [ftp, setFtp] = useState(saved?.ftp ?? '');
  const [done, setDone] = useState(false);
  useEffect(() => { setMax(saved?.max ?? ''); setRest(saved?.rest ?? ''); setFtp(saved?.ftp ?? ''); }, [saved]);
  const num = (v, lo, hi) => (v === '' ? undefined : Math.min(hi, Math.max(lo, Math.round(Number(v)))));
  const submit = async (e) => {
    e.preventDefault();
    await onSave({ max: num(max, 120, 230), rest: num(rest, 30, 100), ftp: num(ftp, 50, 600) });
    setDone(true);
  };
  return (
    <form className="card edit hr-settings" onSubmit={submit}>
      <h3>Cardio et puissance</h3>
      <p className="muted">La FC sert aux zones cardio, à l'effort relatif et à la courbe de forme ; la FTP à l'intensité et à la charge des sorties vélo.</p>
      <div className="row">
        <label>FC max
          <input type="number" inputMode="numeric" min="120" max="230" placeholder={`${hr.max} (estimée)`} value={max}
            onChange={(e) => { setMax(e.target.value); setDone(false); }} />
        </label>
        <label>FC repos
          <input type="number" inputMode="numeric" min="30" max="100" placeholder={String(hr.rest)} value={rest}
            onChange={(e) => { setRest(e.target.value); setDone(false); }} />
        </label>
        <label>FTP (W)
          <input type="number" inputMode="numeric" min="50" max="600" placeholder={ftpEstimate ? `${ftpEstimate} (estimée)` : 'Auto'} value={ftp}
            onChange={(e) => { setFtp(e.target.value); setDone(false); }} />
        </label>
      </div>
      <div className="row"><button type="submit">{done ? 'Enregistré ✓' : 'Enregistrer'}</button></div>
    </form>
  );
}

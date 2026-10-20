import { t } from '../lib/i18n.js';
import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { bestCurve, CURVE, trainingStress } from '../lib/power.js';
import { ACCENT, GRID, AXIS, TICK, BG, TEXT, PREVIOUS } from '../theme.js';

const LABEL = { 5: '5 s', 15: '15 s', 30: '30 s', 60: '1 min', 120: '2 min', 300: '5 min', 600: '10 min', 1200: '20 min', 1800: '30 min', 3600: '1 h' };
const RECENT = 90 * 86400e3;

/**
 * Power analysis. With `meta`: one ride's power numbers and curve against the 90-day best.
 * Without: the athlete's 90-day best curve and FTP (profile). Hidden without power.
 * `ftp` is { watts, manual } (manual = set in Settings) or null.
 */
export default function PowerCurve({ meta, activities, ftp }) {
  const best = useMemo(() => bestCurve((activities ?? []).filter((a) => a.date > Date.now() - RECENT)), [activities]);
  const curve = meta ? meta.powerCurve : best;
  if (!curve || !Object.keys(curve).length) return null;
  const data = CURVE.filter((d) => curve[d] || best[d]).map((d) => ({ d: LABEL[d], w: curve[d], best: meta ? best[d] : undefined }));
  const stress = meta && trainingStress(meta.np, meta.movingTime, ftp?.watts);

  return (
    <section className="card">
      <h3>{t(meta ? 'Puissance' : 'Courbe de puissance')}
        {meta && <><span className="legend power">{t('Cette sortie')}</span> <span className="legend best">{t('Meilleur 90 j')}</span></>}
      </h3>
      <div className="totals">
        {meta ? (
          <>
            <div><span>{t('Moyenne')}</span><b>{meta.avgPower} <small>W</small></b></div>
            <div><span>{t('Normalisée')}</span><b>{meta.np ?? '—'} <small>W</small></b></div>
            <div><span>{t('Intensité')}</span><b>{stress ? stress.intensity.toFixed(2) : '—'}</b></div>
            <div><span>{t('Charge (TSS)')}</span><b>{stress?.tss ?? '—'}</b></div>
          </>
        ) : (
          <>
            <div><span>{t(ftp?.manual ? 'FTP' : 'FTP estimée')}</span><b>{ftp?.watts ?? '—'} <small>W</small></b></div>
            <div><span>{t('Meilleur 5 min')}</span><b>{best[300] ?? '—'} <small>W</small></b></div>
          </>
        )}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="d" stroke={AXIS} tick={{ fill: TICK, fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis stroke={AXIS} tick={{ fill: TICK, fontSize: 12 }} width={36} />
          <Tooltip contentStyle={{ background: BG, border: `1px solid ${GRID}`, borderRadius: 8 }} labelStyle={{ color: TEXT }}
            formatter={(v, k) => [`${v} W`, t(k === 'w' && meta ? 'Cette sortie' : 'Meilleur 90 j')]} />
          {meta && <Line dataKey="best" stroke={PREVIOUS} strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
          <Line dataKey="w" stroke={ACCENT} strokeWidth={2.5} dot={{ r: 2.5, fill: ACCENT }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="muted small-label">
        {meta ? (ftp ? t(ftp.manual ? 'Intensité et charge calculées sur une FTP de {w} W.' : 'Intensité et charge calculées sur une FTP estimée à {w} W.', { w: ftp.watts }) : t("Une sortie de 20 min avec capteur permet d'estimer ta FTP."))
          : t(ftp?.manual ? 'FTP saisie dans les réglages.' : 'FTP : 95 % de ta meilleure puissance sur 20 min ces 90 derniers jours.')}
      </p>
    </section>
  );
}

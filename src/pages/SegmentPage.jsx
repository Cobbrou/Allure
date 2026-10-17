import { locale, t, tn } from '../lib/i18n.js';
import { useMemo, useRef } from 'react';
import ConfirmButton from '../components/ConfirmButton.jsx';
import TrackMap from '../components/TrackMap.jsx';
import { distUnit, elevUnit, fmtDist, fmtDuration, fmtElev } from '../lib/format.js';
import { leaderboard } from '../lib/segments.js';
import { effort, SPORTS } from '../lib/sports.js';
import { back } from '../router.js';

/** One segment: map, profile numbers and the athlete's efforts, fastest first. */
export default function SegmentPage({ id, segments, activities, onDelete }) {
  const seg = segments?.find((s) => s.id === id);
  const track = useMemo(() => seg?.points.map(([lon, lat]) => ({ lon, lat })), [seg]);
  const board = useMemo(() => (seg ? leaderboard(seg, activities ?? []) : []), [seg, activities]);
  const hover = useRef(() => {});

  const top = (
    <header className="topbar">
      <a className="back" href="#/profile" aria-label={t('Retour')} onClick={(e) => { e.preventDefault(); back('/profile'); }}>‹</a>
      <h1>{t('Segment')}</h1>
      <span className="back" aria-hidden="true" />
    </header>
  );
  if (!segments) return top;
  if (!seg) return (<>{top}<p className="empty">{t('Segment introuvable.')}</p></>);

  return (
    <>
      {top}
      <main className="detail">
        <div className="title">
          <span className="sport-icon">{SPORTS[seg.sport]?.icon}</span>
          <div>
            <h1>{seg.name}</h1>
            <p>{SPORTS[seg.sport]?.label} · {tn(board.length, '{n} passage', '{n} passages')}</p>
          </div>
        </div>
        <section className="card">
          <div className="totals seg-totals">
            <div><span>{t('Distance')}</span><b>{fmtDist(seg.distance)} <small>{distUnit()}</small></b></div>
            <div><span>{t('Pente moy.')}</span><b>{seg.grade != null ? seg.grade.toFixed(1) : '—'} <small>%</small></b></div>
            <div><span>{t('Dénivelé')}</span><b>{seg.gain != null ? fmtElev(seg.gain) : '—'} <small>{elevUnit()}</small></b></div>
          </div>
        </section>
        <section className="card map-card"><TrackMap track={track} hover={hover} /></section>
        <section className="card">
          <h3>{t('Mes passages')}</h3>
          {board.length ? (
            <ol className="records leaderboard">
              {board.map((b, i) => {
                const e = effort(seg.sport, b.time / (seg.distance / 1000));
                return (
                  <li key={`${b.meta.id}/${b.from}`}>
                    <a href={`#/activity/${b.meta.id}`}>
                      <span className={`rank ${i === 0 ? 'first' : ''}`}>{i + 1}</span>
                      <span className="muted">{new Date(b.meta.date).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                    </a>
                    <a href={`#/activity/${b.meta.id}`}>
                      <b>{fmtDuration(b.time)}</b>
                      <span className="muted">{e.value} {e.unit}</span>
                    </a>
                  </li>
                );
              })}
            </ol>
          ) : <p className="muted">{t("Aucun passage pour l'instant.")}</p>}
        </section>
        <ConfirmButton onConfirm={onDelete} confirmLabel={t('Confirmer la suppression')}>{t('Supprimer le segment')}</ConfirmButton>
      </main>
    </>
  );
}

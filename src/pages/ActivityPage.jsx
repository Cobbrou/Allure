import { t } from '../lib/i18n.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtDate } from '../components/ActivityCard.jsx';
import BestEfforts from '../components/BestEfforts.jsx';
import BottomSheet from '../components/BottomSheet.jsx';
import ConfirmButton from '../components/ConfirmButton.jsx';
import HrZones from '../components/HrZones.jsx';
import Intervals from '../components/Intervals.jsx';
import MatchedActivities from '../components/MatchedActivities.jsx';
import Photos from '../components/Photos.jsx';
import PowerCurve from '../components/PowerCurve.jsx';
import ProfileChart from '../components/ProfileChart.jsx';
import SegmentEfforts from '../components/SegmentEfforts.jsx';
import ShareSheet from '../components/ShareSheet.jsx';
import SplitsTable from '../components/SplitsTable.jsx';
import StatsGrid from '../components/StatsGrid.jsx';
import TrackMap from '../components/TrackMap.jsx';
import { analyze, computeSplits } from '../lib/analyze.js';
import { deleteActivities, getActivity, getPhotos, setPhotos, updateActivity } from '../lib/db.js';
import { defaultGear, GEAR_KINDS, gearFor } from '../lib/gear.js';
import { SPORTS, splitSize as splitSizeOf } from '../lib/sports.js';
import { rpeLabel } from '../lib/training.js';
import { toGpx } from '../lib/formats/gpxExport.js';
import { safeName, shareFile } from '../lib/share.js';
import { go } from '../router.js';

export default function ActivityPage({ id, activities, hr, ftp, zones, segments, onSegment, gears, onChange }) {
  const [data, setData] = useState(); // undefined: loading, null: not found
  const [sheet, setSheet] = useState(null); // null | 'edit' | 'share'
  const [photos, setPhotoList] = useState([]);
  const hover = useRef(() => {});
  const range = useRef(() => {});

  useEffect(() => {
    getActivity(id).then((d) => setData(d ?? null), () => setData(null));
    getPhotos(id).then(setPhotoList, () => setPhotoList([]));
  }, [id]);
  // Keyed on points only, so renaming doesn't rebuild the map and chart.
  const sport = data?.meta.sport;
  const analysis = useMemo(() => data && analyze(data.points, sport), [data?.points, sport]);
  const splitSize = splitSizeOf(sport);
  const splits = useMemo(() => analysis && computeSplits(analysis.track, splitSize, sport), [analysis, splitSize, sport]);

  if (data === undefined) return (<><TopBar /><DetailSkeleton /></>);
  if (data === null) return (<><TopBar /><p className="empty">{t('Activité introuvable.')}</p></>);

  const act = { ...analysis, ...data.meta };
  const gear = gears.find((g) => g.id === data.meta.gear);

  const save = async (patch) => {
    const meta = { ...data.meta, ...patch };
    // Another sport, another moving threshold: moving time and pace follow.
    if (meta.sport !== data.meta.sport) {
      const { movingTime, avgPace } = analyze(data.points, meta.sport);
      Object.assign(meta, { movingTime, avgPace });
    }
    await updateActivity(meta);
    setData({ ...data, meta });
    setSheet(null);
    onChange();
  };
  const remove = async () => {
    await deleteActivities([id]);
    await onChange();
    go('/');
  };
  const savePhotos = async (blobs) => { await setPhotos(id, blobs); setPhotoList(blobs); };
  const exportGpx = async () => {
    await shareFile(new Blob([toGpx(data.meta, data.points)], { type: 'application/gpx+xml' }), `${safeName(act.name)}.gpx`);
    setSheet(null);
  };

  return (
    <>
      <TopBar>
        <button className="ghost small" onClick={() => setSheet('edit')}>{t('Modifier')}</button>
        <button className="small" onClick={() => setSheet('share')}>{t('Partager')}</button>
      </TopBar>
      <BottomSheet open={sheet === 'edit'} onClose={() => setSheet(null)} title={t("Modifier l'activité")}>
        <EditForm meta={data.meta} gears={gears} onSave={save} onDelete={remove} />
      </BottomSheet>
      <ShareSheet act={act} zones={zones} photos={photos} open={sheet === 'share'} onClose={() => setSheet(null)}>
        <button type="button" className="ghost" onClick={exportGpx}>{t('Fichier GPX')}</button>
      </ShareSheet>
      <main className="detail">
        <div className="title">
          <span className="sport-icon">{SPORTS[act.sport]?.icon}</span>
          <div>
            <h1>{act.name}</h1>
            <p>{SPORTS[act.sport]?.label} · {fmtDate(act.date)}{gear && ` · ${GEAR_KINDS[gear.kind].icon} ${gear.name}`}</p>
          </div>
        </div>
        {act.description && <p className="description">{act.description}</p>}
        {act.notes && <p className="description notes"><b>{t('Notes privées')} · </b>{act.notes}</p>}
        <StatsGrid act={act} />
        <section className="card map-card">
          <TrackMap track={act.track} hover={hover} range={range} />
        </section>
        <Photos photos={photos} onChange={savePhotos} />
        <Intervals meta={data.meta} track={act.track} range={range} />
        <SegmentEfforts meta={activities?.find((a) => a.id === id) ?? data.meta} track={act.track} segments={segments}
          activities={activities} range={range} onCreate={onSegment} />
        <section className="card">
          <h3>{t('Profil')} <span className="legend ele">{t('Altitude')}</span> <span className="legend hr">{t('Cardio')}</span></h3>
          <ProfileChart track={act.track} hover={hover} />
        </section>
        <HrZones hist={data.meta.hrTime} hr={hr} />
        {data.meta.powerCurve && <PowerCurve meta={data.meta} activities={activities} ftp={ftp} />}
        <SplitsTable splits={splits} sport={act.sport} size={splitSize} />
        <BestEfforts meta={data.meta} activities={activities} />
        <MatchedActivities meta={data.meta} activities={activities} />
      </main>
    </>
  );
}

function TopBar({ children }) {
  return (
    <header className="topbar">
      <a className="back" href="#/" aria-label={t('Retour aux activités')}>‹</a>
      <div className="actions">{children}</div>
    </header>
  );
}

function EditForm({ meta, gears, onSave, onDelete }) {
  const [name, setName] = useState(meta.name);
  const [sport, setSport] = useState(meta.sport);
  const [gear, setGear] = useState(meta.gear ?? '');
  const [description, setDescription] = useState(meta.description ?? '');
  const [notes, setNotes] = useState(meta.notes ?? '');
  const [rpe, setRpe] = useState(meta.rpe ?? 0); // 0: not set
  // Active gear for the chosen sport, plus the current one even if retired.
  const options = gearFor(gears, sport);
  const current = gears.find((g) => g.id === meta.gear);
  if (current && !options.includes(current) && GEAR_KINDS[current.kind].sports.includes(sport)) options.push(current);
  // Gear that doesn't fit a newly picked sport gives way to that sport's default.
  const gearId = !gear || options.some((g) => g.id === gear) ? gear : (defaultGear(gears, sport) ?? '');
  return (
    <form className="card edit" onSubmit={(e) => { e.preventDefault(); onSave({ name: name.trim() || meta.name, sport, gear: gearId || undefined, description: description.trim() || undefined, notes: notes.trim() || undefined, rpe: rpe || undefined }); }}>
      <label>
        {t('Titre')}
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </label>
      <label>
        {t('Description')}
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} placeholder={t('Comment ça s’est passé ?')} />
      </label>
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
      {options.length > 0 && (
        <label>{t('Matériel')}
          <select value={gearId} onChange={(e) => setGear(e.target.value)}>
            <option value="">{t('Aucun')}</option>
            {options.map((g) => <option key={g.id} value={g.id}>{GEAR_KINDS[g.kind].icon} {g.name}{g.retired ? t(' (retiré)') : ''}</option>)}
          </select>
        </label>
      )}
      <label>
        <span>{t('Effort perçu')} · <b>{rpe ? `${rpe}/10 ${rpeLabel(rpe)}` : t('Non renseigné')}</b></span>
        <input type="range" min={0} max={10} step={1} value={rpe} onChange={(e) => setRpe(Number(e.target.value))}
          aria-valuetext={rpe ? `${rpe}/10 ${rpeLabel(rpe)}` : t('Non renseigné')} />
        <span className="hint">{t('Compte dans ta forme quand il n’y a pas de cardio.')}</span>
      </label>
      <label>
        {t('Notes privées')}
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={2} placeholder={t('Sensations, météo, nutrition…')} />
        <span className="hint">{t('Jamais partagées ni exportées.')}</span>
      </label>
      <div className="edit-actions">
        <ConfirmButton onConfirm={onDelete} confirmLabel={t('Confirmer')}>{t('Supprimer')}</ConfirmButton>
        <button type="submit">{t('Enregistrer')}</button>
      </div>
    </form>
  );
}

function DetailSkeleton() {
  return (
    <main className="detail" aria-busy="true">
      <div className="skeleton" style={{ height: 52 }} />
      <div className="skeleton" style={{ height: 96 }} />
      <div className="bento">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 84 }} />)}</div>
      <div className="skeleton" style={{ height: 320 }} />
    </main>
  );
}

import { t } from '../lib/i18n.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import BestEfforts from '../components/BestEfforts.jsx';
import BottomSheet from '../components/BottomSheet.jsx';
import ConfirmButton from '../components/ConfirmButton.jsx';
import PointSlider from '../components/PointSlider.jsx';
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
import { addWatchHr, cropActivity } from '../lib/activity.js';
import { correctElevation } from '../lib/elevation.js';
import { deleteActivities, getActivity, getPhotos, saveActivities, setPhotos, updateActivity } from '../lib/db.js';
import { distUnit, fmtDate, fmtDist, fmtDuration } from '../lib/format.js';
import { defaultGear, GEAR_KINDS, gearFor } from '../lib/gear.js';
import { SPORTS, splitSize as splitSizeOf } from '../lib/sports.js';
import { rpeLabel } from '../lib/training.js';
import { toGpx } from '../lib/formats/gpxExport.js';
import { hidePrivate } from '../lib/privacy.js';
import { safeName, shareFile } from '../lib/share.js';
import { back } from '../router.js';

export default function ActivityPage({ id, activities, hr, ftp, weight, zones, segments, onSegment, gears, onChange, onDeleted }) {
  const [data, setData] = useState(); // undefined: loading, null: not found
  const [sheet, setSheet] = useState(null); // null | 'edit' | 'share'
  const [cropping, setCropping] = useState(false);
  const [photos, setPhotoList] = useState([]);
  const [health, setHealth] = useState(false); // Health Connect ready (Android shell)
  const hover = useRef(() => {});
  const range = useRef(() => {});

  // Reloaded when the watch's heart rate lands in the background (App's fillWatchHr).
  const listedHr = activities?.find((a) => a.id === id)?.avgHr;
  useEffect(() => { getActivity(id).then((d) => setData(d ?? null), () => setData(null)); }, [id, listedHr]);
  useEffect(() => { getPhotos(id).then(setPhotoList, () => setPhotoList([])); }, [id]);
  useEffect(() => { import('../lib/health.js').then((m) => m.healthStatus()).then((s) => setHealth(s === 'ready')); }, []);
  // Keyed on points only, so renaming doesn't rebuild the map and chart.
  const sport = data?.meta.sport;
  const analysis = useMemo(() => data && analyze(data.points, sport), [data?.points, sport]);
  const splitSize = splitSizeOf(sport);
  const splits = useMemo(() => analysis && computeSplits(analysis.track, splitSize, sport), [analysis, splitSize, sport]);

  if (data === undefined) return (<><TopBar /><DetailSkeleton /></>);
  if (data === null) return (<><TopBar /><p className="empty">{t('Activité introuvable.')}</p></>);

  const act = { ...analysis, ...data.meta };
  const hasTrack = data.points.length > 1; // false for an activity typed in by hand
  const gear = gears.find((g) => g.id === data.meta.gear);

  const save = async (patch) => {
    const meta = { ...data.meta, ...patch };
    // Another sport, another moving threshold: moving time and pace follow.
    // Segments are per sport too: saveActivities re-matches them.
    if (meta.sport !== data.meta.sport && data.points.length) {
      const { movingTime, avgPace } = analyze(data.points, meta.sport);
      Object.assign(meta, { movingTime, avgPace });
      await saveActivities([{ meta, points: data.points }]);
      setData(await getActivity(id));
    } else {
      await updateActivity(meta);
      setData({ ...data, meta });
    }
    setSheet(null);
    onChange();
  };
  const crop = async (from, to) => {
    await saveActivities([cropActivity(data.meta, data.points, from, to)]);
    setData(await getActivity(id));
    setCropping(false);
    onChange();
  };
  // A crop that keeps every point: stats recomputed, typed fields kept. False when the DEM is out of reach.
  const fixElevation = async () => {
    const points = await correctElevation(data.points, 15000);
    if (points === data.points) return false;
    await saveActivities([cropActivity(data.meta, points, 0, points.length - 1)]);
    setData(await getActivity(id));
    setSheet(null);
    onChange();
    return true;
  };
  // Heart rate a watch wrote to Health Connect during a recording made without a strap.
  // False when there is none (yet: watches sync with a delay).
  const fetchWatchHr = async () => {
    const { readHeartRate } = await import('../lib/health.js');
    const p = data.points;
    const merged = addWatchHr(data.meta, p, await readHeartRate(p[0].time, p.at(-1).time));
    if (!merged) return false;
    await saveActivities([merged]);
    setData(await getActivity(id));
    setSheet(null);
    onChange();
    return true;
  };
  // Deleted right away; the undo puts the activity and its photos back (efforts re-matched).
  const remove = async () => {
    const kept = { meta: data.meta, points: data.points }, pics = photos;
    await deleteActivities([id]);
    await onChange();
    onDeleted(async () => {
      await saveActivities([kept]);
      if (pics.length) await setPhotos(id, pics);
      await onChange();
    });
    back('/'); // to the list it was opened from
  };
  const savePhotos = async (blobs) => { await setPhotos(id, blobs); setPhotoList(blobs); };
  const exportGpx = async () => {
    await shareFile(new Blob([toGpx(data.meta, hidePrivate(data.points, zones))], { type: 'application/gpx+xml' }), `${safeName(act.name)}.gpx`);
    setSheet(null);
  };

  return (
    <>
      <TopBar>
        <button className="ghost small" onClick={() => setSheet('edit')}>{t('Modifier')}</button>
        <button className="small" onClick={() => setSheet('share')}>{t('Partager')}</button>
      </TopBar>
      <BottomSheet open={sheet === 'edit'} onClose={() => setSheet(null)} title={t("Modifier l'activité")}>
        <EditForm meta={data.meta} gears={gears} onSave={save} onDelete={remove}
          onFixElevation={hasTrack && data.meta.source !== 'record' && fixElevation}
          onWatchHr={health && hasTrack && data.meta.source === 'record' && !data.meta.avgHr && fetchWatchHr}
          onCrop={hasTrack && (() => { setSheet(null); setCropping(true); })} />
      </BottomSheet>
      <ShareSheet key={id} act={act} zones={zones} photos={photos} open={sheet === 'share'} onClose={() => setSheet(null)}>
        {hasTrack && <button type="button" className="ghost" onClick={exportGpx}>{t('Fichier GPX')}</button>}
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
        <StatsGrid act={act} weight={weight} />
        {cropping && <CropForm track={act.track} range={range} onCancel={() => setCropping(false)} onCrop={crop} />}
        {hasTrack && (
          <section className="card map-card">
            <TrackMap track={act.track} hover={hover} range={range} />
          </section>
        )}
        <Photos photos={photos} onChange={savePhotos} />
        {hasTrack && (
          <>
            <Intervals meta={data.meta} track={act.track} range={range} />
            <SegmentEfforts meta={activities?.find((a) => a.id === id) ?? data.meta} track={act.track} segments={segments}
              activities={activities} range={range} onCreate={onSegment} />
            <section className="card">
              <h3>{t('Profil')} <span className="legend ele">{t('Altitude')}</span> <span className="legend hr">{t('Cardio')}</span></h3>
              <ProfileChart track={act.track} hover={hover} />
            </section>
          </>
        )}
        <HrZones hist={data.meta.hrTime} hr={hr} />
        {data.meta.powerCurve && <PowerCurve meta={data.meta} activities={activities} ftp={ftp} />}
        {hasTrack && <SplitsTable splits={splits} sport={act.sport} size={splitSize} />}
        <BestEfforts meta={data.meta} activities={activities} />
        <MatchedActivities meta={data.meta} activities={activities} />
      </main>
    </>
  );
}

function TopBar({ children }) {
  return (
    <header className="topbar">
      {/* Back where it was opened from (training log, calendar, segment…), with its scroll. */}
      <a className="back" href="#/" aria-label={t('Retour')} onClick={(e) => { e.preventDefault(); back('/'); }}>‹</a>
      <div className="actions">{children}</div>
    </header>
  );
}

function EditForm({ meta, gears, onSave, onDelete, onCrop, onFixElevation, onWatchHr }) {
  const [fixing, setFixing] = useState(null); // null | 'busy' | 'failed'
  const [watchHr, setWatchHr] = useState(null); // null | 'busy' | message
  const [name, setName] = useState(meta.name);
  const [sport, setSport] = useState(meta.sport);
  const [gear, setGear] = useState(meta.gear ?? '');
  const [description, setDescription] = useState(meta.description ?? '');
  const [notes, setNotes] = useState(meta.notes ?? '');
  const [rpe, setRpe] = useState(meta.rpe ?? 0); // 0: not set
  const [noRecords, setNoRecords] = useState(!!meta.noRecords);
  // Active gear for the chosen sport, plus the current one even if retired.
  const options = gearFor(gears, sport);
  const current = gears.find((g) => g.id === meta.gear);
  if (current && !options.includes(current) && GEAR_KINDS[current.kind].sports.includes(sport)) options.push(current);
  // Gear that doesn't fit a newly picked sport gives way to that sport's default.
  const gearId = !gear || options.some((g) => g.id === gear) ? gear : (defaultGear(gears, sport) ?? '');
  return (
    <form className="card edit" onSubmit={(e) => { e.preventDefault(); onSave({ name: name.trim() || meta.name, sport, gear: gearId || undefined, description: description.trim() || undefined, notes: notes.trim() || undefined, rpe: rpe || undefined, noRecords: noRecords || undefined }); }}>
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
      <label className="switch"><input type="checkbox" checked={noRecords} onChange={(e) => setNoRecords(e.target.checked)} />{t('Exclure des records')}</label>
      {onCrop
        ? <button type="button" className="ghost" onClick={onCrop}>{t('Recadrer le début ou la fin')}</button>
        : meta.source === 'manual' && <a className="button ghost" href={`#/manual/${meta.id}`}>{t('Modifier la date, la durée ou la distance')}</a>}
      {/* <div>, not <label>: a tap on the hint must not run the action. */}
      {onFixElevation && (
        <div className="field">
          {fixing === 'busy'
            ? <button type="button" className="ghost" disabled>{t('Correction…')}</button>
            : (
              <ConfirmButton className="ghost" confirmLabel={t("Remplacer l'altitude ?")}
                onConfirm={async () => { setFixing('busy'); try { setFixing((await onFixElevation()) ? null : 'failed'); } catch (e) { setFixing(null); throw e; } }}>
                {t("Corriger l'altitude")}
              </ConfirmButton>
            )}
          <span className="hint">{fixing === 'failed'
            ? t('Relief indisponible (hors ligne ou trace trop longue).')
            : t("Remplace l'altitude du fichier par celle du relief. Inutile pour une montre barométrique.")}</span>
        </div>
      )}
      {onWatchHr && (
        <div className="field">
          <button type="button" className="ghost" disabled={watchHr === 'busy'}
            onClick={async () => {
              setWatchHr('busy');
              try { setWatchHr((await onWatchHr()) ? null : t('Pas encore de fréquence cardiaque dans Health Connect pour cette activité : la montre synchronise parfois avec du retard.')); } catch (e) { setWatchHr(e.message); }
            }}>
            {watchHr === 'busy' ? t('Récupération…') : t('Récupérer la FC de la montre')}
          </button>
          <span className="hint">{watchHr && watchHr !== 'busy' ? watchHr : t('Lit dans Health Connect la fréquence cardiaque mesurée par ta montre pendant cette activité.')}</span>
        </div>
      )}
      <div className="edit-actions">
        <ConfirmButton onConfirm={onDelete} confirmLabel={t('Confirmer')}>{t('Supprimer')}</ConfirmButton>
        <button type="submit">{t('Enregistrer')}</button>
      </div>
    </form>
  );
}

/** Trim the start and end with two sliders; the map highlights what is kept. */
function CropForm({ track, range, onCancel, onCrop }) {
  const last = track.length - 1;
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(last);
  useEffect(() => { range.current([from, to]); }, [range, from, to]);
  useEffect(() => () => range.current(null), [range]);
  const at = (i) => `${fmtDist(track[i].dist)} ${distUnit()}${track[i].time != null ? ` · ${fmtDuration((track[i].time - track[0].time) / 1000)}` : ''}`;
  const changed = from > 0 || to < last;
  return (
    <section className="card edit segment-form">
      <h3>{t("Recadrer l'activité")}</h3>
      <PointSlider label={t('Départ')} text={at(from)} value={from} last={last} lo={0} hi={to - 1} onChange={setFrom} />
      <PointSlider label={t('Arrivée')} text={at(to)} value={to} last={last} lo={from + 1} hi={last} onChange={setTo} />
      <p className="muted">{t('{dist} {unit} conservés. Les points retirés sont supprimés.', { dist: fmtDist(track[to].dist - track[from].dist), unit: distUnit() })}</p>
      <div className="edit-actions">
        <button type="button" className="ghost" onClick={onCancel}>{t('Annuler')}</button>
        {changed
          ? <ConfirmButton className="" onConfirm={() => onCrop(from, to)} confirmLabel={t('Confirmer')}>{t('Recadrer')}</ConfirmButton>
          : <button type="button" disabled>{t('Recadrer')}</button>}
      </div>
    </section>
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

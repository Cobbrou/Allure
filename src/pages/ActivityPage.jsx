import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtDate } from '../components/ActivityCard.jsx';
import BestEfforts from '../components/BestEfforts.jsx';
import ConfirmButton from '../components/ConfirmButton.jsx';
import HrZones from '../components/HrZones.jsx';
import Intervals from '../components/Intervals.jsx';
import MatchedActivities from '../components/MatchedActivities.jsx';
import ProfileChart from '../components/ProfileChart.jsx';
import SegmentEfforts from '../components/SegmentEfforts.jsx';
import SplitsTable from '../components/SplitsTable.jsx';
import StatsGrid from '../components/StatsGrid.jsx';
import TrackMap from '../components/TrackMap.jsx';
import { analyze, computeSplits } from '../lib/analyze.js';
import { deleteActivities, getActivity, updateActivity } from '../lib/db.js';
import { SPORTS } from '../lib/sports.js';
import { toGpx } from '../lib/formats/gpxExport.js';
import { safeName, shareFile } from '../lib/share.js';
import { exportStory } from '../lib/story.js';
import { go } from '../router.js';

export default function ActivityPage({ id, activities, hr, segments, onSegment, onChange }) {
  const [data, setData] = useState(); // undefined: loading, null: not found
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const hover = useRef(() => {});
  const range = useRef(() => {});

  useEffect(() => {
    getActivity(id).then((d) => setData(d ?? null), () => setData(null));
  }, [id]);
  // Keyed on points only, so renaming doesn't rebuild the map and chart.
  const analysis = useMemo(() => data && analyze(data.points), [data?.points]);
  const splitSize = SPORTS[data?.meta.sport]?.split ?? 1000;
  const splits = useMemo(() => analysis && computeSplits(analysis.track, splitSize), [analysis, splitSize]);

  if (data === undefined) return (<><TopBar /><DetailSkeleton /></>);
  if (data === null) return (<><TopBar /><p className="empty">Activité introuvable.</p></>);

  const act = { ...analysis, ...data.meta };

  const save = async (patch) => {
    const meta = { ...data.meta, ...patch };
    await updateActivity(meta);
    setData({ ...data, meta });
    setEditing(false);
    onChange();
  };
  const remove = async () => {
    await deleteActivities([id]);
    await onChange();
    go('/');
  };
  const exportGpx = () =>
    shareFile(new Blob([toGpx(data.meta, data.points)], { type: 'application/gpx+xml' }), `${safeName(act.name)}.gpx`);
  const story = async () => {
    setExporting(true);
    try { await exportStory(act); } finally { setExporting(false); }
  };

  return (
    <>
      <TopBar>
        <button className="ghost small" onClick={() => setEditing(!editing)}>{editing ? 'Fermer' : 'Modifier'}</button>
        <button className="small" onClick={story} disabled={exporting}>{exporting ? '…' : 'Story'}</button>
      </TopBar>
      <main className="detail">
        {editing ? (
          <EditForm meta={data.meta} onSave={save} onDelete={remove} onExport={exportGpx} />
        ) : (
          <div className="title">
            <span className="sport-icon">{SPORTS[act.sport]?.icon}</span>
            <div>
              <h1>{act.name}</h1>
              <p>{SPORTS[act.sport]?.label} · {fmtDate(act.date)}</p>
            </div>
          </div>
        )}
        <StatsGrid act={act} />
        <section className="card map-card">
          <TrackMap track={act.track} hover={hover} range={range} />
        </section>
        <Intervals meta={data.meta} track={act.track} range={range} />
        <SegmentEfforts meta={activities?.find((a) => a.id === id) ?? data.meta} track={act.track} segments={segments}
          activities={activities} range={range} onCreate={onSegment} />
        <section className="card">
          <h3>Profil <span className="legend ele">Altitude</span> <span className="legend hr">Cardio</span></h3>
          <ProfileChart track={act.track} hover={hover} />
        </section>
        <HrZones hist={data.meta.hrTime} hr={hr} />
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
      <a className="back" href="#/" aria-label="Retour aux activités">‹</a>
      <div className="actions">{children}</div>
    </header>
  );
}

function EditForm({ meta, onSave, onDelete, onExport }) {
  const [name, setName] = useState(meta.name);
  const [sport, setSport] = useState(meta.sport);
  return (
    <form className="card edit" onSubmit={(e) => { e.preventDefault(); onSave({ name: name.trim() || meta.name, sport }); }}>
      <label>
        Titre
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </label>
      <fieldset>
        <legend>Sport</legend>
        <div className="sport-picker">
          {Object.entries(SPORTS).map(([sid, s]) => (
            <label key={sid} className={sid === sport ? 'selected' : ''}>
              <input type="radio" name="sport" value={sid} checked={sid === sport} onChange={() => setSport(sid)} />
              <span>{s.icon}</span>{s.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="edit-actions">
        <ConfirmButton onConfirm={onDelete} confirmLabel="Confirmer">Supprimer</ConfirmButton>
        <button type="button" className="ghost" onClick={onExport}>Exporter .gpx</button>
        <button type="submit">Enregistrer</button>
      </div>
    </form>
  );
}

function DetailSkeleton() {
  return (
    <main className="detail" aria-busy="true">
      <div className="skeleton" style={{ height: 52 }} />
      <div className="skeleton" style={{ height: 96 }} />
      <div className="stats">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 84 }} />)}</div>
      <div className="skeleton" style={{ height: 320 }} />
    </main>
  );
}

import { useRef, useState } from 'react';
import Dropzone from './components/Dropzone.jsx';
import ProfileChart from './components/ProfileChart.jsx';
import SplitsTable from './components/SplitsTable.jsx';
import StatsGrid from './components/StatsGrid.jsx';
import TrackMap from './components/TrackMap.jsx';
import { analyze } from './lib/analyze.js';
import { demoTrack } from './lib/demo.js';
import { parseGpx } from './lib/gpx.js';
import { exportStory } from './lib/story.js';

export default function App() {
  const [act, setAct] = useState(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const hover = useRef(() => {});

  const load = (name, points) => {
    setError('');
    setAct({ name: name || 'Course', ...analyze(points) });
  };
  const loadDemo = () => load('Boucle de Chamonix', demoTrack());

  const openFile = async (file) => {
    if (!file) return;
    if (!/\.gpx$/i.test(file.name)) return setError('Format non supporté : choisis un fichier .gpx');
    try {
      const { name, points } = parseGpx(await file.text());
      load(name || file.name.replace(/\.gpx$/i, ''), points);
    } catch (e) {
      setError(e.message);
    }
  };

  const story = async () => {
    setExporting(true);
    try { await exportStory(act); } finally { setExporting(false); }
  };

  return (
    <div
      className={`app ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); openFile(e.dataTransfer.files[0]); }}
    >
      <header>
        <div className="logo"><span>▲</span> Allure</div>
        <div className="actions">
          <button className="ghost" onClick={loadDemo}>Charger une course de démo</button>
          <label className="ghost button">
            Importer .gpx
            <input type="file" accept=".gpx" hidden onChange={(e) => { openFile(e.target.files[0]); e.target.value = ''; }} />
          </label>
          {act && <button onClick={story} disabled={exporting}>{exporting ? 'Génération…' : 'Exporter la Story'}</button>}
        </div>
      </header>

      {error && <div className="error" role="alert">{error}</div>}

      {!act ? (
        <Dropzone onFile={openFile} onDemo={loadDemo} />
      ) : (
        <main>
          <div className="title">
            <h1>{act.name}</h1>
            {act.date && <p>{new Date(act.date).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}</p>}
          </div>
          <StatsGrid act={act} />
          <section className="card map-card">
            <TrackMap track={act.track} hover={hover} />
          </section>
          <section className="card">
            <h3>Profil <span className="legend ele">Altitude</span> <span className="legend hr">Cardio</span></h3>
            <ProfileChart track={act.track} hover={hover} />
          </section>
          <SplitsTable splits={act.splits} />
        </main>
      )}
    </div>
  );
}

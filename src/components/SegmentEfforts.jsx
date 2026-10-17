import { useEffect, useState } from 'react';
import { fmtDuration } from '../lib/format.js';
import { createSegment, leaderboard } from '../lib/segments.js';

const MIN_LENGTH = 100; // m

/** This activity's segment efforts, ranked among all efforts on each segment, plus segment creation. */
export default function SegmentEfforts({ meta, track, segments, activities, range, onCreate }) {
  const [creating, setCreating] = useState(false);
  const byId = new Map(segments.map((s) => [s.id, s]));
  const efforts = (meta.efforts ?? []).filter((e) => byId.get(e.seg)?.sport === meta.sport);

  return (
    <section className="card">
      <h3 className="seg-head">
        Segments {efforts.length > 0 && <span className="muted small-label">{efforts.length}</span>}
        {!creating && <button type="button" className="ghost small" onClick={() => setCreating(true)}>＋ Créer</button>}
      </h3>
      {efforts.length > 0 && (
        <ul className="records">
          {efforts.map((e) => {
            const seg = byId.get(e.seg);
            const board = leaderboard(seg, activities ?? []);
            const rank = board.findIndex((b) => b.meta.id === meta.id && b.from === e.from) + 1;
            return (
              <li key={`${e.seg}/${e.from}`}>
                <a className="rec-label seg-name" href={`#/segment/${seg.id}`}>{seg.name}</a>
                <a href={`#/segment/${seg.id}`}>
                  {rank === 1 && board.length > 1 && <span className="pr" title="Record personnel">PR</span>}
                  {rank > 1 && <span className="muted">{rank}e / {board.length}</span>}
                  <b>{fmtDuration(e.time)}</b>
                  <span aria-hidden="true" className="muted">›</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {creating && <SegmentForm meta={meta} track={track} range={range} onDone={() => setCreating(false)} onCreate={onCreate} />}
    </section>
  );
}

/** Pick start and end with two sliders; the map highlights the stretch live. */
function SegmentForm({ meta, track, range, onDone, onCreate }) {
  const last = track.length - 1;
  const [from, setFrom] = useState(Math.round(last * 0.25));
  const [to, setTo] = useState(Math.round(last * 0.5));
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { range.current([from, to]); }, [range, from, to]);
  useEffect(() => () => range.current(null), [range]);
  const length = track[to].dist - track[from].dist;
  const km = (i) => (track[i].dist / 1000).toFixed(2);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onCreate(createSegment({ name: name.trim() || `Segment ${km(from)}–${km(to)} km`, sport: meta.sport, track, from, to }));
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="edit segment-form" onSubmit={submit}>
      <label>Nom
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Montée du col…" />
      </label>
      <label>Départ · {km(from)} km
        <input type="range" min="0" max={last} value={from} onChange={(e) => setFrom(Math.min(Number(e.target.value), to - 1))} />
      </label>
      <label>Arrivée · {km(to)} km
        <input type="range" min="0" max={last} value={to} onChange={(e) => setTo(Math.max(Number(e.target.value), from + 1))} />
      </label>
      <p className="muted">{(length / 1000).toFixed(2)} km{length < MIN_LENGTH && ` · ${MIN_LENGTH} m minimum`}</p>
      <div className="edit-actions">
        <button type="button" className="ghost" onClick={onDone}>Annuler</button>
        <button type="submit" disabled={busy || length < MIN_LENGTH}>{busy ? 'Recherche des passages…' : 'Créer'}</button>
      </div>
    </form>
  );
}

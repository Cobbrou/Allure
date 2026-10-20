import { t } from '../lib/i18n.js';
import { useEffect, useRef, useState } from 'react';
import RoutePreview from '../components/RoutePreview.jsx';
import Segmented from '../components/Segmented.jsx';
import TrackMap from '../components/TrackMap.jsx';
import { preview } from '../lib/activity.js';
import { analyze } from '../lib/analyze.js';
import { thinTracks } from '../lib/db.js';
import { distUnit, elevUnit, fmtDist, fmtElev, isImperial } from '../lib/format.js';
import { currentPosition } from '../lib/location.js';
import { createRoute, fetchRoute, splitLegs } from '../lib/routes.js';
import { SPORTS } from '../lib/sports.js';
import { BEARINGS, cellKey, FALLBACK_START, familiarity, loopWaypoints, rank } from '../lib/suggest.js';
import { back } from '../router.js';

const sportOptions = () => ['run', 'ride', 'hike'].map((id) => ({ id, label: `${SPORTS[id].icon} ${SPORTS[id].label}` }));
const KM = { run: [3, 30, 10], ride: [10, 150, 40], hike: [5, 30, 12] }; // min, max, default
const terrains = () => [{ id: '', label: t('Peu importe') }, { id: 'flat', label: t('Plat') }, { id: 'hilly', label: t('Vallonné') }];
const surfaces = () => [{ id: '', label: t('Peu importe') }, { id: 'paved', label: t('Route') }, { id: 'trail', label: t('Chemins') }];
const OFF_TARGET = 0.15; // a first loop further than this from the target distance is routed again, resized

/** Routes made for you: loops from your position matching distance, terrain, surface and novelty. */
export default function SuggestPage({ activities, onPick }) {
  const [sport, setSport] = useState('run');
  const [km, setKm] = useState(KM.run[2]);
  const [terrain, setTerrain] = useState('');
  const [surface, setSurface] = useState('');
  const [discover, setDiscover] = useState(false);
  const [start, setStart] = useState(null); // { coords, label }
  const [results, setResults] = useState(null); // null | 'loading' | candidates | { error }
  const [picked, setPicked] = useState(0);
  const cells = useRef(null);
  const hover = useRef(() => {});

  useEffect(() => {
    currentPosition().then((p) => {
      const last = activities?.find((a) => a.preview?.length)?.preview[0];
      setStart(p ? { coords: [p.lon, p.lat], label: t('ma position') }
        : last ? { coords: last, label: t('départ de ta dernière activité') }
        : { coords: FALLBACK_START, label: 'Chamonix' });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on open
  // ~100 m cells covered by past tracks, for the "new ground" preference (thinned tracks: points every 15 m).
  useEffect(() => {
    if (!activities) return;
    thinTracks(activities).then((lines) => {
      cells.current = new Set(lines.flatMap((l) => l.coords.map(([lon, lat]) => cellKey(lon, lat))));
    }, () => {});
  }, [activities]);

  const pickSport = (s) => { setSport(s); setKm(KM[s][2]); };

  const generate = async () => {
    setResults('loading');
    setPicked(0);
    const target = km * 1000;
    const loop = async (bearing) => {
      let waypoints = loopWaypoints(start.coords, target, bearing);
      let r = await fetchRoute(waypoints, sport, surface);
      const first = analyze(r.points).distance;
      if (Math.abs(first - target) / target > OFF_TARGET) {
        waypoints = loopWaypoints(start.coords, target, bearing, Math.min(2, Math.max(0.5, target / first)));
        r = await fetchRoute(waypoints, sport, surface);
      }
      const { distance, gain } = analyze(r.points);
      return { bearing, waypoints, points: r.points, distance, gain, unpaved: r.unpaved, familiar: familiarity(r.points, cells.current) };
    };
    const all = (await Promise.allSettled(BEARINGS.map(loop))).filter((x) => x.status === 'fulfilled').map((x) => x.value);
    setResults(all.length ? rank(all, { distance: target, terrain, surface, discover }) : { error: t('Aucun itinéraire trouvé : vérifie ta connexion.') });
  };

  const keep = (c) => onPick(createRoute({
    name: t('Boucle de {dist}', { dist: `${fmtDist(c.distance, 0)} ${distUnit()}` }), sport, snap: true,
    waypoints: c.waypoints, legs: splitLegs(c.points, c.waypoints),
  }));

  const list = Array.isArray(results) ? results : null;
  const [min, max] = KM[sport];
  return (
    <>
      <header className="topbar">
        <a className="back" href="#/maps" aria-label={t('Retour')} onClick={(e) => { e.preventDefault(); back('/maps'); }}>‹</a>
        <h1>{t("Idées d'itinéraires")}</h1>
        <span className="back" aria-hidden="true" />
      </header>
      <main className="detail">
        <section className="card edit suggest-form">
          <Segmented label={t('Sport')} options={sportOptions()} value={sport} onChange={pickSport} />
          <label>{t('Distance : {dist}', { dist: `${fmtDist(km * 1000, isImperial() ? 1 : 0)} ${distUnit()}` })}
            <input type="range" min={min} max={max} step={sport === 'ride' ? 5 : 1} value={km} onChange={(e) => setKm(Number(e.target.value))} />
          </label>
          <div className="field"><span>{t('Dénivelé')}</span><Segmented label={t('Dénivelé')} options={terrains()} value={terrain} onChange={setTerrain} /></div>
          <div className="field"><span>{t('Revêtement')}</span><Segmented label={t('Revêtement')} options={surfaces()} value={surface} onChange={setSurface} /></div>
          <label className="switch"><input type="checkbox" checked={discover} onChange={(e) => setDiscover(e.target.checked)} />{t('Découvrir de nouveaux coins')}</label>
          <p className="muted small-label">{t('Départ : {where}', { where: start ? start.label : t('recherche de ta position…') })}</p>
          <button type="button" onClick={generate} disabled={!start || results === 'loading'}>
            {t(results === 'loading' ? "Recherche d'itinéraires…" : 'Proposer des boucles')}
          </button>
        </section>

        {results?.error && <p className="record-status bad" role="alert">{results.error}</p>}
        {list && (
          <>
            <section className="card map-card"><TrackMap key={picked} track={list[picked].points} hover={hover} /></section>
            {list.map((c, i) => (
              <button key={c.bearing} type="button" className={`card link-card route-card suggestion ${i === picked ? 'on' : ''}`} onClick={() => setPicked(i)} aria-pressed={i === picked}>
                <RoutePreview coords={preview(c.points)} />
                <span>
                  <b>{fmtDist(c.distance, 1)} {distUnit()} · {fmtElev(c.gain ?? 0)} {elevUnit()} D+</b>
                  <span className="muted">
                    {c.unpaved != null && `${t('{n} % de chemins', { n: Math.round(c.unpaved * 100) })} · `}
                    {cells.current?.size ? t('{n} % de nouveau', { n: Math.round((1 - c.familiar) * 100) }) : t('Nouveau terrain')}
                  </span>
                </span>
              </button>
            ))}
            <button type="button" onClick={() => keep(list[picked])}>{t('Garder cet itinéraire')}</button>
          </>
        )}
      </main>
    </>
  );
}

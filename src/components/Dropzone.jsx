export default function Dropzone({ onFile, onDemo }) {
  return (
    <label className="dropzone">
      <input type="file" accept=".gpx" hidden onChange={(e) => onFile(e.target.files[0])} />
      <div className="drop-icon">⤓</div>
      <h2>Glisse ton fichier .gpx ici</h2>
      <p>ou clique pour parcourir — export Strava, Garmin, Coros, Suunto…</p>
      <button type="button" onClick={(e) => { e.preventDefault(); onDemo(); }}>
        Charger une course de démo
      </button>
    </label>
  );
}

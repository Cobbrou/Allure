export default function ImportButton({ onImport, className = 'button', children = 'Importer .gpx' }) {
  return (
    <label className={className}>
      {children}
      <input type="file" accept=".gpx" hidden onChange={(e) => { onImport(e.target.files[0]); e.target.value = ''; }} />
    </label>
  );
}

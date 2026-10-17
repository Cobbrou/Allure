import { useEffect, useMemo, useState } from 'react';
import { shrinkPhoto } from '../lib/story.js';
import BottomSheet from './BottomSheet.jsx';
import ConfirmButton from './ConfirmButton.jsx';

/** Photo grid of an activity: add from the camera roll, tap to view, delete. photos: Blobs. */
export default function Photos({ photos, onChange }) {
  const [open, setOpen] = useState(null); // index of the photo shown full size
  const [busy, setBusy] = useState(false);
  const urls = useMemo(() => photos.map((b) => URL.createObjectURL(b)), [photos]);
  useEffect(() => () => urls.forEach(URL.revokeObjectURL), [urls]);

  const add = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      const added = await Promise.all(files.map((f) => shrinkPhoto(f).catch(() => null)));
      await onChange([...photos, ...added.filter(Boolean)]);
    } finally { setBusy(false); }
  };
  const remove = async () => {
    await onChange(photos.filter((_, i) => i !== open));
    setOpen(null);
  };

  return (
    <section className="card">
      <h3>Photos</h3>
      <div className="photo-grid">
        {urls.map((u, i) => (
          <button key={u} type="button" className="photo" onClick={() => setOpen(i)} aria-label={`Photo ${i + 1}`}>
            <img src={u} alt="" loading="lazy" />
          </button>
        ))}
        <label className={`photo add ${busy ? 'busy' : ''}`}>
          <span aria-hidden="true">+</span>{busy ? 'Ajout…' : 'Ajouter'}
          <input type="file" accept="image/*" multiple hidden disabled={busy} onChange={add} />
        </label>
      </div>
      <BottomSheet open={open !== null} onClose={() => setOpen(null)} title="Photo">
        {open !== null && urls[open] && (
          <div className="sheet-actions">
            <img className="photo-full" src={urls[open]} alt={`Photo ${open + 1}`} />
            <ConfirmButton onConfirm={remove} confirmLabel="Supprimer la photo ?">Supprimer</ConfirmButton>
          </div>
        )}
      </BottomSheet>
    </section>
  );
}

import { t } from '../lib/i18n.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BACKGROUNDS, drawStory, shareStory, templatesFor } from '../lib/story.js';
import BottomSheet from './BottomSheet.jsx';
import Segmented from './Segmented.jsx';

/**
 * Share sheet with a live story preview: swipe (or tap a tab) between templates, pick a
 * dark, transparent or photo background, then share the image. children: extra actions.
 * photos: the activity's photo Blobs; the first one is the default background.
 */
export default function ShareSheet({ act, zones, photos, open, onClose, children }) {
  const [bg, setBg] = useState('dark');
  const [photo, setPhoto] = useState();
  const [noLine, setNoLine] = useState(false); // the track's shape gives the place away
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const canvases = useRef([]);
  const strip = useRef();
  const picker = useRef();
  const list = useMemo(() => (act ? templatesFor(act) : []), [act]);

  useEffect(() => {
    if (!open || !act) return;
    let live = true;
    document.fonts.ready.then(() => live && list.forEach((tpl, k) => {
      const c = canvases.current[k];
      if (c) drawStory(c, act, { template: tpl.id, bg, photo, zones, noLine });
    }));
    return () => { live = false; };
  }, [open, act, list, bg, photo, zones, noLine]);
  useEffect(() => { if (!open) setIndex(0); }, [open]);
  useEffect(() => {
    if (!open || photo || !photos?.length) return;
    createImageBitmap(photos[0]).then((b) => { setPhoto(b); setBg('photo'); }, () => {});
  }, [open, photos]);

  const step = () => strip.current.firstChild.offsetWidth + 12; // slide width + gap
  const goTo = (id) => strip.current.scrollTo({ left: list.findIndex((tpl) => tpl.id === id) * step(), behavior: 'smooth' });
  const pickBg = (id) => (id === 'photo' && !photo ? picker.current.click() : setBg(id));
  const onPhoto = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      setPhoto(await createImageBitmap(file));
      setBg('photo');
    } catch { /* not a decodable image: keep the current background */ }
  };
  const share = async () => {
    setBusy(true);
    try { await shareStory(canvases.current[index], act); onClose(); } finally { setBusy(false); }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t('Partager')}>
      {act && (
        <div className="share">
          <div className={`story-strip ${bg}`} ref={strip} onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / step()))}>
            {list.map((tpl, k) => (
              <canvas key={tpl.id} ref={(c) => (canvases.current[k] = c)} className="story-slide" role="img" aria-label={t('Story {name}', { name: tpl.label })} />
            ))}
          </div>
          <Segmented label={t('Modèle')} options={list} value={list[index]?.id} onChange={goTo} />
          <Segmented label={t('Fond')} options={BACKGROUNDS} value={bg} onChange={pickBg} />
          <label className="switch"><input type="checkbox" checked={noLine} onChange={(e) => setNoLine(e.target.checked)} />{t('Masquer le tracé')}</label>
          <input ref={picker} type="file" accept="image/*" hidden onChange={onPhoto} />
          <div className="sheet-actions">
            <button type="button" onClick={share} disabled={busy}>{t(busy ? 'Préparation…' : "Partager l'image")}</button>
            {bg === 'photo' && <button type="button" className="ghost" onClick={() => picker.current.click()}>{t('Changer de photo')}</button>}
            {children}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

import { locale, t } from './i18n.js';
import { ACCENT, BG, GOOD, TEXT, TICK, TRACK } from '../theme.js';
import { computeSplits } from './analyze.js';
import { distUnit, elevUnit, fmtDist, fmtDuration, fmtElev, shortUnit } from './format.js';
import { fitToBox, toPlane } from './geo.js';
import { hidePrivate } from './privacy.js';
import { effort, SPORTS, splitSize } from './sports.js';
import { safeName, shareFile } from './share.js';

// Platform module (canvas): 1080x1920 social story images, in several templates, over a
// dark gradient, a transparent background (a sticker to lay over a photo in another app)
// or a photo picked by the athlete.

export const W = 1080, H = 1920;
const FONT = 'Inter, system-ui, sans-serif';
const MAX_SPLITS = 20; // ponytail: longer activities show their first 20 splits only

const splitsOf = (act) => computeSplits(act.track, splitSize(act.sport), act.sport).filter((s) => s.pace);

export const TEMPLATES = [
  { id: 'track', get label() { return t('Tracé'); } },
  { id: 'sticker', label: 'Stats' },
  { id: 'profile', get label() { return t('Profil'); }, ok: (a) => a.gain != null },
  { id: 'splits', label: 'Splits', ok: (a) => splitsOf(a).length > 1 },
];

/** Templates that have the data they need for this activity. */
export const templatesFor = (act) => TEMPLATES.filter((t) => !t.ok || t.ok(act));

export const BACKGROUNDS = [
  { id: 'dark', get label() { return t('Sombre'); } },
  { id: 'clear', get label() { return t('Transparent'); } },
  { id: 'photo', get label() { return t('Photo'); } },
];

/**
 * Draw a story on `canvas` (resized to 1080x1920). opts: { template, bg: 'dark'|'clear'|'photo',
 * photo: ImageBitmap, zones: privacy zones }. The track inside privacy zones is left out:
 * a story is meant to be posted publicly.
 */
export function drawStory(canvas, act, { template = 'track', bg = 'dark', photo, zones = [] } = {}) {
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, W, H);
  if (bg === 'photo' && photo) drawPhoto(g, photo);
  else if (bg !== 'clear') drawDark(g);
  // Over a photo or an unknown background, text needs a shadow and a lighter label colour.
  const s = { g, overlay: bg !== 'dark', track: hidePrivate(act.track, zones) };
  s.muted = s.overlay ? 'rgba(255,255,255,0.8)' : TICK;
  g.textBaseline = 'alphabetic';
  ({ track: drawTrackTemplate, sticker: drawSticker, profile: drawProfile, splits: drawSplits })[template](s, act);
}

/** A picked image file shrunk to a JPEG of at most `max` px on its long side, for storage. */
export async function shrinkPhoto(file, max = 1600) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  img.close();
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Image illisible'))), 'image/jpeg', 0.85));
}

/** Share the story currently drawn on `canvas` as a PNG (alpha kept for transparent ones). */
export async function shareStory(canvas, act) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  await shareFile(blob, `${safeName(act.name)}-story.png`);
}

function drawDark(g) {
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, BG);
  bg.addColorStop(1, '#050608');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, 780, 50, W / 2, 780, 700);
  glow.addColorStop(0, 'rgba(255,85,0,0.16)');
  glow.addColorStop(1, 'rgba(255,85,0,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
}

/** Photo scaled to cover the story, darkened at the top and bottom where the text sits. */
function drawPhoto(g, img) {
  const k = Math.max(W / img.width, H / img.height);
  g.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k);
  const shade = g.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(0,0,0,0.5)');
  shade.addColorStop(0.3, 'rgba(0,0,0,0)');
  shade.addColorStop(0.55, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.7)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
}

function text(s, str, x, y, font, color, align = 'left') {
  const { g } = s;
  g.font = `${font} ${FONT}`;
  g.fillStyle = color;
  g.textAlign = align;
  if (s.overlay) {
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = 16;
  }
  g.fillText(str, x, y);
  g.shadowBlur = 0;
  return g.measureText(str).width;
}

function truncate(g, str, max) {
  if (g.measureText(str).width <= max) return str;
  while (str.length && g.measureText(str + '…').width > max) str = str.slice(0, -1);
  return str + '…';
}

function header(s, act) {
  text(s, 'ALLURE', 90, 150, '800 40px', ACCENT);
  s.g.font = `800 76px ${FONT}`;
  text(s, truncate(s.g, act.name, W - 180), 90, 250, '800 76px', TEXT);
  if (act.date) {
    const d = new Date(act.date).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    text(s, d, 90, 310, '500 36px', s.muted);
  }
}

function stats(act) {
  const e = effort(act.sport, act.avgPace);
  return {
    time: [t('TEMPS'), fmtDuration(act.movingTime)],
    effort: [e.short.toUpperCase(), act.avgPace ? `${e.value} ${e.unit}` : '—'],
    gain: [t('D+'), act.gain != null ? `${fmtElev(act.gain)} ${elevUnit()}` : '—'],
    hr: [t('FC MOY.'), act.avgHr ? `${Math.round(act.avgHr)} bpm` : '—'],
  };
}

/** Big distance figure with its unit, left-aligned at x. */
function distance(s, act, x, y) {
  text(s, 'DISTANCE', x + 6, y - 150, '600 34px', s.muted);
  const w = text(s, fmtDist(act.distance), x, y, '800 150px', TEXT);
  text(s, distUnit(), x + w + 20, y, '700 60px', ACCENT);
}

/** Grid of [label, value] pairs, two per row. */
function statGrid(s, pairs, y) {
  pairs.forEach(([label, value], i) => {
    const x = 90 + (i % 2) * 460, yy = y + Math.floor(i / 2) * 150;
    text(s, label, x, yy, '600 30px', s.muted);
    text(s, value, x, yy + 72, '700 64px', TEXT);
  });
}

/** Glowing track fitted into `box`, with start and end dots. */
function drawTrack(s, box, width = 14) {
  if (s.track.length < 2) return;
  const { g } = s;
  const pts = fitToBox(toPlane(s.track), box);
  const path = () => {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p)));
  };
  g.lineJoin = g.lineCap = 'round';
  g.shadowColor = ACCENT;
  g.shadowBlur = width * 3;
  g.strokeStyle = ACCENT;
  g.lineWidth = width;
  path();
  g.stroke();
  g.shadowBlur = 0;
  g.strokeStyle = '#ffd5c2';
  g.lineWidth = width / 3.5;
  path();
  g.stroke();
  dot(g, pts[0], GOOD, width);
  dot(g, pts.at(-1), TEXT, width);
}

function dot(g, [x, y], color, width) {
  g.beginPath();
  g.arc(x, y, width * 1.15, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.lineWidth = width * 0.43;
  g.strokeStyle = BG;
  g.stroke();
}

function drawTrackTemplate(s, act) {
  header(s, act);
  drawTrack(s, { x: 110, y: 380, w: W - 220, h: 820 });
  distance(s, act, 84, 1480);
  const st = stats(act);
  statGrid(s, [st.time, st.effort, st.gain, st.hr], 1590);
}

/** Centered column of three big figures and a small track: the classic overlay sticker. */
function drawSticker(s, act) {
  const st = stats(act);
  const rows = [['DISTANCE', `${fmtDist(act.distance)} ${distUnit()}`], st.effort, st.time];
  rows.forEach(([label, value], i) => {
    const y = 560 + i * 250;
    text(s, label, W / 2, y, '600 36px', s.muted, 'center');
    text(s, value, W / 2, y + 110, '800 104px', TEXT, 'center');
  });
  drawTrack(s, { x: W / 2 - 200, y: 1340, w: 400, h: 300 }, 10);
  text(s, 'ALLURE', W / 2, 1760, '800 40px', ACCENT, 'center');
}

/** Elevation profile as a filled area. */
function drawProfile(s, act) {
  header(s, act);
  const { g } = s;
  const box = { x: 90, y: 520, w: W - 180, h: 640 };
  const pts = s.track.filter((p) => p.ele != null);
  if (pts.length > 1) {
    const xy = fitToBox(pts.map((p) => [p.dist, -p.ele]), box, true);
    const base = box.y + box.h + 40;
    g.beginPath();
    g.moveTo(xy[0][0], base);
    xy.forEach((p) => g.lineTo(...p));
    g.lineTo(xy.at(-1)[0], base);
    g.closePath();
    const fill = g.createLinearGradient(0, box.y, 0, base);
    fill.addColorStop(0, 'rgba(255,85,0,0.55)');
    fill.addColorStop(1, 'rgba(255,85,0,0.05)');
    g.fillStyle = fill;
    g.fill();
    g.beginPath();
    xy.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p)));
    g.lineJoin = 'round';
    g.lineWidth = 8;
    g.strokeStyle = ACCENT;
    g.stroke();
    const eles = pts.map((p) => p.ele);
    text(s, `${fmtElev(Math.max(...eles))} ${elevUnit()}`, W - 90, box.y - 30, '600 34px', s.muted, 'right');
    text(s, `${fmtElev(Math.min(...eles))} ${elevUnit()}`, W - 90, base + 60, '600 34px', s.muted, 'right');
  }
  distance(s, act, 84, 1480);
  const st = stats(act);
  statGrid(s, [st.gain, st.time], 1590);
}

/** One bar per split, longer when faster, the fastest in the accent colour. */
function drawSplits(s, act) {
  header(s, act);
  const { g } = s;
  const splits = splitsOf(act).slice(0, MAX_SPLITS);
  const small = SPORTS[act.sport]?.display === 'pace100';
  const step = SPORTS[act.sport]?.split ?? 1;
  const speeds = splits.map((sp) => 1 / sp.pace);
  const max = Math.max(...speeds), min = Math.min(...speeds);
  const top = 420, bottom = 1700, row = Math.min(90, (bottom - top) / splits.length);
  const x0 = 220, wMax = W - 90 - x0;
  const pace = (sp) => { const e = effort(act.sport, sp.pace); return act.sport === 'ride' ? `${e.value} ${e.unit}` : e.value; };
  splits.forEach((sp, i) => {
    const y = top + i * row;
    const w = wMax * (0.35 + 0.65 * ((speeds[i] - min) / (max - min || 1)));
    const h = row * 0.62;
    g.fillStyle = speeds[i] === max ? ACCENT : s.overlay ? 'rgba(255,255,255,0.35)' : TRACK;
    g.beginPath();
    g.roundRect(x0, y, w, h, h / 2);
    g.fill();
    const label = `${(i + 1) * step}`;
    const font = `600 ${Math.round(h * 0.6)}px`;
    text(s, label, x0 - 30, y + h * 0.75, font, s.muted, 'right');
    text(s, pace(sp), x0 + 24, y + h * 0.75, font, TEXT);
  });
  text(s, (small ? shortUnit() : distUnit()).toUpperCase(), x0 - 30, top - 30, '600 30px', s.muted, 'right');
  const st = stats(act);
  text(s, `${fmtDist(act.distance)} ${distUnit()} · ${st.time[1]} · ${st.effort[1]}`, 90, 1800, '700 44px', TEXT);
}

import { ACCENT, BG, TICK } from '../theme.js';
import { fmtDuration } from './format.js';
import { hidePrivate } from './privacy.js';
import { effort } from './sports.js';
import { safeName, shareFile } from './share.js';

const FONT = 'Inter, system-ui, sans-serif';

/** Render a 1080x1920 social story PNG (glowing track + key stats) and share or download it. zones: privacy zones. */
export async function exportStory(act, zones = []) {
  await document.fonts.ready;
  const W = 1080, H = 1920;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');

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

  // Header
  g.fillStyle = ACCENT;
  g.font = `800 40px ${FONT}`;
  g.fillText('ALLURE', 90, 150);
  g.fillStyle = '#f8fafc';
  g.font = `800 76px ${FONT}`;
  g.fillText(truncate(g, act.name, W - 180), 90, 250);
  if (act.date) {
    g.fillStyle = TICK;
    g.font = `500 36px ${FONT}`;
    g.fillText(new Date(act.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), 90, 310);
  }

  // Track inside the privacy zones is left out: a story is meant to be posted publicly.
  const track = hidePrivate(act.track, zones);
  if (track.length > 1) drawTrack(g, track, W);

  // Stats
  g.fillStyle = TICK;
  g.font = `600 34px ${FONT}`;
  g.fillText('DISTANCE', 90, 1330);
  g.fillStyle = '#f8fafc';
  g.font = `800 150px ${FONT}`;
  const km = (act.distance / 1000).toFixed(2);
  g.fillText(km, 84, 1480);
  const kmW = g.measureText(km).width;
  g.fillStyle = ACCENT;
  g.font = `700 60px ${FONT}`;
  g.fillText('km', 84 + kmW + 20, 1480);

  const e = effort(act.sport, act.avgPace);
  const stats = [
    ['TEMPS', fmtDuration(act.movingTime)],
    [e.short.toUpperCase(), act.avgPace ? `${e.value} ${e.unit}` : '—'],
    ['D+', act.gain != null ? `${Math.round(act.gain)} m` : '—'],
    ['FC MOY.', act.avgHr ? `${Math.round(act.avgHr)} bpm` : '—'],
  ];
  stats.forEach(([label, value], i) => {
    const x = 90 + (i % 2) * 460, y = 1590 + Math.floor(i / 2) * 150;
    g.fillStyle = TICK;
    g.font = `600 30px ${FONT}`;
    g.fillText(label, x, y);
    g.fillStyle = '#f8fafc';
    g.font = `700 64px ${FONT}`;
    g.fillText(value, x, y + 72);
  });

  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  await shareFile(blob, `${safeName(act.name)}-story.png`);
}

function dot(g, [x, y], color) {
  g.beginPath();
  g.arc(x, y, 16, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = BG;
  g.stroke();
}

function truncate(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  while (text.length && g.measureText(text + '…').width > max) text = text.slice(0, -1);
  return text + '…';
}

/** Glowing track, equirectangular projection fitted into a box, with start and end dots. */
function drawTrack(g, track, W) {
  const box = { x: 110, y: 380, w: W - 220, h: 820 };
  const lat0 = track[0].lat * (Math.PI / 180);
  const pts = track.map((p) => [p.lon * Math.cos(lat0), -p.lat]);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const k = Math.min(box.w / (maxX - minX || 1), box.h / (maxY - minY || 1));
  const ox = box.x + (box.w - (maxX - minX) * k) / 2, oy = box.y + (box.h - (maxY - minY) * k) / 2;
  const proj = ([x, y]) => [ox + (x - minX) * k, oy + (y - minY) * k];

  g.lineJoin = g.lineCap = 'round';
  const path = () => {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(...proj(p)) : g.moveTo(...proj(p))));
  };
  g.shadowColor = ACCENT;
  g.shadowBlur = 45;
  g.strokeStyle = ACCENT;
  g.lineWidth = 14;
  path();
  g.stroke();
  g.shadowBlur = 0;
  g.strokeStyle = '#ffd5c2';
  g.lineWidth = 4;
  path();
  g.stroke();
  dot(g, proj(pts[0]), '#22c55e');
  dot(g, proj(pts.at(-1)), '#f8fafc');
}

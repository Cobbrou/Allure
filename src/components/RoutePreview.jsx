const W = 100, H = 50, PAD = 4;

/** Static route thumbnail from [lon, lat] pairs, drawn as an SVG polyline. */
export default function RoutePreview({ coords }) {
  if (!coords?.length) return null;
  const cos = Math.cos((coords[0][1] * Math.PI) / 180);
  const pts = coords.map(([lon, lat]) => [lon * cos, -lat]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const w = Math.max(...xs) - minX || 1e-9, h = Math.max(...ys) - minY || 1e-9;
  const k = Math.min((W - 2 * PAD) / w, (H - 2 * PAD) / h);
  const ox = (W - w * k) / 2, oy = (H - h * k) / 2;
  const line = pts.map(([x, y]) => `${(ox + (x - minX) * k).toFixed(2)},${(oy + (y - minY) * k).toFixed(2)}`).join(' ');
  return (
    <svg className="route-preview" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline points={line} className="glow" />
      <polyline points={line} />
    </svg>
  );
}

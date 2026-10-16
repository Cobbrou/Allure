import { memo, useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ACCENT } from '../theme.js';

// memo: the chart must not re-render on hover, the map cursor is updated imperatively.
const ProfileChart = memo(function ProfileChart({ track, hover }) {
  const hasEle = track[0].ele != null;
  const hasHr = track.some((p) => p.hr != null);
  const data = useMemo(() => {
    const step = Math.ceil(track.length / 600); // ponytail: plain decimation, enough for a 600px-wide chart
    const out = [];
    track.forEach((p, i) => {
      if (i % step === 0 || i === track.length - 1)
        out.push({ i, km: p.dist / 1000, ele: p.ele != null ? Math.round(p.ele) : null, hr: p.hr });
    });
    return out;
  }, [track]);

  if (!hasEle && !hasHr) return <p className="muted">Ni altitude ni fréquence cardiaque dans ce fichier.</p>;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart
        data={data}
        margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
        onMouseMove={(s) => hover.current(s?.activePayload?.[0]?.payload.i ?? null)}
        onMouseLeave={() => hover.current(null)}
      >
        <defs>
          <linearGradient id="eleFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1e293b" vertical={false} />
        <XAxis dataKey="km" type="number" domain={[0, 'dataMax']} tickFormatter={(v) => `${v.toFixed(1)} km`}
          stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 12 }} tickCount={8} />
        {hasEle && <YAxis yAxisId="ele" domain={[(v) => Math.floor((v - 10) / 50) * 50, (v) => Math.ceil((v + 10) / 50) * 50]}
          tickFormatter={(v) => `${Math.round(v)} m`} stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 12 }} width={60} />}
        {hasHr && <YAxis yAxisId="hr" orientation="right" domain={[(v) => Math.floor((v - 5) / 20) * 20, (v) => Math.ceil((v + 5) / 20) * 20]}
          tickFormatter={(v) => Math.round(v)} stroke="#475569" tick={{ fill: '#f87171', fontSize: 12 }} width={40} />}
        <Tooltip content={<ChartTip />} cursor={{ stroke: ACCENT, strokeWidth: 1 }} />
        {hasEle && <Area yAxisId="ele" dataKey="ele" stroke="#cbd5e1" strokeWidth={1.5} fill="url(#eleFill)" isAnimationActive={false} />}
        {hasHr && <Line yAxisId="hr" dataKey="hr" stroke="#ef4444" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
      </ComposedChart>
    </ResponsiveContainer>
  );
});

function ChartTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="tip">
      <b>{p.km.toFixed(2)} km</b>
      {p.ele != null && <span>⛰ {p.ele} m</span>}
      {p.hr != null && <span className="hr">♥ {p.hr} bpm</span>}
    </div>
  );
}

export default ProfileChart;

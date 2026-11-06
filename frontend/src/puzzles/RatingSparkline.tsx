import { useState } from 'react';
import type { RatingPoint } from './stats';

// One series, so no legend: the panel title names it. A 2px line in the
// app's blue; hover (or touch) reads out the nearest point.
const W = 200;
const H = 48;
const PAD = 4;

export function RatingSparkline({ points }: { points: RatingPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) {
    return <div className="spark-empty">The rating chart appears after a few rated puzzles.</div>;
  }

  const values = points.map((p) => p.rating);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  // Keep small wobbles from filling the whole height.
  if (hi - lo < 60) {
    const mid = (hi + lo) / 2;
    lo = mid - 30;
    hi = mid + 30;
  }
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => PAD + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`).join(' ');

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    setHover(Math.round(f * (points.length - 1)));
  };

  const active = hover ?? null;
  const p = active != null ? points[active] : null;

  return (
    <div
      className="spark"
      onPointerMove={onMove}
      onPointerDown={onMove}
      onPointerLeave={() => setHover(null)}
      role="img"
      aria-label={`Rating over the last ${points.length} puzzles: from ${Math.round(values[0])} to ${Math.round(values.at(-1)!)}`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="spark-svg">
        <path d={path} className="spark-line" vectorEffect="non-scaling-stroke" />
      </svg>
      {p && active != null && (
        <>
          <span className="spark-dot" style={{ left: `${(x(active) / W) * 100}%`, top: `${(y(p.rating) / H) * 100}%` }} />
          <span className={`spark-tip ${active > points.length / 2 ? 'is-left' : ''}`}>
            <b>{Math.round(p.rating)}</b>{' '}
            {new Date(p.at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </span>
        </>
      )}
    </div>
  );
}

import { useState } from 'react';
import type { Judgment } from './analysis';

// Evaluation over the game as White's win chance (one series, so no legend;
// the panel label names it). The dashed midline is equality. Hover reads a
// point out, click jumps the board there; dots mark your judged moves.
const W = 300;
const H = 72;

export interface EvalPoint {
  win: number; // White's win %, 0–100
  label: string; // e.g. "14… Qxb2  −4.1"
}

export function EvalGraph(props: {
  points: EvalPoint[]; // index = ply
  current: number;
  marks: { ply: number; judgment: Judgment }[];
  onSelect: (ply: number) => void;
}) {
  const { points, current, marks, onSelect } = props;
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;

  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (win: number) => H - (win / 100) * H;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.win).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;

  const plyAt = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    return Math.round(f * (points.length - 1));
  };
  const pct = (i: number) => `${(x(i) / W) * 100}%`;
  const tip = hover != null ? points[hover] : null;

  return (
    <div
      className="eval-graph"
      onPointerMove={(e) => setHover(plyAt(e))}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => onSelect(plyAt(e))}
      role="img"
      aria-label="Evaluation graph: White's winning chances move by move"
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="eval-graph-svg">
        <path d={area} className="eval-graph-area" />
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="eval-graph-mid" vectorEffect="non-scaling-stroke" />
        <path d={line} className="eval-graph-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="eval-graph-side-tag is-top" title="Top area: White advantage">
        <span className="play-color-dot is-white" />
        <span>White</span>
      </div>
      <div className="eval-graph-side-tag is-bottom" title="Bottom area: Black advantage">
        <span className="play-color-dot is-black" />
        <span>Black</span>
      </div>
      <span className="eval-graph-cursor" style={{ left: pct(current) }} />
      {marks.map((m) => (
        <span
          key={m.ply}
          className={`eval-graph-mark is-${m.judgment}`}
          style={{ left: pct(m.ply), top: `${(y(points[m.ply]?.win ?? 50) / H) * 100}%` }}
        />
      ))}
      {tip && hover != null && (
        <>
          <span className="eval-graph-hover" style={{ left: pct(hover) }} />
          <span className={`eval-graph-tip ${hover > points.length / 2 ? 'is-left' : ''}`} style={{ left: pct(hover) }}>
            {tip.label}
          </span>
        </>
      )}
    </div>
  );
}

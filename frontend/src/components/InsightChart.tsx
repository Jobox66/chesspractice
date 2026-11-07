import React, { useEffect, useMemo, useRef, useState } from 'react';
import './InsightChart.css';
import { useTrainerStore } from '../store/state';

// Upcoming reviews as a GitHub-style calendar: one column per week (Sunday
// on top), one cell per day, shaded by how many moves fall due that day.
// Hover (or tap) a day for its date and count; the footer names the next
// review day outright, so the date is readable without hovering.

const WEEKS = 20;
const LEVELS = 5; // 0 = nothing due … 4 = the busiest day in the window

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function dayLabel(d: Date, today: Date): string {
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== today.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-GB', opts);
}

function relative(d: Date, today: Date): string | null {
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : null;
}

const moves = (n: number) => `${n} move${n === 1 ? '' : 's'}`;

// Quartiles of the busiest day, as on GitHub.
function level(count: number, max: number): number {
  if (count === 0) return 0;
  if (max <= 1) return LEVELS - 1;
  const r = count / max;
  return r <= 0.25 ? 1 : r <= 0.5 ? 2 : r <= 0.75 ? 3 : 4;
}

interface Day {
  date: Date;
  key: string;
  week: number;
  dow: number; // 0 = Sunday
  count: number;
  past: boolean;
}

const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

const InsightChart: React.FC = () => {
  const updateDueCounts = useTrainerStore((s) => s.updateDueCounts);
  const dueTimes = useTrainerStore((s) => s.dueTimes);
  const [active, setActive] = useState<{ key: string; pinned: boolean } | null>(null);
  const [tipPos, setTipPos] = useState<{ x: number; y: number; align: 'start' | 'center' | 'end' } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    updateDueCounts();
  }, [updateDueCounts]);

  const { days, months, today, next } = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    // Bucket by the calendar day each move falls due; anything overdue is
    // due today.
    const counts = new Map<string, number>();
    for (const ms of dueTimes ?? []) {
      const when = ms <= 0 ? today : startOfDay(new Date(now.getTime() + ms));
      const k = dateKey(when < today ? today : when);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    const first = addDays(today, -today.getDay()); // Sunday of this week
    const days: Day[] = [];
    for (let i = 0; i < WEEKS * 7; i++) {
      const date = addDays(first, i);
      const key = dateKey(date);
      days.push({ date, key, week: Math.floor(i / 7), dow: i % 7, count: counts.get(key) ?? 0, past: date < today });
    }

    // A month's name goes over the first week that contains its 1st; the
    // first column carries the current month unless the next label would
    // crowd it.
    const months: { week: number; label: string }[] = [];
    for (let w = 0; w < WEEKS; w++) {
      const col = days.slice(w * 7, w * 7 + 7);
      const firstOfMonth = col.find((d) => d.date.getDate() === 1);
      if (firstOfMonth) months.push({ week: w, label: firstOfMonth.date.toLocaleDateString('en-GB', { month: 'short' }) });
    }
    if (!months.length || months[0].week >= 3) {
      months.unshift({ week: 0, label: today.toLocaleDateString('en-GB', { month: 'short' }) });
    }

    const next = days.find((d) => !d.past && d.count > 0) ?? null;
    return { days, months, today, next };
  }, [dueTimes]);

  const max = useMemo(() => days.reduce((m, d) => Math.max(m, d.count), 0), [days]);
  const total = dueTimes?.length ?? 0;
  const todayKey = dateKey(today);
  const shown = active ? days.find((d) => d.key === active.key) ?? null : null;

  // Tap anywhere else to drop a pinned (tapped) day.
  useEffect(() => {
    if (!active?.pinned) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setActive(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [active?.pinned]);

  const place = (el: HTMLElement) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const a = wrap.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const x = b.left - a.left + b.width / 2;
    const align = x < 70 ? 'start' : x > a.width - 70 ? 'end' : 'center';
    setTipPos({ x: align === 'start' ? b.left - a.left : align === 'end' ? b.right - a.left : x, y: b.top - a.top, align });
  };

  return (
    <div className="sched" ref={wrapRef}>
      <div
        className="sched-grid"
        style={{ '--weeks': WEEKS } as React.CSSProperties}
        role="grid"
        aria-label={`Moves due per day over the next ${WEEKS} weeks`}
        onPointerLeave={() => {
          if (!active?.pinned) {
            setActive(null);
            setTipPos(null);
          }
        }}
      >
        {months.map((m) => (
          <span key={`m${m.week}`} className="sched-month" style={{ gridColumn: `${m.week + 2} / span 4` }}>
            {m.label}
          </span>
        ))}
        {WEEKDAY_LABELS.map((l, i) => (
          <span key={`d${i}`} className="sched-weekday" style={{ gridRow: i + 2 }}>
            {l}
          </span>
        ))}
        {days.map((d) =>
          d.past ? (
            <span key={d.key} className="sched-cell is-past" style={{ gridColumn: d.week + 2, gridRow: d.dow + 2 }} aria-hidden="true" />
          ) : (
            <button
              key={d.key}
              type="button"
              className={`sched-cell lv-${level(d.count, max)}${d.key === todayKey ? ' is-today' : ''}${shown?.key === d.key ? ' is-active' : ''}`}
              style={{ gridColumn: d.week + 2, gridRow: d.dow + 2 }}
              aria-label={`${dayLabel(d.date, today)}: ${d.count ? `${moves(d.count)} due` : 'nothing due'}`}
              onPointerEnter={(e) => {
                if (active?.pinned) return;
                setActive({ key: d.key, pinned: false });
                place(e.currentTarget);
              }}
              onClick={(e) => {
                setActive(active?.pinned && active.key === d.key ? null : { key: d.key, pinned: true });
                place(e.currentTarget);
              }}
              onFocus={(e) => {
                setActive({ key: d.key, pinned: false });
                place(e.currentTarget);
              }}
              onBlur={() => !active?.pinned && setActive(null)}
            />
          ),
        )}
      </div>

      {shown && tipPos && (
        <div className={`sched-tip is-${tipPos.align}`} style={{ left: tipPos.x, top: tipPos.y }} role="status">
          <strong>{shown.count ? `${moves(shown.count)} due` : 'Nothing due'}</strong>
          <span>
            {relative(shown.date, today) ? `${relative(shown.date, today)}, ` : ''}
            {dayLabel(shown.date, today)}
          </span>
        </div>
      )}

      <div className="sched-foot">
        <span className="sched-next">
          {total === 0 ? (
            <span className="sched-muted">No moves scheduled yet. Train a chapter to fill the calendar.</span>
          ) : next ? (
            <>
              <span className="sched-muted">Next review</span>{' '}
              <b>
                {relative(next.date, today) ? `${relative(next.date, today)} · ` : ''}
                {dayLabel(next.date, today)}
              </b>
              <span className="sched-muted"> · {moves(next.count)}</span>
            </>
          ) : (
            <span className="sched-muted">Nothing due in the next {WEEKS} weeks.</span>
          )}
        </span>
        <span className="sched-legend" aria-hidden="true">
          Less
          {Array.from({ length: LEVELS }, (_, i) => (
            <i key={i} className={`sched-swatch lv-${i}`} />
          ))}
          More
        </span>
      </div>
    </div>
  );
};

export default InsightChart;

import { useEffect, useMemo } from 'react';
import { XIcon } from 'lucide-react';
import { usePuzzleStore } from './store';
import { THEME_GROUPS } from './themes';
import { themeCounts, themeTally } from './stats';

// Every topic in the set as a tile, grouped (checkmates, length, tactics,
// phase): how many puzzles it has, how many you've done and how many of
// those you solved on the first try.
export function TopicPicker({ onClose }: { onClose: () => void }) {
  const { set, progress, settings, updateSettings } = usePuzzleStore();
  const counts = useMemo(() => (set ? themeCounts(set) : new Map<string, number>()), [set]);
  const tally = useMemo(() => (set ? themeTally(set, progress) : new Map()), [set, progress]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = (theme: string | null) => {
    updateSettings({ theme });
    onClose();
  };

  return (
    <div className="topic-backdrop" onClick={onClose}>
      <div className="topic-sheet" role="dialog" aria-label="Choose a topic" onClick={(e) => e.stopPropagation()}>
        <div className="topic-head">
          <h2>Topics</h2>
          <button type="button" className="topic-close" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <button type="button" className={`topic-tile topic-all ${settings.theme ? '' : 'is-active'}`} onClick={() => pick(null)}>
          <span className="topic-name">All puzzles</span>
          <span className="topic-meta">{set?.puzzles.length ?? 0} puzzles</span>
        </button>

        {THEME_GROUPS.map((g) => {
          const themes = g.themes.filter(([key]) => counts.has(key));
          if (themes.length === 0) return null;
          return (
            <section key={g.label} className="topic-group">
              <h3>{g.label}</h3>
              <div className="topic-grid">
                {themes.map(([key, label]) => {
                  const total = counts.get(key)!;
                  const t = tally.get(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`topic-tile ${settings.theme === key ? 'is-active' : ''}`}
                      onClick={() => pick(key)}
                    >
                      <span className="topic-name">{label}</span>
                      <span className="topic-meta">
                        {total} puzzle{total === 1 ? '' : 's'}
                        {t && ` · ${t.tried} done · ${Math.round((t.ok / t.tried) * 100)}% first try`}
                      </span>
                      <span className="topic-bar" aria-hidden="true">
                        <span style={{ width: `${Math.min(100, ((t?.tried ?? 0) / total) * 100)}%` }} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

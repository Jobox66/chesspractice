import type { PuzzleSet } from './data';
import type { AttemptLog, Progress } from './service';
import { SKILL_THEMES } from './themes';

export function todayStats(attempts: AttemptLog[]) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  let solved = 0;
  let failed = 0;
  let ms = 0;
  for (const a of attempts) {
    if (new Date(a.at) < start) continue;
    if (a.success) solved++;
    else failed++;
    ms += a.durationMs;
  }
  return { solved, failed, minutes: Math.round(ms / 60000) };
}

export interface RatingPoint {
  at: string;
  rating: number;
}

export function ratingSeries(attempts: AttemptLog[], limit = 100): RatingPoint[] {
  return attempts
    .filter((a) => a.ratingAfter != null)
    .slice(-limit)
    .map((a) => ({ at: a.at, rating: a.ratingAfter! }));
}

export interface ThemeStat {
  theme: string;
  attempts: number;
  successRate: number;
}

// Skill themes with the lowest first-try success, among those tried often
// enough to say anything. "First try" is the puzzle's first recorded result,
// approximated from progress: a puzzle that ever had a card was missed.
export function weakThemes(set: PuzzleSet, progress: Record<string, Progress>, minTried = 5, limit = 3): ThemeStat[] {
  const tally = new Map<string, { tried: number; ok: number }>();
  for (const [id, p] of Object.entries(progress)) {
    const puzzle = set.byId.get(id);
    if (!puzzle) continue;
    const firstTry = !p.card && p.successes > 0;
    for (const t of puzzle.themes) {
      if (!SKILL_THEMES.has(t)) continue;
      const row = tally.get(t) ?? { tried: 0, ok: 0 };
      row.tried++;
      if (firstTry) row.ok++;
      tally.set(t, row);
    }
  }
  return [...tally.entries()]
    .filter(([, r]) => r.tried >= minTried)
    .map(([theme, r]) => ({ theme, attempts: r.tried, successRate: r.ok / r.tried }))
    .sort((a, b) => a.successRate - b.successRate)
    .slice(0, limit);
}

export function themeCounts(set: PuzzleSet): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of set.puzzles) for (const t of p.themes) counts.set(t, (counts.get(t) ?? 0) + 1);
  return counts;
}

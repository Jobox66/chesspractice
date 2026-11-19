// Puzzle set shipped as a static file, built by scripts/build-puzzles.mjs
// from the Lichess puzzle database (CC0).
import { parsePuzzleSet, type PuzzleSet } from '../../../shared/puzzles';

export const PUZZLES_URL = '/puzzles/puzzles.json';

// 'missing' when the file hasn't been generated yet. The SPA rewrite
// answers a missing file with index.html, so a 404 is not the only sign.
export async function loadPuzzleSet(): Promise<PuzzleSet | 'missing'> {
  const res = await fetch(PUZZLES_URL);
  if (res.status === 404) return 'missing';
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('json')) return 'missing';
  const set = parsePuzzleSet(await res.json());
  if (!set) throw new Error('unknown puzzle file format');
  return set;
}

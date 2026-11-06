// Puzzle set shipped as a static file, built by scripts/build-puzzles.mjs
// from the Lichess puzzle database (CC0).

export interface Puzzle {
  id: string;
  // Position before the opponent's last move; moves[0] is that move and the
  // solver plays moves[1], moves[3], …
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
}

export interface PuzzleSet {
  puzzles: Puzzle[];
  byId: Map<string, Puzzle>;
  generatedAt: string;
}

export const PUZZLES_URL = '/puzzles/puzzles.json';

// 'missing' when the file hasn't been generated yet. The SPA rewrite
// answers a missing file with index.html, so a 404 is not the only sign.
export async function loadPuzzleSet(): Promise<PuzzleSet | 'missing'> {
  const res = await fetch(PUZZLES_URL);
  if (res.status === 404) return 'missing';
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('json')) return 'missing';
  const raw = await res.json();
  if (raw?.format !== 1 || !Array.isArray(raw.puzzles)) throw new Error('unknown puzzle file format');

  const puzzles: Puzzle[] = raw.puzzles.map((p: [string, string, string, number, string]) => ({
    id: p[0],
    fen: p[1],
    moves: p[2].split(' '),
    rating: p[3],
    themes: p[4] ? p[4].split(' ') : [],
  }));
  return {
    puzzles,
    byId: new Map(puzzles.map((p) => [p.id, p])),
    generatedAt: raw.generatedAt,
  };
}

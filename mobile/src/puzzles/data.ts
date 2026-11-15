// Bundled Lichess puzzle set (10,000 puzzles offline in APK).
import rawData from '../data/puzzles.json';

export interface Puzzle {
  id: string;
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

let cachedSet: PuzzleSet | null = null;

export async function loadPuzzleSet(): Promise<PuzzleSet | 'missing'> {
  if (cachedSet) return cachedSet;
  const raw = rawData as unknown as {
    format?: number;
    generatedAt?: string;
    puzzles?: [string, string, string, number, string][];
  };
  if (raw?.format !== 1 || !Array.isArray(raw.puzzles)) return 'missing';

  const puzzles: Puzzle[] = raw.puzzles.map((p) => ({
    id: p[0],
    fen: p[1],
    moves: p[2].split(' '),
    rating: p[3],
    themes: p[4] ? p[4].split(' ') : [],
  }));

  cachedSet = {
    puzzles,
    byId: new Map(puzzles.map((p) => [p.id, p])),
    generatedAt: raw.generatedAt ?? '',
  };
  return cachedSet;
}

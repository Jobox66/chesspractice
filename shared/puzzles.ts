// The puzzle set built by frontend/scripts/build-puzzles.mjs from the Lichess
// puzzle database (CC0). The web app fetches it; mobile bundles it.

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

// null when `raw` isn't a puzzle file this code understands.
export function parsePuzzleSet(raw: any): PuzzleSet | null {
  if (raw?.format !== 1 || !Array.isArray(raw.puzzles)) return null;
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
    generatedAt: raw.generatedAt ?? '',
  };
}

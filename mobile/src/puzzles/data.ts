// Bundled Lichess puzzle set (10,000 puzzles offline in APK).
import rawData from '../data/puzzles.json';
import { parsePuzzleSet, type PuzzleSet } from '../../../shared/puzzles';

let cachedSet: PuzzleSet | null = null;

export async function loadPuzzleSet(): Promise<PuzzleSet | 'missing'> {
  cachedSet ??= parsePuzzleSet(rawData);
  return cachedSet ?? 'missing';
}

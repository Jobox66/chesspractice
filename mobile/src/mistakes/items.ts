import { replay, type Color, type Game } from '../../../shared/game';
import { reviewMoves, type Judgment } from '../../../shared/analysis';

export interface MistakeItem {
  id: string;
  gameId: string;
  ply: number;
  color: Color;
  fen: string;
  prevFen: string | null;
  prevMove: string | null;
  played: string;
  playedSan: string;
  best: string;
  bestSan: string;
  judgment: Extract<Judgment, 'mistake' | 'blunder'>;
  drop: number;
  evalBefore: { cp: number | null; mate: number | null };
  evalBeforeText: string;
  evalAfterText: string;
  moveLabel: string;
  opponentElo: number;
  playedAt: string;
}

const MAX_ID = 32;

export function moveLabel(ply: number): string {
  return ply % 2 === 1 ? `${(ply + 1) / 2}.` : `${ply / 2}…`;
}

export function mistakesOf(game: Game): MistakeItem[] {
  const a = game.analysis;
  if (!game.result || !a) return [];
  let replayed;
  try {
    replayed = replay(game.moves);
  } catch {
    return [];
  }
  const { fens, sans } = replayed;
  if (a.evals.length !== fens.length) return [];
  const out: MistakeItem[] = [];
  for (const r of reviewMoves(game.moves, fens, a, sans)) {
    if (r.mover !== game.playerColor) continue;
    if (r.judgment !== 'mistake' && r.judgment !== 'blunder') continue;
    if (!r.best || !r.bestSan) continue;
    const id = `${game.id}-${r.ply}`;
    if (id.length > MAX_ID) continue;
    out.push({
      id,
      gameId: game.id,
      ply: r.ply,
      color: game.playerColor,
      fen: fens[r.ply - 1],
      prevFen: r.ply >= 2 ? fens[r.ply - 2] : null,
      prevMove: r.ply >= 2 ? game.moves[r.ply - 2] : null,
      played: game.moves[r.ply - 1],
      playedSan: sans[r.ply - 1],
      best: r.best,
      bestSan: r.bestSan,
      judgment: r.judgment,
      drop: r.drop,
      evalBefore: a.evals[r.ply - 1],
      evalBeforeText: r.evalBefore,
      evalAfterText: r.evalAfter,
      moveLabel: moveLabel(r.ply),
      opponentElo: game.elo,
      playedAt: game.endedAt ?? game.startedAt,
    });
  }
  return out;
}

export function collectMistakes(games: Game[]): MistakeItem[] {
  return [...games]
    .sort((a, b) => (b.endedAt ?? b.startedAt).localeCompare(a.endedAt ?? a.startedAt))
    .flatMap(mistakesOf);
}

export function unanalysedGames(games: Game[]): Game[] {
  return games.filter((g) => g.result && !g.analysis && g.moves.length > 0);
}


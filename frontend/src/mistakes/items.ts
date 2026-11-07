// Your own mistakes as exercises: every move of yours that the post-game
// analysis judged a mistake (?) or a blunder (??) becomes "find a better
// move" from the position before it. Items are derived from the saved games
// on the fly; only the progress on them is stored (drill kind "mistake").

import { replay, type Color, type Game } from '../play/game';
import { reviewMoves, type Judgment } from '../play/analysis';

export interface MistakeItem {
  id: string; // "<gameId>-<ply>"
  gameId: string;
  ply: number; // the mistaken move led to position `ply` (1-based, like fens)
  color: Color; // your side
  // The position to solve, and the opponent's move that led to it (shown as
  // a short intro so you see what you were answering).
  fen: string;
  prevFen: string | null;
  prevMove: string | null;
  played: string;
  playedSan: string;
  best: string;
  bestSan: string;
  judgment: Exclude<Judgment, 'inaccuracy'>;
  drop: number; // win% your move lost
  // Evaluation before the move, White's point of view.
  evalBefore: { cp: number | null; mate: number | null };
  evalBeforeText: string; // your point of view
  evalAfterText: string;
  moveLabel: string; // "14." or "14…"
  opponentElo: number;
  playedAt: string;
}

// Drill item ids are limited to 32 characters by the server.
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
  for (const r of reviewMoves(game.moves, fens, a)) {
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

// Newest games first; within a game, in move order.
export function collectMistakes(games: Game[]): MistakeItem[] {
  return [...games]
    .sort((a, b) => (b.endedAt ?? b.startedAt).localeCompare(a.endedAt ?? a.startedAt))
    .flatMap(mistakesOf);
}

export function unanalysedGames(games: Game[]): Game[] {
  return games.filter((g) => g.result && !g.analysis && g.moves.length > 0);
}

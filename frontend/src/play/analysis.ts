// Post-game review: Stockfish evaluates every position of a finished game,
// and each move is judged by how much it dropped the mover's winning chances
// (the Lichess method: win% from centipawns, thresholds 10 / 20 / 30).

import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import type { Engine } from './engine';
import { sanOf, turnOf, type Color } from './game';

export interface Analysis {
  v: 1;
  movetime: number;
  // Per position (index = ply, like fens): White's point of view.
  evals: { cp: number | null; mate: number | null }[];
  // Engine's best move from each position ('' when the game is over there).
  best: string[];
}

export type Judgment = 'inaccuracy' | 'mistake' | 'blunder';

export const JUDGMENT_SYMBOL: Record<Judgment, string> = { inaccuracy: '?!', mistake: '?', blunder: '??' };
export const JUDGMENT_LABEL: Record<Judgment, string> = { inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder' };

export interface MoveReview {
  ply: number; // the move that led to fens[ply]
  mover: Color;
  judgment: Judgment | null;
  drop: number; // mover's win% lost, ≥ 0
  best: string | null; // engine's move instead, when different from the one played
  bestSan: string | null;
  evalBefore: string; // mover's point of view
  evalAfter: string;
}

export const ANALYSIS_MOVETIME = 350;

// ---------------------------------------------------------------------------

// White's win chance (0–100) from a White-POV evaluation.
export function winPct(e: { cp: number | null; mate: number | null }): number {
  if (e.mate != null) return e.mate > 0 ? 100 : e.mate < 0 ? 0 : 50;
  const cp = Math.max(-1000, Math.min(1000, e.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function evalText(e: { cp: number | null; mate: number | null }, pov: Color): string {
  const sign = pov === 'white' ? 1 : -1;
  if (e.mate != null) {
    if (Math.abs(e.mate) < 1) return '#'; // checkmate on the board
    const m = e.mate * sign;
    return m > 0 ? `#${m}` : `#−${Math.abs(m)}`;
  }
  const v = ((e.cp ?? 0) * sign) / 100;
  return v > 0 ? `+${v.toFixed(1)}` : v < 0 ? `−${Math.abs(v).toFixed(1)}` : '0.0';
}

// Terminal positions have no search; score them directly.
function terminalEval(fen: string): { cp: number | null; mate: number | null } | null {
  const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
  // Already mated: a fractional mate score marks "mate on the board" and still
  // gives winPct 0 / 100 to the right side.
  if (pos.isCheckmate()) return { cp: null, mate: turnOf(fen) === 'white' ? -0.5 : 0.5 };
  if (pos.isStalemate() || pos.isInsufficientMaterial()) return { cp: 0, mate: null };
  return null;
}

export async function analyseGame(
  engine: Engine,
  fens: string[],
  onProgress: (done: number, total: number) => void,
  cancelled: () => boolean,
): Promise<Analysis | null> {
  const evals: Analysis['evals'] = [];
  const best: string[] = [];
  for (let i = 0; i < fens.length; i++) {
    if (cancelled()) return null;
    const fen = fens[i];
    const terminal = terminalEval(fen);
    if (terminal) {
      evals.push(terminal);
      best.push('');
    } else {
      const res = await engine.search(fen, 'max', `movetime ${ANALYSIS_MOVETIME}`);
      const sign = turnOf(fen) === 'white' ? 1 : -1;
      const line = res.line;
      evals.push({
        cp: line?.cp != null ? line.cp * sign : line?.mate != null ? null : 0,
        mate: line?.mate != null ? line.mate * sign : null,
      });
      best.push(res.bestmove ?? '');
    }
    onProgress(i + 1, fens.length);
  }
  return { v: 1, movetime: ANALYSIS_MOVETIME, evals, best };
}

// ---------------------------------------------------------------------------

export function reviewMoves(moves: string[], fens: string[], a: Analysis): MoveReview[] {
  const out: MoveReview[] = [];
  for (let ply = 1; ply < fens.length && ply < a.evals.length; ply++) {
    const before = a.evals[ply - 1];
    const after = a.evals[ply];
    const mover = turnOf(fens[ply - 1]);
    const toMover = (w: number) => (mover === 'white' ? w : 100 - w);
    const drop = Math.max(0, toMover(winPct(before)) - toMover(winPct(after)));
    const played = moves[ply - 1];
    const engineBest = a.best[ply - 1] || null;
    const sameAsBest = !!engineBest && sameMove(played, engineBest);
    let judgment: Judgment | null = null;
    if (!sameAsBest) {
      if (drop >= 30) judgment = 'blunder';
      else if (drop >= 20) judgment = 'mistake';
      else if (drop >= 10) judgment = 'inaccuracy';
    }
    const best = engineBest && !sameAsBest ? engineBest : null;
    out.push({
      ply,
      mover,
      judgment,
      drop,
      best,
      bestSan: best ? safeSan(fens[ply - 1], best) : null,
      evalBefore: evalText(before, mover),
      evalAfter: evalText(after, mover),
    });
  }
  return out;
}

// e1g1 vs e1h1 etc.: compare on squares + promotion, castling either form.
function sameMove(a: string, b: string): boolean {
  if (a === b) return true;
  const castle: Record<string, string> = { e1h1: 'e1g1', e1a1: 'e1c1', e8h8: 'e8g8', e8a8: 'e8c8' };
  return (castle[a] ?? a) === (castle[b] ?? b);
}

function safeSan(fen: string, uci: string): string | null {
  try {
    return sanOf(fen, uci);
  } catch {
    return null;
  }
}

// Lichess-style per-move accuracy from the win% drop, averaged.
export function accuracy(reviews: MoveReview[], color: Color): number | null {
  const mine = reviews.filter((r) => r.mover === color);
  if (mine.length === 0) return null;
  const per = mine.map((r) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * r.drop) - 3.1669 + 1)));
  return Math.round(per.reduce((s, x) => s + x, 0) / per.length);
}

export function judgmentCounts(reviews: MoveReview[], color: Color) {
  const c = { inaccuracy: 0, mistake: 0, blunder: 0 };
  for (const r of reviews) if (r.mover === color && r.judgment) c[r.judgment]++;
  return c;
}

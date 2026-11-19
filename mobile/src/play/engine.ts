// Native-compatible Chess Engine (PeSTO Tapered Eval + Iterative Deepening Alpha-Beta + Quiescence Search).
// Runs 100% natively in React Native / Hermes without needing WebAssembly or WebWorkers,
// while providing the exact same UCI-like Engine interface as the web's Stockfish worker.

import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import type { Move, Role } from 'chessops';
import { OPENING_DATABASE } from '../../../shared/openings';

export const MIN_UCI_ELO = 1320;
export const MAX_UCI_ELO = 3190;

export type Strength = { elo: number } | 'max';

export interface SearchLine {
  cp: number | null;
  mate: number | null;
  pv: string[];
}

export interface SearchResult {
  bestmove: string | null;
  line: SearchLine | null;
}

// Post-game review search time per position: shorter than the web's
// (shared/analysis ANALYSIS_MOVETIME) to keep reviews quick on a phone.
export const REVIEW_MOVETIME = 180;

export function lowSkill(elo: number): number {
  return Math.max(0, Math.min(5, Math.round((elo - 800) / 100)));
}

// PeSTO Material values (centipawns)
const MG_VALUE: Record<Role, number> = {
  pawn: 82,
  knight: 337,
  bishop: 365,
  rook: 477,
  queen: 1025,
  king: 0,
};

const EG_VALUE: Record<Role, number> = {
  pawn: 94,
  knight: 281,
  bishop: 297,
  rook: 512,
  queen: 936,
  king: 0,
};

const PHASE_WEIGHT: Record<Role, number> = {
  pawn: 0,
  knight: 1,
  bishop: 1,
  rook: 2,
  queen: 4,
  king: 0,
};

// Piece-square tables (from White's perspective, rank 8 down to rank 1, flipped by rank^7 for index 0..63)
const PST_PAWN_MG = [
   0,   0,   0,   0,   0,   0,   0,   0,
  98, 134,  61,  95,  68, 126,  34, -11,
  -6,   7,  26,  31,  65,  56,  25, -20,
 -14,  13,   6,  21,  23,  12,  17, -23,
 -27,  -2,  -5,  12,  17,   6,  10, -25,
 -26,  -4,  -4, -10,   3,   3,  33, -12,
 -35,  -1, -20, -23, -15,  24,  38, -22,
   0,   0,   0,   0,   0,   0,   0,   0,
];

const PST_PAWN_EG = [
   0,   0,   0,   0,   0,   0,   0,   0,
 178, 173, 158, 134, 147, 132, 165, 187,
  94, 100,  85,  67,  56,  53,  82,  84,
  32,  24,  13,   5,  -2,   4,  17,  17,
  13,   9,  -3,  -7,  -7,  -8,   3,  -1,
   4,   7,  -6,   1,   0,  -5,  -1,  -8,
  13,   8,   8,  10,  13,   0,   2,  -7,
   0,   0,   0,   0,   0,   0,   0,   0,
];

const PST_KNIGHT = [
 -50, -40, -30, -30, -30, -30, -40, -50,
 -40, -20,   0,   5,   5,   0, -20, -40,
 -30,   5,  15,  20,  20,  15,   5, -30,
 -30,   0,  20,  25,  25,  20,   0, -30,
 -30,   5,  15,  22,  22,  15,   5, -30,
 -30,   0,  12,  15,  15,  12,   0, -30,
 -40, -20,   0,   0,   0,   0, -20, -40,
 -50, -40, -30, -30, -30, -30, -40, -50,
];

const PST_BISHOP = [
 -20, -10, -10, -10, -10, -10, -10, -20,
 -10,   5,   0,   0,   0,   0,   5, -10,
 -10,  10,  10,  12,  12,  10,  10, -10,
 -10,   0,  12,  15,  15,  12,   0, -10,
 -10,   5,   8,  15,  15,   8,   5, -10,
 -10,   0,   8,  10,  10,   8,   0, -10,
 -10,  12,   0,   0,   0,   0,  12, -10,
 -20, -10, -10, -10, -10, -10, -10, -20,
];

const PST_ROOK = [
   0,   0,   5,  10,  10,   5,   0,   0,
   5,  15,  15,  20,  20,  15,  15,   5,
  -5,   0,   0,   5,   5,   0,   0,  -5,
  -5,   0,   0,   5,   5,   0,   0,  -5,
  -5,   0,   0,   5,   5,   0,   0,  -5,
  -5,   0,   0,   5,   5,   0,   0,  -5,
  -5,   0,   0,   5,   5,   0,   0,  -5,
   0,   0,   5,  12,  12,   5,   0,   0,
];

const PST_QUEEN = [
 -20, -10, -10,  -5,  -5, -10, -10, -20,
 -10,   0,   5,   0,   0,   0,   0, -10,
 -10,   5,   5,   5,   5,   5,   0, -10,
   0,   0,   5,   8,   8,   5,   0,  -5,
  -5,   0,   5,   8,   8,   5,   0,  -5,
 -10,   0,   5,   5,   5,   5,   0, -10,
 -10,   0,   0,   0,   0,   0,   0, -10,
 -20, -10, -10,  -5,  -5, -10, -10, -20,
];

const PST_KING_MG = [
 -30, -40, -40, -50, -50, -40, -40, -30,
 -30, -40, -40, -50, -50, -40, -40, -30,
 -30, -40, -40, -50, -50, -40, -40, -30,
 -30, -40, -40, -50, -50, -40, -40, -30,
 -20, -30, -30, -40, -40, -30, -30, -20,
 -10, -20, -20, -20, -20, -20, -20, -10,
  20,  20,   0,   0,   0,   0,  20,  20,
  20,  30,  15,   0,   0,  10,  30,  20,
];

const PST_KING_EG = [
 -50, -30, -30, -30, -30, -30, -30, -50,
 -30, -10,   0,   0,   0,   0, -10, -30,
 -30,  -5,  20,  30,  30,  20,  -5, -30,
 -30,  -5,  30,  40,  40,  30,  -5, -30,
 -30,  -5,  30,  40,  40,  30,  -5, -30,
 -30,  -5,  20,  30,  30,  20,  -5, -30,
 -30, -20, -10,   0,   0, -10, -20, -30,
 -50, -40, -30, -20, -20, -30, -40, -50,
];

function pstIndex(sq: number, color: 'white' | 'black'): number {
  const file = sq & 7;
  const rank = sq >> 3;
  const r = color === 'white' ? 7 - rank : rank;
  return r * 8 + file;
}

// Static evaluation from side-to-move's perspective (centipawns)
export function evaluatePosition(pos: Chess): number {
  let mgWhite = 0;
  let mgBlack = 0;
  let egWhite = 0;
  let egBlack = 0;
  let phase = 0;
  let whiteBishops = 0;
  let blackBishops = 0;

  for (const [sq, piece] of pos.board) {
    const idx = pstIndex(sq, piece.color);
    const r = piece.role;
    phase += PHASE_WEIGHT[r];
    let mg = MG_VALUE[r];
    let eg = EG_VALUE[r];

    if (r === 'pawn') {
      mg += PST_PAWN_MG[idx];
      eg += PST_PAWN_EG[idx];
    } else if (r === 'knight') {
      mg += PST_KNIGHT[idx];
      eg += PST_KNIGHT[idx];
    } else if (r === 'bishop') {
      mg += PST_BISHOP[idx];
      eg += PST_BISHOP[idx];
      if (piece.color === 'white') whiteBishops++;
      else blackBishops++;
    } else if (r === 'rook') {
      mg += PST_ROOK[idx];
      eg += PST_ROOK[idx];
    } else if (r === 'queen') {
      mg += PST_QUEEN[idx];
      eg += PST_QUEEN[idx];
    } else if (r === 'king') {
      mg += PST_KING_MG[idx];
      eg += PST_KING_EG[idx];
    }

    if (piece.color === 'white') {
      mgWhite += mg;
      egWhite += eg;
    } else {
      mgBlack += mg;
      egBlack += eg;
    }
  }

  if (whiteBishops >= 2) {
    mgWhite += 30;
    egWhite += 45;
  }
  if (blackBishops >= 2) {
    mgBlack += 30;
    egBlack += 45;
  }

  const mgPhase = Math.min(24, phase);
  const egPhase = 24 - mgPhase;
  const mgScore = mgWhite - mgBlack;
  const egScore = egWhite - egBlack;
  const whiteEval = Math.round((mgScore * mgPhase + egScore * egPhase) / 24);

  // Small tempo bonus for side to move
  const sideSign = pos.turn === 'white' ? 1 : -1;
  return whiteEval * sideSign + 12;
}

function generateOrderedMoves(pos: Chess, onlyCaptures = false, pvMoveUci?: string): Move[] {
  const ctx = pos.ctx();
  const scored: { move: Move; score: number }[] = [];

  for (const [from, dests] of pos.allDests(ctx)) {
    const piece = pos.board.get(from);
    if (!piece) continue;
    for (const to of dests) {
      const target = pos.board.get(to);
      const isEp = piece.role === 'pawn' && to === pos.epSquare;
      const isCapture = !!target || isEp;
      const isPromo = piece.role === 'pawn' && (to >= 56 || to <= 7);

      if (onlyCaptures && !isCapture && !isPromo) continue;

      let baseScore = 0;
      if (isCapture) {
        const victimVal = target ? MG_VALUE[target.role] : MG_VALUE.pawn;
        baseScore += 10000 + victimVal * 10 - MG_VALUE[piece.role];
      }
      if (isPromo) {
        const roles: Role[] = onlyCaptures ? ['queen'] : ['queen', 'knight', 'rook', 'bishop'];
        for (const promotion of roles) {
          const m: Move = { from, to, promotion };
          const uci = makeUci(m);
          const s = baseScore + (promotion === 'queen' ? 9000 : 3000) + (uci === pvMoveUci ? 50000 : 0);
          scored.push({ move: m, score: s });
        }
        continue;
      }

      // Positional move ordering hint (center control)
      const toIdx = pstIndex(to, piece.color);
      const fromIdx = pstIndex(from, piece.color);
      if (piece.role === 'knight' || piece.role === 'bishop') {
        baseScore += PST_KNIGHT[toIdx] - PST_KNIGHT[fromIdx];
      } else if (piece.role === 'pawn') {
        baseScore += PST_PAWN_MG[toIdx] - PST_PAWN_MG[fromIdx];
      }

      const m: Move = { from, to };
      if (pvMoveUci && makeUci(m) === pvMoveUci) {
        baseScore += 50000;
      }
      scored.push({ move: m, score: baseScore });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.move);
}

const MATE_SCORE = 30000;

function quiescence(pos: Chess, alpha: number, beta: number, qDepth: number): number {
  const inCheck = pos.isCheck();
  if (!inCheck) {
    const standPat = evaluatePosition(pos);
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    if (qDepth <= 0) return alpha;
  }

  const moves = generateOrderedMoves(pos, !inCheck);
  if (inCheck && moves.length === 0) {
    return -MATE_SCORE;
  }

  for (const m of moves) {
    const child = pos.clone();
    child.play(m);
    const score = -quiescence(child, -beta, -alpha, qDepth - 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

// Build a map of FEN (first 4 fields) -> book SAN replies from OPENING_DATABASE
let bookByFen: Map<string, string[]> | null = null;
function getBookByFen(): Map<string, string[]> {
  if (bookByFen) return bookByFen;
  bookByFen = new Map();
  for (const entry of OPENING_DATABASE) {
    const pos = Chess.default();
    for (const san of entry.moves) {
      const fenKey = makeFenKey(pos);
      const move = parseSan(pos, san);
      if (!move) break;
      const uci = makeUci(move);
      const list = bookByFen.get(fenKey) ?? [];
      if (!list.includes(uci)) {
        list.push(uci);
        bookByFen.set(fenKey, list);
      }
      pos.play(move);
    }
  }
  return bookByFen;
}

function makeFenKey(pos: Chess): string {
  const setup = pos.toSetup();
  // Use piece placement + turn
  let ranks = '';
  for (let r = 7; r >= 0; r--) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = setup.board.get(r * 8 + f);
      if (!p) {
        empty++;
      } else {
        if (empty > 0) {
          ranks += empty;
          empty = 0;
        }
        const ch = p.role === 'knight' ? 'n' : p.role[0];
        ranks += p.color === 'white' ? ch.toUpperCase() : ch;
      }
    }
    if (empty > 0) ranks += empty;
    if (r > 0) ranks += '/';
  }
  return `${ranks} ${setup.turn}`;
}

export class Engine {
  private chain: Promise<unknown> = Promise.resolve();
  private stopped = false;
  readonly ready: Promise<void> = Promise.resolve();
  failed = false;

  stop() {
    this.stopped = true;
  }

  newGame() {
    this.stopped = false;
  }

  search(fen: string, strength: Strength, go: string): Promise<SearchResult> {
    const run = async (): Promise<SearchResult> => {
      this.stopped = false;
      const parsed = parseFen(fen);
      if (parsed.isErr) return { bestmove: null, line: null };
      const posRes = Chess.fromSetup(parsed.value);
      if (posRes.isErr) return { bestmove: null, line: null };
      const pos = posRes.value;

      const rootMoves = generateOrderedMoves(pos, false);
      if (rootMoves.length === 0) {
        return { bestmove: null, line: { cp: 0, mate: pos.isCheck() ? -1 : null, pv: [] } };
      }

      const elo = strength === 'max' ? 3000 : strength.elo;
      const movetimeMatch = go.match(/movetime\s+(\d+)/);
      const maxTimeMs = movetimeMatch ? Math.min(Number(movetimeMatch[1]), 600) : 250;

      // Determine target depth based on Elo and movetime
      let maxDepth = 3;
      if (elo >= 2400) maxDepth = maxTimeMs >= 300 ? 4 : 3;
      else if (elo >= 1700) maxDepth = 3;
      else if (elo >= 1200) maxDepth = 2;
      else maxDepth = 1;

      // Check opening book for opponent moves when Elo >= 1200 and not an analysis search
      const isAnalysisOrHint = strength === 'max' && maxTimeMs <= 400;
      const bookMoves = getBookByFen().get(makeFenKey(pos));
      if (!isAnalysisOrHint && bookMoves && bookMoves.length > 0 && elo >= 1100) {
        const validBook = bookMoves.filter((u) => rootMoves.some((m) => makeUci(m) === u));
        if (validBook.length > 0) {
          const chosen = validBook[Math.floor(Math.random() * validBook.length)];
          const evalCp = evaluatePosition(pos);
          return {
            bestmove: chosen,
            line: { cp: evalCp, mate: null, pv: [chosen] },
          };
        }
      }

      const deadline = Date.now() + maxTimeMs;
      let bestUci = makeUci(rootMoves[0]);
      let bestScore = evaluatePosition(pos);
      let nodes = 0;

      const searchAlphaBeta = async (
        nodePos: Chess,
        depth: number,
        alpha: number,
        beta: number,
        ply: number,
      ): Promise<number> => {
        nodes++;
        if ((nodes & 255) === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
        if (this.stopped) return 0;

        const inCheck = nodePos.isCheck();
        const ext = inCheck && ply < 6 ? 1 : 0;
        const effectiveDepth = depth + ext;

        if (effectiveDepth <= 0) {
          return quiescence(nodePos, alpha, beta, 3);
        }

        const moves = generateOrderedMoves(nodePos, false);
        if (moves.length === 0) {
          return inCheck ? -(MATE_SCORE - ply) : 0;
        }
        if (nodePos.isInsufficientMaterial() || nodePos.halfmoves >= 100) {
          return 0;
        }

        let best = -Infinity;
        for (const m of moves) {
          const child = nodePos.clone();
          child.play(m);
          const score = -(await searchAlphaBeta(child, effectiveDepth - 1, -beta, -alpha, ply + 1));
          if (this.stopped) return best === -Infinity ? 0 : best;
          if (score > best) best = score;
          if (score > alpha) alpha = score;
          if (alpha >= beta) break;
        }
        return best;
      };

      const rootScored: { uci: string; score: number }[] = [];

      for (let d = 1; d <= maxDepth; d++) {
        if (this.stopped || (d > 1 && Date.now() >= deadline)) break;
        const ordered = generateOrderedMoves(pos, false, bestUci);
        let alpha = -Infinity;
        const beta = Infinity;
        let iterBestUci = bestUci;
        let iterBestScore = -Infinity;
        const currentScores: { uci: string; score: number }[] = [];

        for (const m of ordered) {
          const child = pos.clone();
          child.play(m);
          const uci = makeUci(m);
          const score = -(await searchAlphaBeta(child, d - 1, -beta, -alpha, 1));
          if (this.stopped) break;
          currentScores.push({ uci, score });
          if (score > iterBestScore) {
            iterBestScore = score;
            iterBestUci = uci;
          }
          if (score > alpha) alpha = score;
        }

        if (!this.stopped && iterBestScore > -Infinity) {
          bestUci = iterBestUci;
          bestScore = iterBestScore;
          rootScored.splice(0, rootScored.length, ...currentScores);
        }
      }

      // If strength is limited (< 2200), add human-like noise to pick among top moves
      if (strength !== 'max' && elo < 2200 && rootScored.length > 1) {
        const noiseRange = Math.max(0, (2200 - elo) * 0.18); // e.g. at 1200 elo -> ~180 cp noise
        const noisy = rootScored.map((item) => ({
          uci: item.uci,
          realScore: item.score,
          noisyScore: item.score + (Math.random() - 0.5) * noiseRange,
        }));
        noisy.sort((a, b) => b.noisyScore - a.noisyScore);
        bestUci = noisy[0].uci;
        bestScore = noisy[0].realScore;
      }

      // If position is in opening book and bestUci is nearly equal to a book move, prefer book move
      if (bookMoves && bookMoves.length > 0 && rootScored.length > 0) {
        const topBook = rootScored.find((r) => bookMoves.includes(r.uci) && bestScore - r.score < 35);
        if (topBook) {
          bestUci = topBook.uci;
          bestScore = topBook.score;
        }
      }

      let cp: number | null = bestScore;
      let mate: number | null = null;
      if (Math.abs(bestScore) >= MATE_SCORE - 100) {
        const plies = MATE_SCORE - Math.abs(bestScore);
        const movesToMate = Math.max(1, Math.ceil(plies / 2));
        mate = bestScore > 0 ? movesToMate : -movesToMate;
        cp = null;
      }

      return {
        bestmove: bestUci,
        line: {
          cp,
          mate,
          pv: [bestUci],
        },
      };
    };

    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }
}

let shared: Engine | null = null;
export function getEngine(): Engine {
  if (!shared || shared.failed) shared = new Engine();
  return shared;
}

// Native-compatible Chess Engine (PeSTO Tapered Eval + Positional Heuristics +
// Synchronous Iterative Deepening Alpha-Beta + Transposition Table + NMP + LMR + Quiescence).
// Runs 100% natively in React Native / Hermes without needing WebAssembly or WebWorkers,
// while providing the exact same UCI-like Engine interface as the web's Stockfish worker.

import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import type { NormalMove, Role } from 'chessops';
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

// Post-game review search time per position
export const REVIEW_MOVETIME = 220;

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

// Piece-square tables (from White's perspective, rank 8 down to rank 1)
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

const PASSED_PAWN_MG = [0, 5, 10, 20, 35, 60, 100, 0];
const PASSED_PAWN_EG = [0, 10, 20, 38, 65, 110, 175, 0];

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

  const wPawnFiles = [0, 0, 0, 0, 0, 0, 0, 0];
  const bPawnFiles = [0, 0, 0, 0, 0, 0, 0, 0];
  const wMaxPawnRank = [0, 0, 0, 0, 0, 0, 0, 0];
  const bMinPawnRank = [7, 7, 7, 7, 7, 7, 7, 7];
  const wRookFiles: number[] = [];
  const bRookFiles: number[] = [];
  let wKingSq = -1;
  let bKingSq = -1;

  for (const [sq, piece] of pos.board) {
    const file = sq & 7;
    const rank = sq >> 3;
    const idx = pstIndex(sq, piece.color);
    const r = piece.role;
    phase += PHASE_WEIGHT[r];
    let mg = MG_VALUE[r];
    let eg = EG_VALUE[r];

    if (r === 'pawn') {
      mg += PST_PAWN_MG[idx];
      eg += PST_PAWN_EG[idx];
      if (piece.color === 'white') {
        wPawnFiles[file]++;
        if (rank > wMaxPawnRank[file]) wMaxPawnRank[file] = rank;
      } else {
        bPawnFiles[file]++;
        if (rank < bMinPawnRank[file]) bMinPawnRank[file] = rank;
      }
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
      if (piece.color === 'white') wRookFiles.push(file);
      else bRookFiles.push(file);
    } else if (r === 'queen') {
      mg += PST_QUEEN[idx];
      eg += PST_QUEEN[idx];
    } else if (r === 'king') {
      mg += PST_KING_MG[idx];
      eg += PST_KING_EG[idx];
      if (piece.color === 'white') wKingSq = sq;
      else bKingSq = sq;
    }

    if (piece.color === 'white') {
      mgWhite += mg;
      egWhite += eg;
    } else {
      mgBlack += mg;
      egBlack += eg;
    }
  }

  // Bishop pair
  if (whiteBishops >= 2) {
    mgWhite += 32;
    egWhite += 48;
  }
  if (blackBishops >= 2) {
    mgBlack += 32;
    egBlack += 48;
  }

  // Pawn structure: doubled, isolated, passed pawns
  for (let f = 0; f < 8; f++) {
    const wc = wPawnFiles[f];
    const bc = bPawnFiles[f];
    if (wc > 0) {
      if (wc > 1) {
        mgWhite -= 14 * (wc - 1);
        egWhite -= 20 * (wc - 1);
      }
      const left = f > 0 ? wPawnFiles[f - 1] : 0;
      const right = f < 7 ? wPawnFiles[f + 1] : 0;
      if (left === 0 && right === 0) {
        mgWhite -= 12;
        egWhite -= 15;
      }
      // Passed pawn check for most advanced white pawn on file f
      const r = wMaxPawnRank[f];
      const blockedAhead =
        (bPawnFiles[f] > 0 && bMinPawnRank[f] > r) ||
        (f > 0 && bPawnFiles[f - 1] > 0 && bMinPawnRank[f - 1] > r) ||
        (f < 7 && bPawnFiles[f + 1] > 0 && bMinPawnRank[f + 1] > r);
      if (!blockedAhead) {
        mgWhite += PASSED_PAWN_MG[r];
        egWhite += PASSED_PAWN_EG[r];
      }
    }
    if (bc > 0) {
      if (bc > 1) {
        mgBlack -= 14 * (bc - 1);
        egBlack -= 20 * (bc - 1);
      }
      const left = f > 0 ? bPawnFiles[f - 1] : 0;
      const right = f < 7 ? bPawnFiles[f + 1] : 0;
      if (left === 0 && right === 0) {
        mgBlack -= 12;
        egBlack -= 15;
      }
      const r = bMinPawnRank[f];
      const blockedAhead =
        (wPawnFiles[f] > 0 && wMaxPawnRank[f] < r) ||
        (f > 0 && wPawnFiles[f - 1] > 0 && wMaxPawnRank[f - 1] < r) ||
        (f < 7 && wPawnFiles[f + 1] > 0 && wMaxPawnRank[f + 1] < r);
      if (!blockedAhead) {
        const adv = 7 - r;
        mgBlack += PASSED_PAWN_MG[adv];
        egBlack += PASSED_PAWN_EG[adv];
      }
    }
  }

  // Rooks on open / semi-open files
  for (const f of wRookFiles) {
    if (wPawnFiles[f] === 0) {
      mgWhite += bPawnFiles[f] === 0 ? 22 : 12;
      egWhite += bPawnFiles[f] === 0 ? 15 : 8;
    }
  }
  for (const f of bRookFiles) {
    if (bPawnFiles[f] === 0) {
      mgBlack += wPawnFiles[f] === 0 ? 22 : 12;
      egBlack += wPawnFiles[f] === 0 ? 15 : 8;
    }
  }

  // King pawn shield (middlegame safety)
  if (wKingSq >= 0 && (wKingSq >> 3) <= 1) {
    const kf = wKingSq & 7;
    for (let df = -1; df <= 1; df++) {
      const f = kf + df;
      if (f >= 0 && f <= 7) {
        const p2 = pos.board.get(8 + f);
        const p3 = pos.board.get(16 + f);
        if (p2?.role === 'pawn' && p2.color === 'white') mgWhite += 12;
        else if (p3?.role === 'pawn' && p3.color === 'white') mgWhite += 6;
      }
    }
  }
  if (bKingSq >= 0 && (bKingSq >> 3) >= 6) {
    const kf = bKingSq & 7;
    for (let df = -1; df <= 1; df++) {
      const f = kf + df;
      if (f >= 0 && f <= 7) {
        const p7 = pos.board.get(48 + f);
        const p6 = pos.board.get(40 + f);
        if (p7?.role === 'pawn' && p7.color === 'black') mgBlack += 12;
        else if (p6?.role === 'pawn' && p6.color === 'black') mgBlack += 6;
      }
    }
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

function hasNonPawnMaterial(pos: Chess, color: 'white' | 'black'): boolean {
  for (const [, piece] of pos.board) {
    if (piece.color === color && piece.role !== 'pawn' && piece.role !== 'king') {
      return true;
    }
  }
  return false;
}

// Transposition table entry flags
const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = 2;
const TT_MAX_SIZE = 32768;

interface TTEntry {
  depth: number;
  score: number;
  flag: number;
  bestUci: string | null;
}

interface OrderedMove {
  move: NormalMove;
  uci: string;
  isCapture: boolean;
  isPromo: boolean;
  victimVal: number;
  score: number;
}

function generateOrderedMoves(
  pos: Chess,
  onlyCaptures: boolean,
  ttMoveUci: string | null,
  killers: [string | null, string | null] | null,
  history: Int32Array | null,
): OrderedMove[] {
  const ctx = pos.ctx();
  const scored: OrderedMove[] = [];

  for (const [from, dests] of pos.allDests(ctx)) {
    const piece = pos.board.get(from);
    if (!piece) continue;
    for (const to of dests) {
      const target = pos.board.get(to);
      const isEp = piece.role === 'pawn' && to === pos.epSquare;
      const isCapture = !!target || isEp;
      const isPromo = piece.role === 'pawn' && (to >= 56 || to <= 7);

      if (onlyCaptures && !isCapture && !isPromo) continue;

      const victimVal = target ? MG_VALUE[target.role] : isEp ? MG_VALUE.pawn : 0;

      if (isPromo) {
        const roles: Role[] = onlyCaptures ? ['queen'] : ['queen', 'knight', 'rook', 'bishop'];
        for (const promotion of roles) {
          const m: NormalMove = { from, to, promotion };
          const uci = makeUci(m);
          let s = (isCapture ? 100000 + victimVal * 10 - MG_VALUE.pawn : 0) + (promotion === 'queen' ? 90000 : 30000);
          if (uci === ttMoveUci) s = 1000000;
          scored.push({ move: m, uci, isCapture, isPromo: true, victimVal: victimVal + 800, score: s });
        }
        continue;
      }

      const m: NormalMove = { from, to };
      const uci = makeUci(m);
      let s = 0;

      if (uci === ttMoveUci) {
        s = 1000000;
      } else if (isCapture) {
        // MVV-LVA
        s = 100000 + victimVal * 10 - MG_VALUE[piece.role];
      } else if (killers && (uci === killers[0] || uci === killers[1])) {
        s = uci === killers[0] ? 90000 : 85000;
      } else {
        if (history) {
          s += Math.min(50000, history[(from << 6) | to]);
        }
        const toIdx = pstIndex(to, piece.color);
        const fromIdx = pstIndex(from, piece.color);
        if (piece.role === 'knight' || piece.role === 'bishop') {
          s += PST_KNIGHT[toIdx] - PST_KNIGHT[fromIdx];
        } else if (piece.role === 'pawn') {
          s += PST_PAWN_MG[toIdx] - PST_PAWN_MG[fromIdx];
        }
      }

      scored.push({ move: m, uci, isCapture, isPromo: false, victimVal, score: s });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

const MATE_SCORE = 30000;
const MATE_THRESHOLD = MATE_SCORE - 200;

// Fast position key for book & transposition table
function makeFenKey(pos: Chess, includeState = false): string {
  const setup = pos.toSetup();
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
  if (!includeState) return `${ranks} ${setup.turn === 'white' ? 'w' : 'b'}`;
  const ep = setup.epSquare ?? -1;
  return `${ranks} ${setup.turn === 'white' ? 'w' : 'b'} ${setup.castlingRights.toString()} ${ep}`;
}

// Build a map of FEN (piece placement + turn) -> book UCI replies from OPENING_DATABASE
let bookByFen: Map<string, string[]> | null = null;
function getBookByFen(): Map<string, string[]> {
  if (bookByFen) return bookByFen;
  bookByFen = new Map();
  for (const entry of OPENING_DATABASE) {
    const pos = Chess.default();
    for (const san of entry.moves) {
      const fenKey = makeFenKey(pos, false);
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

export class Engine {
  private chain: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private tt = new Map<string, TTEntry>();
  readonly ready: Promise<void> = Promise.resolve();
  failed = false;

  stop() {
    this.stopped = true;
  }

  newGame() {
    this.stopped = false;
    this.tt.clear();
  }

  search(fen: string, strength: Strength, go: string): Promise<SearchResult> {
    const run = async (): Promise<SearchResult> => {
      this.stopped = false;
      const parsed = parseFen(fen);
      if (parsed.isErr) return { bestmove: null, line: null };
      const posRes = Chess.fromSetup(parsed.value);
      if (posRes.isErr) return { bestmove: null, line: null };
      const pos = posRes.value;

      const rootMoves = generateOrderedMoves(pos, false, null, null, null);
      if (rootMoves.length === 0) {
        return { bestmove: null, line: { cp: 0, mate: pos.isCheck() ? -1 : null, pv: [] } };
      }

      const elo = strength === 'max' ? 3000 : strength.elo;
      const movetimeMatch = go.match(/movetime\s+(\d+)/);
      const maxTimeMs = movetimeMatch ? Math.min(Number(movetimeMatch[1]), 1400) : 350;

      // Target depth calibrated by Elo (synchronous search easily reaches depth 5-6 on mobile)
      let maxDepth = 5;
      if (strength === 'max' || elo >= 2200) maxDepth = 8;
      else if (elo >= 1800) maxDepth = 6;
      else if (elo >= 1500) maxDepth = 5;
      else if (elo >= 1300) maxDepth = 4;
      else if (elo >= 1100) maxDepth = 3;
      else if (elo >= 900) maxDepth = 2;
      else maxDepth = 1;

      // Check opening book for opponent moves when Elo >= 1100 and not an analysis/hint search
      const isAnalysisOrHint = strength === 'max' && maxTimeMs <= 400;
      const bookMoves = getBookByFen().get(makeFenKey(pos, false));
      if (!isAnalysisOrHint && bookMoves && bookMoves.length > 0 && elo >= 1100) {
        const validBook = bookMoves.filter((u) => rootMoves.some((m) => m.uci === u));
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
      let timeUp = false;
      let nodes = 0;

      const killers: [string | null, string | null][] = Array.from({ length: 32 }, () => [null, null]);
      const history = new Int32Array(4096);

      if (this.tt.size > TT_MAX_SIZE) {
        this.tt.clear();
      }

      const ttStore = (key: string, depth: number, score: number, flag: number, bestUci: string | null, ply: number) => {
        if (this.tt.size >= TT_MAX_SIZE) return;
        let storedScore = score;
        if (storedScore > MATE_THRESHOLD) storedScore += ply;
        else if (storedScore < -MATE_THRESHOLD) storedScore -= ply;
        const prev = this.tt.get(key);
        if (!prev || depth >= prev.depth) {
          this.tt.set(key, { depth, score: storedScore, flag, bestUci });
        }
      };

      const quiescence = (nodePos: Chess, alpha: number, beta: number, qDepth: number): number => {
        nodes++;
        if ((nodes & 511) === 0 && (this.stopped || Date.now() >= deadline)) {
          timeUp = true;
          return 0;
        }

        const inCheck = nodePos.isCheck();
        let standPat = -MATE_SCORE;
        if (!inCheck) {
          standPat = evaluatePosition(nodePos);
          if (standPat >= beta) return beta;
          if (standPat > alpha) alpha = standPat;
          if (qDepth <= 0) return alpha;
        }

        const moves = generateOrderedMoves(nodePos, !inCheck, null, null, null);
        if (inCheck && moves.length === 0) {
          return -MATE_SCORE;
        }

        for (const item of moves) {
          // Delta pruning for hopeless captures when not in check
          if (!inCheck && !item.isPromo && standPat + item.victimVal + 200 < alpha) {
            continue;
          }
          const child = nodePos.clone();
          child.play(item.move);
          const score = -quiescence(child, -beta, -alpha, qDepth - 1);
          if (timeUp) return 0;
          if (score >= beta) return beta;
          if (score > alpha) alpha = score;
        }
        return alpha;
      };

      const alphaBeta = (
        nodePos: Chess,
        depth: number,
        alpha: number,
        beta: number,
        ply: number,
        allowNull: boolean,
      ): number => {
        nodes++;
        if ((nodes & 511) === 0 && (this.stopped || Date.now() >= deadline)) {
          timeUp = true;
          return 0;
        }

        if (nodePos.isInsufficientMaterial() || nodePos.halfmoves >= 100) {
          return 0;
        }

        const origAlpha = alpha;
        const key = makeFenKey(nodePos, true);
        const ttEntry = this.tt.get(key);
        let ttMoveUci: string | null = null;

        if (ttEntry) {
          ttMoveUci = ttEntry.bestUci;
          if (ttEntry.depth >= depth) {
            let s = ttEntry.score;
            if (s > MATE_THRESHOLD) s -= ply;
            else if (s < -MATE_THRESHOLD) s += ply;
            if (ttEntry.flag === TT_EXACT) return s;
            if (ttEntry.flag === TT_LOWER && s > alpha) alpha = s;
            else if (ttEntry.flag === TT_UPPER && s < beta) beta = s;
            if (alpha >= beta) return s;
          }
        }

        const inCheck = nodePos.isCheck();
        const ext = inCheck && ply < 10 ? 1 : 0;
        const effectiveDepth = depth + ext;

        if (effectiveDepth <= 0) {
          return quiescence(nodePos, alpha, beta, 6);
        }

        // Null-Move Pruning (skip in endgame/check/narrow)
        if (
          allowNull &&
          !inCheck &&
          effectiveDepth >= 3 &&
          beta < MATE_THRESHOLD &&
          hasNonPawnMaterial(nodePos, nodePos.turn)
        ) {
          const nullPos = nodePos.clone();
          nullPos.turn = nodePos.turn === 'white' ? 'black' : 'white';
          nullPos.epSquare = undefined;
          const R = effectiveDepth >= 6 ? 3 : 2;
          const nullScore = -alphaBeta(nullPos, effectiveDepth - 1 - R, -beta, -beta + 1, ply + 1, false);
          if (timeUp) return 0;
          if (nullScore >= beta) return beta;
        }

        const plyKillers = ply < 32 ? killers[ply] : null;
        const moves = generateOrderedMoves(nodePos, false, ttMoveUci, plyKillers, history);
        if (moves.length === 0) {
          return inCheck ? -(MATE_SCORE - ply) : 0;
        }

        let best = -Infinity;
        let bestMoveUci: string | null = moves[0].uci;

        for (let i = 0; i < moves.length; i++) {
          const item = moves[i];
          const child = nodePos.clone();
          child.play(item.move);

          let score: number;
          // Late Move Reductions (LMR) for quiet late moves
          if (i >= 3 && effectiveDepth >= 3 && !inCheck && !item.isCapture && !item.isPromo && !child.isCheck()) {
            const reduction = i >= 8 && effectiveDepth >= 5 ? 2 : 1;
            score = -alphaBeta(child, effectiveDepth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true);
            if (!timeUp && score > alpha) {
              score = -alphaBeta(child, effectiveDepth - 1, -beta, -alpha, ply + 1, true);
            }
          } else {
            score = -alphaBeta(child, effectiveDepth - 1, -beta, -alpha, ply + 1, true);
          }

          if (timeUp) return 0;

          if (score > best) {
            best = score;
            bestMoveUci = item.uci;
          }
          if (score > alpha) {
            alpha = score;
          }
          if (alpha >= beta) {
            if (!item.isCapture && !item.isPromo) {
              if (ply < 32 && killers[ply][0] !== item.uci) {
                killers[ply][1] = killers[ply][0];
                killers[ply][0] = item.uci;
              }
              const hIdx = (item.move.from << 6) | item.move.to;
              history[hIdx] = Math.min(50000, history[hIdx] + effectiveDepth * effectiveDepth);
            }
            break;
          }
        }

        const flag = best <= origAlpha ? TT_UPPER : best >= beta ? TT_LOWER : TT_EXACT;
        ttStore(key, effectiveDepth, best, flag, bestMoveUci, ply);
        return best;
      };

      let bestUci = rootMoves[0].uci;
      let bestScore = evaluatePosition(pos);
      const rootScored: { uci: string; score: number }[] = [];

      // Iterative deepening with periodic UI yield at the root
      for (let d = 1; d <= maxDepth; d++) {
        if (this.stopped || (d > 1 && Date.now() >= deadline)) break;
        timeUp = false;

        const ordered = generateOrderedMoves(pos, false, bestUci, null, history);
        let alpha = -Infinity;
        const beta = Infinity;
        let iterBestUci = bestUci;
        let iterBestScore = -Infinity;
        const currentScores: { uci: string; score: number }[] = [];
        let lastYield = Date.now();

        for (let i = 0; i < ordered.length; i++) {
          const item = ordered[i];
          const child = pos.clone();
          child.play(item.move);
          const score = -alphaBeta(child, d - 1, -beta, -alpha, 1, true);
          if (this.stopped || (d > 1 && timeUp)) {
            timeUp = true;
            break;
          }
          currentScores.push({ uci: item.uci, score });
          if (score > iterBestScore) {
            iterBestScore = score;
            iterBestUci = item.uci;
          }
          if (score > alpha) alpha = score;

          // Keep UI responsive without slowing down the inner search
          if (Date.now() - lastYield >= 32) {
            await new Promise((r) => setTimeout(r, 0));
            lastYield = Date.now();
          }
        }

        if (!this.stopped && !timeUp && iterBestScore > -Infinity) {
          bestUci = iterBestUci;
          bestScore = iterBestScore;
          rootScored.splice(0, rootScored.length, ...currentScores);
          // Stop early if forced mate found
          if (Math.abs(bestScore) >= MATE_THRESHOLD) break;
        } else if (d === 1 && iterBestScore > -Infinity) {
          bestUci = iterBestUci;
          bestScore = iterBestScore;
          rootScored.splice(0, rootScored.length, ...currentScores);
        }

        await new Promise((r) => setTimeout(r, 0));
      }

      // Calibrated human-like move selection for Elo < 2000 (with blunder guard at 1400+)
      if (strength !== 'max' && elo < 2000 && rootScored.length > 1) {
        let noiseRange: number;
        let maxAllowedDrop: number;

        if (elo >= 1500) {
          // 1500-1999: tactically sharp, small positional inaccuracies only, never hangs pieces
          noiseRange = (2000 - elo) * 0.08; // 1600 -> 32 cp
          maxAllowedDrop = 40 + (2000 - elo) * 0.12; // 1600 -> 88 cp
        } else if (elo >= 1200) {
          // 1200-1499: club player, occasional tactical slips
          noiseRange = (1900 - elo) * 0.14;
          maxAllowedDrop = 120 + (1500 - elo) * 0.25;
        } else {
          // 800-1199: beginner
          noiseRange = (1700 - elo) * 0.25;
          maxAllowedDrop = 500;
        }

        const candidates = rootScored.filter((item) => bestScore - item.score <= maxAllowedDrop);
        const pool = candidates.length > 0 ? candidates : rootScored.slice(0, 1);

        const noisy = pool.map((item) => ({
          uci: item.uci,
          realScore: item.score,
          noisyScore: item.score + (Math.random() - 0.5) * noiseRange,
        }));
        noisy.sort((a, b) => b.noisyScore - a.noisyScore);
        bestUci = noisy[0].uci;
        bestScore = noisy[0].realScore;
      }

      // Prefer opening book move if nearly equal to engine best
      if (bookMoves && bookMoves.length > 0 && rootScored.length > 0) {
        const topBook = rootScored.find((r) => bookMoves.includes(r.uci) && bestScore - r.score < 35);
        if (topBook) {
          bestUci = topBook.uci;
          bestScore = topBook.score;
        }
      }

      let cp: number | null = bestScore;
      let mate: number | null = null;
      if (Math.abs(bestScore) >= MATE_THRESHOLD) {
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

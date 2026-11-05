// Board/move helpers on top of chessops.
import { Chess, parseSquare, makeSquare, type NormalMove, type Role } from 'chessops';
import { normalizeMove } from 'chessops/chess';
import { chessgroundDests, scalachessCharPair } from 'chessops/compat';
import { INITIAL_BOARD_FEN, INITIAL_FEN, makeFen, parseFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';

export type Square = string; // 'e4'
export type Dests = Map<Square, Square[]>;

// Chapter roots store a board-only FEN; parseFen would then default to
// "no castling rights", so expand it to the full start position.
export function positionFromFen(fen: string): Chess | null {
  if (fen.trim() === INITIAL_BOARD_FEN) fen = INITIAL_FEN;
  const setup = parseFen(fen);
  if (setup.isErr) return null;
  const pos = Chess.fromSetup(setup.value);
  return pos.isOk ? pos.value : null;
}

// Legal destinations; for castling both king->two squares and king->rook.
export const legalDests = (pos: Chess): Dests => chessgroundDests(pos) as Dests;

// [from, to] squares of a SAN move in pos (castling as king->two squares,
// which is what a user taps).
export function sanToSquares(pos: Chess, san: string): [Square, Square] | null {
  const move = parseSan(pos, san);
  if (!move || !('from' in move)) return null;
  const from = makeSquare(move.from);
  let to = makeSquare(move.to);
  const piece = pos.board.get(move.from);
  const target = pos.board.get(move.to);
  if (piece?.role === 'king' && target?.role === 'rook' && target.color === piece.color) {
    // chessops encodes castling as king->rook; show king->g/c file
    to = (move.to > move.from ? 'g' : 'c') + from[1];
  }
  return [from, to];
}

export function isPromotion(pos: Chess, from: Square, to: Square): boolean {
  const piece = pos.board.get(parseSquare(from)!);
  return piece?.role === 'pawn' && (to[1] === '8' || to[1] === '1');
}

// A tap-move as SAN + tree id (handles both castling encodings), or null
// if illegal. Compare moves by id: SAN text in imported PGNs can differ
// cosmetically (check marks, disambiguation) from what makeSan produces.
export function squaresToMove(
  pos: Chess,
  from: Square,
  to: Square,
  promotion?: Role,
): { san: string; id: string } | null {
  const f = parseSquare(from);
  const t = parseSquare(to);
  if (f === undefined || t === undefined) return null;
  const move = normalizeMove(pos, { from: f, to: t, promotion } as NormalMove);
  if (!pos.isLegal(move)) return null;
  return { san: makeSan(pos, move), id: scalachessCharPair(move) };
}

// Position after playing san; null if illegal.
export function playSan(pos: Chess, san: string): { pos: Chess; fen: string; capture: boolean } | null {
  const move = parseSan(pos, san);
  if (!move) return null;
  const capture = 'from' in move && !!pos.board.get(move.to);
  const next = pos.clone();
  next.play(move);
  return { pos: next, fen: makeFen(next.toSetup()), capture };
}

export const colorFromPly = (ply: number) => (ply % 2 === 1 ? 'white' : 'black');

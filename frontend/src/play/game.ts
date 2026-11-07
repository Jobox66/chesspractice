import { Chess, normalizeMove } from 'chessops/chess';
import { INITIAL_FEN, makeFen, parseFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { makeUci, parseUci } from 'chessops/util';
import { JUDGMENT_SYMBOL, reviewMoves, type Analysis } from './analysis';

export type Color = 'white' | 'black';

export interface GameResult {
  winner: Color | null;
  reason: 'checkmate' | 'stalemate' | 'insufficient' | 'repetition' | 'fifty' | 'resign';
}

export interface Game {
  id: string;
  playerColor: Color;
  elo: number;
  // UCI moves from the initial position.
  moves: string[];
  result: GameResult | null;
  hintsUsed: number;
  takebacks: number;
  startedAt: string;
  endedAt: string | null;
  // Engine review, once run (finished games only).
  analysis?: Analysis | null;
}

export interface Replayed {
  fens: string[]; // fens[0] = start, fens[i] = after move i
  sans: string[];
}

function position(fen: string) {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
}

export function replay(moves: string[]): Replayed {
  const pos = position(INITIAL_FEN);
  const fens = [INITIAL_FEN];
  const sans: string[] = [];
  for (const uci of moves) {
    const move = normalizeMove(pos, parseUci(uci)!);
    sans.push(makeSan(pos, move));
    pos.play(move);
    fens.push(makeFen(pos.toSetup()));
  }
  return { fens, sans };
}

// The legal, normalised form of a move in this position, or null.
export function legalUci(fen: string, uci: string): string | null {
  const pos = position(fen);
  const parsed = parseUci(uci);
  if (!parsed) return null;
  const move = normalizeMove(pos, parsed);
  return pos.isLegal(move) ? makeUci(move) : null;
}

export function fenAfter(fen: string, uci: string): string {
  const pos = position(fen);
  pos.play(normalizeMove(pos, parseUci(uci)!));
  return makeFen(pos.toSetup());
}

export function sanOf(fen: string, uci: string): string {
  const pos = position(fen);
  return makeSan(pos, normalizeMove(pos, parseUci(uci)!));
}

export function turnOf(fen: string): Color {
  return fen.split(' ')[1] === 'w' ? 'white' : 'black';
}

export function isCheck(fen: string): boolean {
  return position(fen).isCheck();
}

// Repetition compares placement, side to move, castling and en passant.
const repetitionKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

// Result of the position after the last move, or null if play goes on.
export function gameStatus(fens: string[]): GameResult | null {
  const fen = fens[fens.length - 1];
  const pos = position(fen);
  if (pos.isCheckmate()) return { winner: turnOf(fen) === 'white' ? 'black' : 'white', reason: 'checkmate' };
  if (pos.isStalemate()) return { winner: null, reason: 'stalemate' };
  if (pos.isInsufficientMaterial()) return { winner: null, reason: 'insufficient' };
  const key = repetitionKey(fen);
  if (fens.filter((f) => repetitionKey(f) === key).length >= 3) return { winner: null, reason: 'repetition' };
  if (pos.halfmoves >= 100) return { winner: null, reason: 'fifty' };
  return null;
}

export function resultText(r: GameResult, player: Color): string {
  const how: Record<GameResult['reason'], string> = {
    checkmate: 'by checkmate',
    resign: 'by resignation',
    stalemate: 'by stalemate',
    insufficient: 'by insufficient material',
    repetition: 'by threefold repetition',
    fifty: 'by the 50-move rule',
  };
  if (!r.winner) return `Draw ${how[r.reason]}`;
  return `${r.winner === player ? 'You won' : 'Stockfish won'} ${how[r.reason]}`;
}

export function pgnResult(r: GameResult | null): string {
  if (!r) return '*';
  if (!r.winner) return '1/2-1/2';
  return r.winner === 'white' ? '1-0' : '0-1';
}

export function toPgn(game: Game): string {
  const { sans, fens } = replay(game.moves);
  const reviews = game.analysis ? reviewMoves(game.moves, fens, game.analysis) : [];
  const engine = `Stockfish (${game.elo})`;
  const date = game.startedAt.slice(0, 10).replace(/-/g, '.');
  const result = pgnResult(game.result);
  const headers = [
    ['Event', 'Practice game'],
    ['Site', 'chesspractice'],
    ['Date', date],
    ['White', game.playerColor === 'white' ? 'Me' : engine],
    ['Black', game.playerColor === 'black' ? 'Me' : engine],
    ['Result', result],
  ];
  const body: string[] = [];
  sans.forEach((san, i) => {
    // Annotated: "14... Qxb2?? { Best: Nd7 }"
    const r = reviews[i];
    const mark = r?.judgment ? JUDGMENT_SYMBOL[r.judgment] : '';
    // a Black move after a comment needs its number again ("14...")
    const prev = reviews[i - 1];
    const afterComment = !!(prev?.judgment && prev.bestSan);
    const prefix = i % 2 === 0 ? `${i / 2 + 1}. ` : afterComment ? `${(i + 1) / 2}... ` : '';
    body.push(prefix + san + mark);
    if (r?.judgment && r.bestSan) body.push(`{ Best: ${r.bestSan} }`);
  });
  body.push(result);
  return headers.map(([k, v]) => `[${k} "${v}"]`).join('\n') + '\n\n' + body.join(' ') + '\n';
}

// Engine score → "+0.4" / "−1.2" / "#3" from `pov`'s side. `line` is from
// the side to move in `fen`.
export function scoreText(cp: number | null, mate: number | null, fen: string, pov: Color): string {
  const sign = turnOf(fen) === pov ? 1 : -1;
  if (mate != null) {
    const m = mate * sign;
    return m > 0 ? `#${m}` : `#−${Math.abs(m)}`;
  }
  if (cp == null) return '';
  const v = (cp * sign) / 100;
  return v > 0 ? `+${v.toFixed(1)}` : v < 0 ? `−${Math.abs(v).toFixed(1)}` : '0.0';
}

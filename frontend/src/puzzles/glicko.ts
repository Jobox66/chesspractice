// Glicko-1 update for one game (the solver vs one puzzle). Lichess rates
// puzzles with Glicko-2; Glicko-1 is close enough for a personal ladder and
// needs no volatility state.

export interface Rating {
  rating: number;
  rd: number;
  games: number;
}

export const INITIAL_RATING: Rating = { rating: 1500, rd: 350, games: 0 };

// RD never drops below this, so the rating keeps moving as you improve.
const MIN_RD = 60;
// Puzzle ratings in the database are well established (we filter RD ≤ 90).
const PUZZLE_RD = 75;
const Q = Math.LN10 / 400;

const g = (rd: number) => 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / (Math.PI * Math.PI));

export function updateRating(player: Rating, puzzleRating: number, success: boolean): Rating {
  const gj = g(PUZZLE_RD);
  const expected = 1 / (1 + Math.pow(10, (-gj * (player.rating - puzzleRating)) / 400));
  const d2 = 1 / (Q * Q * gj * gj * expected * (1 - expected));
  const denom = 1 / (player.rd * player.rd) + 1 / d2;
  const rating = player.rating + (Q / denom) * gj * ((success ? 1 : 0) - expected);
  const rd = Math.max(MIN_RD, Math.sqrt(1 / denom));
  return { rating: Math.round(rating * 10) / 10, rd: Math.round(rd * 10) / 10, games: player.games + 1 };
}

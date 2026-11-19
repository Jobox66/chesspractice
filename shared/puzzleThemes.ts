// Display names for the Lichess puzzle themes (as Lichess names them),
// grouped for the topic picker, in the order it shows them. Themes not listed here (advantage, crushing,
// master, …) describe the result or the source game rather than a skill,
// so they aren't offered as filters and don't count towards "weak themes".

export const THEME_GROUPS: { label: string; themes: [string, string][] }[] = [
  {
    label: 'Checkmates',
    themes: [
      ['mate', 'Checkmate (any)'],
      ['mateIn1', 'Mate in 1'],
      ['mateIn2', 'Mate in 2'],
      ['mateIn3', 'Mate in 3'],
      ['mateIn4', 'Mate in 4'],
      ['mateIn5', 'Mate in 5 or more'],
      ['backRankMate', 'Back rank mate'],
      ['smotheredMate', 'Smothered mate'],
      ['anastasiaMate', 'Anastasia mate'],
      ['arabianMate', 'Arabian mate'],
      ['bodenMate', 'Boden mate'],
      ['doubleBishopMate', 'Double bishop mate'],
      ['dovetailMate', 'Dovetail mate'],
      ['hookMate', 'Hook mate'],
      ['killBoxMate', 'Kill box mate'],
      ['vukovicMate', 'Vukovic mate'],
      ['cornerMate', 'Corner mate'],
      ['triangleMate', 'Triangle mate'],
      ['balestraMate', 'Balestra mate'],
      ['blindSwineMate', 'Blind swine mate'],
    ],
  },
  {
    label: 'Length',
    themes: [
      ['oneMove', '1 move'],
      ['short', '2 moves'],
      ['long', '3 moves'],
      ['veryLong', '4+ moves'],
    ],
  },
  {
    label: 'Tactics',
    themes: [
      ['fork', 'Fork'],
      ['pin', 'Pin'],
      ['skewer', 'Skewer'],
      ['discoveredAttack', 'Discovered attack'],
      ['doubleCheck', 'Double check'],
      ['deflection', 'Deflection'],
      ['attraction', 'Attraction'],
      ['clearance', 'Clearance'],
      ['interference', 'Interference'],
      ['intermezzo', 'Intermezzo'],
      ['xRayAttack', 'X-ray attack'],
      ['sacrifice', 'Sacrifice'],
      ['capturingDefender', 'Capture the defender'],
      ['hangingPiece', 'Hanging piece'],
      ['trappedPiece', 'Trapped piece'],
      ['quietMove', 'Quiet move'],
      ['defensiveMove', 'Defensive move'],
      ['zugzwang', 'Zugzwang'],
      ['exposedKing', 'Exposed king'],
      ['kingsideAttack', 'Kingside attack'],
      ['queensideAttack', 'Queenside attack'],
      ['attackingF2F7', 'Attacking f2 or f7'],
      ['advancedPawn', 'Advanced pawn'],
      ['promotion', 'Promotion'],
      ['underPromotion', 'Underpromotion'],
      ['enPassant', 'En passant'],
      ['castling', 'Castling'],
    ],
  },
  {
    label: 'Phase',
    themes: [
      ['opening', 'Opening'],
      ['middlegame', 'Middlegame'],
      ['endgame', 'Endgame'],
      ['pawnEndgame', 'Pawn endgame'],
      ['rookEndgame', 'Rook endgame'],
      ['bishopEndgame', 'Bishop endgame'],
      ['knightEndgame', 'Knight endgame'],
      ['queenEndgame', 'Queen endgame'],
      ['queenRookEndgame', 'Queen and rook endgame'],
    ],
  },
];

export const THEME_LABELS: Record<string, string> = Object.fromEntries(
  THEME_GROUPS.flatMap((g) => g.themes),
);

// Skills worth drilling: tactics and mates, not phase or length.
export const SKILL_THEMES = new Set(
  THEME_GROUPS.filter((g) => g.label === 'Tactics' || g.label === 'Checkmates').flatMap((g) => g.themes.map(([k]) => k)),
);

export function themeLabel(theme: string): string {
  return THEME_LABELS[theme] ?? theme;
}

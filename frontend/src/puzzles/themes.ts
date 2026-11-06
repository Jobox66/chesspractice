// Vietnamese names for the Lichess puzzle themes, grouped for the picker.
// Themes not listed here (advantage, crushing, master, …) describe the
// result or the source game rather than a skill, so they aren't offered as
// filters and don't count towards "weak themes".

export const THEME_GROUPS: { label: string; themes: [string, string][] }[] = [
  {
    label: 'Chiến thuật',
    themes: [
      ['fork', 'Chĩa đôi'],
      ['pin', 'Ghim'],
      ['skewer', 'Xiên'],
      ['discoveredAttack', 'Tấn công mở'],
      ['doubleCheck', 'Chiếu đôi'],
      ['deflection', 'Đánh lạc hướng'],
      ['attraction', 'Dụ quân'],
      ['clearance', 'Giải phóng ô/đường'],
      ['interference', 'Cản đường'],
      ['intermezzo', 'Nước chen giữa'],
      ['xRayAttack', 'Tấn công X-quang'],
      ['sacrifice', 'Thí quân'],
      ['capturingDefender', 'Diệt quân phòng thủ'],
      ['hangingPiece', 'Quân bỏ ngỏ'],
      ['trappedPiece', 'Quân bị bẫy'],
      ['quietMove', 'Nước êm'],
      ['defensiveMove', 'Nước phòng thủ'],
      ['zugzwang', 'Zugzwang (ép nước)'],
      ['exposedKing', 'Vua hở'],
      ['kingsideAttack', 'Tấn công cánh Vua'],
      ['queensideAttack', 'Tấn công cánh Hậu'],
      ['attackingF2F7', 'Tấn công f2/f7'],
      ['advancedPawn', 'Tốt tiến xa'],
      ['promotion', 'Phong cấp'],
      ['underPromotion', 'Phong cấp dưới'],
      ['enPassant', 'Bắt Tốt qua đường'],
      ['castling', 'Nhập thành'],
    ],
  },
  {
    label: 'Chiếu hết',
    themes: [
      ['mate', 'Chiếu hết (mọi loại)'],
      ['mateIn1', 'Chiếu hết 1 nước'],
      ['mateIn2', 'Chiếu hết 2 nước'],
      ['mateIn3', 'Chiếu hết 3 nước'],
      ['mateIn4', 'Chiếu hết 4 nước'],
      ['mateIn5', 'Chiếu hết 5+ nước'],
      ['backRankMate', 'Chiếu hết hàng cuối'],
      ['smotheredMate', 'Chiếu hết ngạt'],
      ['anastasiaMate', 'Chiếu hết Anastasia'],
      ['arabianMate', 'Chiếu hết Ả Rập'],
      ['bodenMate', 'Chiếu hết Boden'],
      ['doubleBishopMate', 'Chiếu hết hai Tượng'],
      ['dovetailMate', 'Chiếu hết đuôi én'],
      ['hookMate', 'Chiếu hết móc câu'],
      ['killBoxMate', 'Chiếu hết hộp'],
      ['vukovicMate', 'Chiếu hết Vuković'],
      ['cornerMate', 'Chiếu hết góc'],
      ['triangleMate', 'Chiếu hết tam giác'],
      ['balestraMate', 'Chiếu hết Balestra'],
      ['blindSwineMate', 'Chiếu hết hai Xe hàng 7'],
    ],
  },
  {
    label: 'Giai đoạn',
    themes: [
      ['opening', 'Khai cuộc'],
      ['middlegame', 'Trung cuộc'],
      ['endgame', 'Tàn cuộc'],
      ['pawnEndgame', 'Tàn cuộc Tốt'],
      ['rookEndgame', 'Tàn cuộc Xe'],
      ['bishopEndgame', 'Tàn cuộc Tượng'],
      ['knightEndgame', 'Tàn cuộc Mã'],
      ['queenEndgame', 'Tàn cuộc Hậu'],
      ['queenRookEndgame', 'Tàn cuộc Hậu + Xe'],
    ],
  },
  {
    label: 'Độ dài',
    themes: [
      ['oneMove', 'Một nước'],
      ['short', 'Ngắn (2 nước)'],
      ['long', 'Dài (3 nước)'],
      ['veryLong', 'Rất dài (4+ nước)'],
    ],
  },
];

export const THEME_LABELS: Record<string, string> = Object.fromEntries(
  THEME_GROUPS.flatMap((g) => g.themes),
);

// Skills worth drilling: tactics and mates, not phase or length.
export const SKILL_THEMES = new Set(THEME_GROUPS.slice(0, 2).flatMap((g) => g.themes.map(([k]) => k)));

export function themeLabel(theme: string): string {
  return THEME_LABELS[theme] ?? theme;
}

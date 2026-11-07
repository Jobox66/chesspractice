// Opening database and detector for live Play and post-game Review.
// Recognizes ECO codes, opening names and variations, and links them directly
// to the curriculum chapters in openingLibrary.ts (e.g. Pirc Defence, Catalan, etc.).

import { OPENING_LIBRARY } from '../data/openingLibrary';

export interface OpeningEntry {
  eco: string;
  name: string;
  variation?: string;
  moves: string[]; // SAN moves e.g. ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'f4']
  chapterId?: string; // Links to openingLibrary entry id
  chapterName?: string;
  tip?: string;
}

export interface OpeningMatch {
  eco: string;
  name: string;
  variation?: string;
  fullName: string;
  plyCount: number;
  chapter?: {
    id: string;
    name: string;
    trainAs: 'white' | 'black';
    tip?: string;
  };
  isInBook: boolean;
  bookMoves?: string[]; // next book moves from this position
}

// Built-in ECO opening database (comprehensive, matching standard FIDE/Chess.com/Lichess naming).
// Specifically rich in Pirc, Catalan, Caro-Kann, Italian, Slav, Sicilian, French, London.
const OPENING_DATABASE: OpeningEntry[] = [
  // --- PIRC DEFENCE (User priority #1) ---
  {
    eco: 'B07',
    name: 'Pirc Defence',
    moves: ['e4', 'd6'],
    chapterId: 'b-pirc',
    chapterName: 'Black: Pirc Defence',
    tip: 'Để Trắng chiếm trung tâm, sau đó phản công bằng ...c5 hoặc ...e5.',
  },
  {
    eco: 'B07',
    name: 'Pirc Defence',
    variation: 'General Line',
    moves: ['e4', 'd6', 'd4', 'Nf6'],
    chapterId: 'b-pirc',
    chapterName: 'Black: Pirc Defence',
  },
  {
    eco: 'B07',
    name: 'Pirc Defence',
    variation: 'Main System',
    moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6'],
    chapterId: 'b-pirc',
    chapterName: 'Black: Pirc Defence',
    tip: 'Cấu trúc Fianchetto cánh vua đặc trưng của Pirc.',
  },
  {
    eco: 'B09',
    name: 'Pirc Defence',
    variation: 'Austrian Attack',
    moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'f4'],
    chapterId: 'b-pirc',
    chapterName: 'Black: Pirc Defence',
    tip: 'Tấn công Áo: Trắng đẩy e4, d4, f4. Đen cần chơi phản công trung tâm bằng ...Bg7 và ...c5!',
  },
  {
    eco: 'B09',
    name: 'Pirc Defence',
    variation: 'Austrian Attack, Dragon Formation',
    moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'f4', 'Bg7', 'Nf3', 'c5'],
    chapterId: 'b-pirc',
    chapterName: 'Black: Pirc Defence',
    tip: '5...c5 phá trung tâm ngay trước khi Trắng kịp củng cố e5.',
  },
  {
    eco: 'B09',
    name: 'Pirc Defence',
    variation: 'Austrian Attack, 6.dxc5',
    moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'f4', 'Bg7', 'Nf3', 'c5', 'dxc5', 'Qa5'],
    chapterId: 'b-pirc',
    chapterName: 'Black: Pirc Defence',
    tip: '6...Qa5 ghim Mã c3 và chuẩn bị lấy lại Tốt c5.',
  },
  {
    eco: 'B07',
    name: 'Pirc Defence',
    variation: '150 Attack',
    moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'Be3'],
    chapterId: 'b-pirc',
    chapterName: 'Black: Pirc Defence',
    tip: 'Hệ thống 150: Be3, Qd2, f3, O-O-O rồi h4-h5. Đen phản công cánh hậu bằng ...c6, ...b5.',
  },
  {
    eco: 'B07',
    name: 'Pirc Defence',
    variation: '150 Attack, Argentine Variation',
    moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'Be3', 'c6', 'Qd2', 'b5'],
    chapterId: 'b-pirc',
    chapterName: 'Black: Pirc Defence',
    tip: 'Đen dâng Tốt cánh hậu ...b5 giành không gian trước khi Trắng kịp đẩy h4.',
  },
  {
    eco: 'B08',
    name: 'Pirc Defence',
    variation: 'Classical (Two Knights) System',
    moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'Nf3'],
    chapterId: 'b-pirc',
    chapterName: 'Black: Pirc Defence',
    tip: 'Hệ thống Cổ điển: Trắng phát triển tự nhiên, Đen chơi ...Bg7, ...O-O, ...Bg4.',
  },
  {
    eco: 'B08',
    name: 'Pirc Defence',
    variation: 'Classical Variation',
    moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'Nf3', 'Bg7', 'Be2', 'O-O', 'O-O', 'Bg4'],
    chapterId: 'b-pirc',
    chapterName: 'Black: Pirc Defence',
    tip: 'Đen ghim và đổi Mã f3 để kiểm soát ô e5 và d4.',
  },
  {
    eco: 'B07',
    name: 'Pirc Defence',
    variation: 'Byrne Variation',
    moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'Bg5'],
    chapterId: 'b-pirc',
    chapterName: 'Black: Pirc Defence',
  },
  {
    eco: 'B07',
    name: 'Pirc Defence',
    variation: 'Kholmov System',
    moves: ['e4', 'd6', 'd4', 'Nf6', 'Bc4'],
    chapterId: 'b-pirc',
    chapterName: 'Black: Pirc Defence',
  },
  {
    eco: 'B06',
    name: 'Modern Defence',
    moves: ['e4', 'g6'],
    chapterId: 'w-other-defences',
    chapterName: 'White: Scandi, Pirc, Alekhine',
  },
  {
    eco: 'B06',
    name: 'Modern Defence',
    variation: 'Standard Line',
    moves: ['e4', 'g6', 'd4', 'Bg7', 'Nc3', 'd6'],
    chapterId: 'w-other-defences',
    chapterName: 'White: Scandi, Pirc, Alekhine',
  },

  // --- CATALAN OPENING (User priority #2) ---
  {
    eco: 'E00',
    name: 'Catalan Opening',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'g3'],
    chapterId: 'w-catalan',
    chapterName: 'White: Catalan (1.d4)',
    tip: 'd4 + c4 + g3: Tượng g2 kiểm soát đường chéo lớn a8-h1, gây áp lực lên cánh hậu Đen.',
  },
  {
    eco: 'E01',
    name: 'Catalan Opening',
    variation: 'Closed System',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'g3', 'd5', 'Bg2'],
    chapterId: 'w-catalan',
    chapterName: 'White: Catalan (1.d4)',
  },
  {
    eco: 'E06',
    name: 'Catalan Opening',
    variation: 'Closed Variation',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'g3', 'd5', 'Bg2', 'Be7', 'Nf3', 'O-O', 'O-O'],
    chapterId: 'w-catalan',
    chapterName: 'White: Catalan (1.d4)',
    tip: 'Catalan Đóng: Trắng chuẩn bị Qc2, Nbd2, đẩy e4 chiếm lĩnh trung tâm.',
  },
  {
    eco: 'E06',
    name: 'Catalan Opening',
    variation: 'Closed, 6...Nbd7',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'g3', 'd5', 'Bg2', 'Be7', 'Nf3', 'O-O', 'O-O', 'c6', 'Qc2', 'Nbd7'],
    chapterId: 'w-catalan',
    chapterName: 'White: Catalan (1.d4)',
    tip: 'Kế hoạch Trắng: Nbd2, e4, Bb2 chiếm trung tâm.',
  },
  {
    eco: 'E05',
    name: 'Catalan Opening',
    variation: 'Open, Classical Line',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'g3', 'd5', 'Bg2', 'Be7', 'Nf3', 'O-O', 'O-O', 'dxc4'],
    chapterId: 'w-catalan',
    chapterName: 'White: Catalan (1.d4)',
    tip: 'Catalan Mở: Đen ăn c4 để giải phóng không gian; Trắng dùng Qc2 lấy lại Tốt và mở cột c.',
  },
  {
    eco: 'E05',
    name: 'Catalan Opening',
    variation: 'Open, 7.Qc2 Line',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'g3', 'd5', 'Bg2', 'Be7', 'Nf3', 'O-O', 'O-O', 'dxc4', 'Qc2', 'a6', 'Qxc4', 'b5', 'Qc2', 'Bb7'],
    chapterId: 'w-catalan',
    chapterName: 'White: Catalan (1.d4)',
    tip: 'Trắng chơi Bd2 chuẩn bị Ba5 hoặc Rc1 ép đường chéo lớn và cột c.',
  },
  {
    eco: 'E02',
    name: 'Catalan Opening',
    variation: 'Open, 4...dxc4',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'g3', 'd5', 'Bg2', 'dxc4'],
    chapterId: 'w-catalan',
    chapterName: 'White: Catalan (1.d4)',
    tip: 'Trắng chơi 5.Qa4+ để lấy lại Tốt c4 ngay lập tức.',
  },
  {
    eco: 'E00',
    name: 'Catalan Opening',
    variation: 'Bogo-Catalan',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'g3', 'Bb4+'],
    chapterId: 'w-catalan',
    chapterName: 'White: Catalan (1.d4)',
  },
  {
    eco: 'E00',
    name: 'Catalan Opening',
    variation: 'Benoni Formation',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'g3', 'c5', 'd5', 'exd5', 'cxd5', 'd6', 'Nf3', 'g6', 'Bg2', 'Bg7'],
    chapterId: 'w-catalan',
    chapterName: 'White: Catalan (1.d4)',
    tip: 'Cấu trúc Benoni, Tượng g2 của Trắng cực kỳ mạnh và hỗ trợ đẩy e4-e5 sau này.',
  },

  // --- CARO-KANN DEFENCE ---
  {
    eco: 'B10',
    name: 'Caro-Kann Defence',
    moves: ['e4', 'c6'],
    chapterId: 'b-caro-kann',
    chapterName: 'Black: Caro-Kann',
    tip: 'Chuẩn bị ...d5 chắc chắn mà không khóa Tượng c8.',
  },
  {
    eco: 'B12',
    name: 'Caro-Kann Defence',
    variation: 'Main Line',
    moves: ['e4', 'c6', 'd4', 'd5'],
    chapterId: 'b-caro-kann',
    chapterName: 'Black: Caro-Kann',
  },
  {
    eco: 'B12',
    name: 'Caro-Kann Defence',
    variation: 'Advance Variation',
    moves: ['e4', 'c6', 'd4', 'd5', 'e5'],
    chapterId: 'w-caro-advance',
    chapterName: 'White: Caro-Kann Advance',
    tip: 'Biến Tiến: Trắng chiếm không gian; Đen đưa Tượng ra f5 trước khi khóa chuỗi Tốt.',
  },
  {
    eco: 'B12',
    name: 'Caro-Kann Defence',
    variation: 'Advance, Short System',
    moves: ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3', 'e6', 'Be2'],
    chapterId: 'w-caro-advance',
    chapterName: 'White: Caro-Kann Advance',
    tip: 'Hệ thống Short: đơn giản, nhập thành nhanh, hạn chế biến sắc bén của Đen.',
  },
  {
    eco: 'B18',
    name: 'Caro-Kann Defence',
    variation: 'Classical Variation',
    moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5'],
    chapterId: 'b-caro-kann',
    chapterName: 'Black: Caro-Kann',
    tip: 'Đen đổi Tốt e4 rồi giải phóng Tượng f5, cấu trúc Tốt rất vững.',
  },
  {
    eco: 'B18',
    name: 'Caro-Kann Defence',
    variation: 'Classical, 5.Ng3 Bg6 6.h4',
    moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5', 'Ng3', 'Bg6', 'h4', 'h6'],
    chapterId: 'b-caro-kann',
    chapterName: 'Black: Caro-Kann',
    tip: 'Đen đẩy 6...h6 chừa ô h7 để Tượng không bị h5 bắt kẹt.',
  },
  {
    eco: 'B13',
    name: 'Caro-Kann Defence',
    variation: 'Exchange Variation',
    moves: ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5'],
    chapterId: 'b-caro-kann',
    chapterName: 'Black: Caro-Kann',
  },
  {
    eco: 'B14',
    name: 'Caro-Kann Defence',
    variation: 'Panov-Botvinnik Attack',
    moves: ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'c4'],
    chapterId: 'b-caro-kann',
    chapterName: 'Black: Caro-Kann',
  },
  {
    eco: 'B11',
    name: 'Caro-Kann Defence',
    variation: 'Two Knights Variation',
    moves: ['e4', 'c6', 'Nc3', 'd5', 'Nf3'],
    chapterId: 'b-caro-kann',
    chapterName: 'Black: Caro-Kann',
  },

  // --- ITALIAN & 1...e5 ---
  {
    eco: 'C50',
    name: 'Italian Game',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
    chapterId: 'w-italian',
    chapterName: 'White: Italian & 1...e5',
    tip: 'Tượng c4 nhắm vào f7, điểm yếu nhất của Đen khi chưa nhập thành.',
  },
  {
    eco: 'C53',
    name: 'Italian Game',
    variation: 'Giuoco Piano',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'],
    chapterId: 'w-italian',
    chapterName: 'White: Italian & 1...e5',
  },
  {
    eco: 'C53',
    name: 'Italian Game',
    variation: 'Giuoco Pianissimo',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3'],
    chapterId: 'w-italian',
    chapterName: 'White: Italian & 1...e5',
    tip: 'Xây dựng chậm, chuẩn bị Re1, Nbd2-f1-g3 rồi mới bùng nổ ở d4.',
  },
  {
    eco: 'C55',
    name: 'Two Knights Defence',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'],
    chapterId: 'w-italian',
    chapterName: 'White: Italian & 1...e5',
    tip: 'Trắng chơi 4.d3 an toàn chắc chắn, tránh các biến phức tạp sau 4.Ng5.',
  },
  {
    eco: 'C41',
    name: 'Philidor Defence',
    moves: ['e4', 'e5', 'Nf3', 'd6'],
    chapterId: 'w-italian',
    chapterName: 'White: Italian & 1...e5',
    tip: 'Đen khá thụ động; Trắng chiếm trung tâm ngay bằng 3.d4.',
  },
  {
    eco: 'C42',
    name: "Petrov's Defence",
    moves: ['e4', 'e5', 'Nf3', 'Nf6'],
    chapterId: 'w-italian',
    chapterName: 'White: Italian & 1...e5',
    tip: 'Phòng thủ Nga (Petrov). Trắng ăn 3.Nxe5 d6 4.Nf3 Nxe4 5.Nc3!',
  },

  // --- SICILIAN DEFENCE & ALAPIN ---
  {
    eco: 'B20',
    name: 'Sicilian Defence',
    moves: ['e4', 'c5'],
    chapterId: 'w-alapin',
    chapterName: 'White: Alapin vs Sicilian',
  },
  {
    eco: 'B22',
    name: 'Sicilian Defence',
    variation: 'Alapin Variation',
    moves: ['e4', 'c5', 'c3'],
    chapterId: 'w-alapin',
    chapterName: 'White: Alapin vs Sicilian',
    tip: '2.c3 chuẩn bị d4 xây dựng trung tâm hai Tốt, né đòn lý thuyết phức tạp của Sicilian mở.',
  },
  {
    eco: 'B22',
    name: 'Sicilian Defence',
    variation: 'Alapin, 2...d5',
    moves: ['e4', 'c5', 'c3', 'd5', 'exd5', 'Qxd5', 'd4', 'Nf6', 'Nf3'],
    chapterId: 'w-alapin',
    chapterName: 'White: Alapin vs Sicilian',
    tip: 'Trắng có Tốt d4 cô lập nhưng phát triển nhanh và chiếm không gian tốt.',
  },
  {
    eco: 'B22',
    name: 'Sicilian Defence',
    variation: 'Alapin, 2...Nf6',
    moves: ['e4', 'c5', 'c3', 'Nf6', 'e5', 'Nd5', 'd4'],
    chapterId: 'w-alapin',
    chapterName: 'White: Alapin vs Sicilian',
  },
  {
    eco: 'B90',
    name: 'Sicilian Defence',
    variation: 'Najdorf Variation',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'],
  },
  {
    eco: 'B70',
    name: 'Sicilian Defence',
    variation: 'Dragon Variation',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'],
  },
  {
    eco: 'B23',
    name: 'Sicilian Defence',
    variation: 'Closed',
    moves: ['e4', 'c5', 'Nc3'],
  },

  // --- FRENCH DEFENCE ---
  {
    eco: 'C00',
    name: 'French Defence',
    moves: ['e4', 'e6'],
    chapterId: 'w-french-advance',
    chapterName: 'White: French Advance',
  },
  {
    eco: 'C02',
    name: 'French Defence',
    variation: 'Advance Variation',
    moves: ['e4', 'e6', 'd4', 'd5', 'e5'],
    chapterId: 'w-french-advance',
    chapterName: 'White: French Advance',
    tip: 'Biến Tiến: khóa Tượng c8 của Đen; Trắng củng cố chuỗi Tốt bằng c3.',
  },
  {
    eco: 'C02',
    name: 'French Defence',
    variation: 'Advance, Paulsen Attack',
    moves: ['e4', 'e6', 'd4', 'd5', 'e5', 'c5', 'c3', 'Nc6', 'Nf3', 'Qb6', 'a3'],
    chapterId: 'w-french-advance',
    chapterName: 'White: French Advance',
    tip: 'Trắng chuẩn bị b4 chiếm không gian cánh hậu, sau đó tấn công cánh vua.',
  },

  // --- SLAV & 1.d4 DEFENCES ---
  {
    eco: 'D10',
    name: 'Slav Defence',
    moves: ['d4', 'd5', 'c4', 'c6'],
    chapterId: 'b-slav',
    chapterName: 'Black: Slav vs 1.d4',
    tip: 'Giữ d5 bằng Tốt c6, không khóa Tượng c8 như Queen Gambit Declined.',
  },
  {
    eco: 'D18',
    name: 'Slav Defence',
    variation: 'Classical Variation',
    moves: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'dxc4', 'a4', 'Bf5'],
    chapterId: 'b-slav',
    chapterName: 'Black: Slav vs 1.d4',
    tip: 'Đen giải phóng Tượng c8 ra f5, sau đó chơi ...e6 và ...Bb4.',
  },
  {
    eco: 'D13',
    name: 'Slav Defence',
    variation: 'Exchange Variation',
    moves: ['d4', 'd5', 'c4', 'c6', 'cxd5', 'cxd5'],
    chapterId: 'b-slav',
    chapterName: 'Black: Slav vs 1.d4',
  },
  {
    eco: 'D00',
    name: 'Queen Pawn Game',
    variation: 'London System',
    moves: ['d4', 'd5', 'Bf4'],
    chapterId: 'b-slav',
    chapterName: 'Black: Slav vs 1.d4',
    tip: 'Hệ thống London: Trắng đưa Tượng ra ngoài trước khi đẩy e3. Đen phản công bằng ...c5.',
  },
  {
    eco: 'A48',
    name: 'East Indian Defence',
    variation: 'London System',
    moves: ['d4', 'Nf6', 'Nf3', 'g6', 'Bf4'],
  },
  {
    eco: 'D30',
    name: "Queen's Gambit Declined",
    moves: ['d4', 'd5', 'c4', 'e6'],
  },
  {
    eco: 'D20',
    name: "Queen's Gambit Accepted",
    moves: ['d4', 'd5', 'c4', 'dxc4'],
  },
  {
    eco: 'E60',
    name: "King's Indian Defence",
    moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7'],
    chapterId: 'w-catalan',
    chapterName: 'White: Catalan (1.d4)',
  },
  {
    eco: 'D80',
    name: 'Grünfeld Defence',
    moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5'],
    chapterId: 'w-catalan',
    chapterName: 'White: Catalan (1.d4)',
  },
  {
    eco: 'A80',
    name: 'Dutch Defence',
    moves: ['d4', 'f5'],
    chapterId: 'w-catalan',
    chapterName: 'White: Catalan (1.d4)',
  },

  // --- SCANDINAVIAN & ALEKHINE ---
  {
    eco: 'B01',
    name: 'Scandinavian Defence',
    moves: ['e4', 'd5'],
    chapterId: 'w-other-defences',
    chapterName: 'White: Scandi, Pirc, Alekhine',
    tip: 'Trắng ăn 2.exd5 và sau đó phát triển Nc3 đuổi Hậu Đen.',
  },
  {
    eco: 'B01',
    name: 'Scandinavian Defence',
    variation: 'Mieses-Kotroc Variation',
    moves: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'd4', 'Nf6', 'Nf3'],
    chapterId: 'w-other-defences',
    chapterName: 'White: Scandi, Pirc, Alekhine',
  },
  {
    eco: 'B02',
    name: "Alekhine's Defence",
    moves: ['e4', 'Nf6'],
    chapterId: 'w-other-defences',
    chapterName: 'White: Scandi, Pirc, Alekhine',
  },

  // --- FLANK OPENINGS (1.c4 & 1.Nf3) ---
  {
    eco: 'A10',
    name: 'English Opening',
    moves: ['c4'],
    chapterId: 'b-flank',
    chapterName: 'Black: vs 1.c4 & 1.Nf3',
  },
  {
    eco: 'A11',
    name: 'English Opening',
    variation: 'Caro-Slav System',
    moves: ['c4', 'c6'],
    chapterId: 'b-flank',
    chapterName: 'Black: vs 1.c4 & 1.Nf3',
    tip: 'Đen chuyển về cấu trúc Slav/Caro quen thuộc bằng ...c6 và ...d5.',
  },
  {
    eco: 'A04',
    name: 'Réti Opening',
    moves: ['Nf3'],
    chapterId: 'b-flank',
    chapterName: 'Black: vs 1.c4 & 1.Nf3',
  },
  {
    eco: 'A09',
    name: 'Réti Opening',
    variation: 'Advance Slav',
    moves: ['Nf3', 'd5', 'c4', 'c6'],
    chapterId: 'b-flank',
    chapterName: 'Black: vs 1.c4 & 1.Nf3',
  },

  // --- RUY LOPEZ ---
  {
    eco: 'C60',
    name: 'Ruy Lopez',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
  },
  {
    eco: 'C65',
    name: 'Ruy Lopez',
    variation: 'Berlin Defence',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'],
  },
  {
    eco: 'C70',
    name: 'Ruy Lopez',
    variation: 'Morphy Defence',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'],
  },
];

// Helper: Normalize SAN sequence to compare
function movesMatch(a: string[], b: string[]): boolean {
  if (a.length < b.length) return false;
  for (let i = 0; i < b.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Map chapter ID to OPENING_LIBRARY entry
const LIBRARY_BY_ID = new Map(OPENING_LIBRARY.map((entry) => [entry.id, entry]));

/**
 * Detect the current chess opening and variation from the sequence of played SAN moves.
 * Finds the deepest matching line in the database and cross-references with OPENING_LIBRARY.
 */
export function detectOpening(sans: string[]): OpeningMatch | null {
  if (!sans || sans.length === 0) return null;

  let bestMatch: OpeningEntry | null = null;
  let maxMatchedPly = 0;

  for (const entry of OPENING_DATABASE) {
    if (movesMatch(sans, entry.moves)) {
      if (entry.moves.length > maxMatchedPly) {
        maxMatchedPly = entry.moves.length;
        bestMatch = entry;
      }
    }
  }

  if (!bestMatch) {
    // If no deep match, check first move
    if (sans[0] === 'e4') {
      return {
        eco: 'B00',
        name: "King's Pawn Opening",
        fullName: "King's Pawn Opening (B00)",
        plyCount: 1,
        isInBook: true,
      };
    }
    if (sans[0] === 'd4') {
      return {
        eco: 'A40',
        name: "Queen's Pawn Game",
        fullName: "Queen's Pawn Game (A40)",
        plyCount: 1,
        isInBook: true,
      };
    }
    if (sans[0] === 'c4') {
      return {
        eco: 'A10',
        name: 'English Opening',
        fullName: 'English Opening (A10)',
        plyCount: 1,
        chapter: {
          id: 'b-flank',
          name: 'Black: vs 1.c4 & 1.Nf3',
          trainAs: 'black',
        },
        isInBook: true,
      };
    }
    if (sans[0] === 'Nf3') {
      return {
        eco: 'A04',
        name: 'Réti Opening',
        fullName: 'Réti Opening (A04)',
        plyCount: 1,
        chapter: {
          id: 'b-flank',
          name: 'Black: vs 1.c4 & 1.Nf3',
          trainAs: 'black',
        },
        isInBook: true,
      };
    }
    return null;
  }

  // Check if player is still following book moves
  // A position is "in book" if sans.length <= bestMatch.moves.length
  // OR if there exists another entry extending this line
  let hasLongerBook = false;
  const nextMoves: string[] = [];

  for (const entry of OPENING_DATABASE) {
    if (entry.moves.length > sans.length && movesMatch(entry.moves, sans)) {
      hasLongerBook = true;
      const nextMove = entry.moves[sans.length];
      if (nextMove && !nextMoves.includes(nextMove)) {
        nextMoves.push(nextMove);
      }
    }
  }

  const isInBook = sans.length <= bestMatch.moves.length || hasLongerBook;

  // Resolve curriculum chapter if associated
  let chapterInfo: OpeningMatch['chapter'] | undefined;
  if (bestMatch.chapterId) {
    const lib = LIBRARY_BY_ID.get(bestMatch.chapterId);
    chapterInfo = {
      id: bestMatch.chapterId,
      name: lib?.name ?? bestMatch.chapterName ?? 'Opening Lesson',
      trainAs: lib?.trainAs ?? 'black',
      tip: bestMatch.tip,
    };
  }

  const variationText = bestMatch.variation ? `: ${bestMatch.variation}` : '';
  const fullName = `${bestMatch.name}${variationText} (${bestMatch.eco})`;

  return {
    eco: bestMatch.eco,
    name: bestMatch.name,
    variation: bestMatch.variation,
    fullName,
    plyCount: bestMatch.moves.length,
    chapter: chapterInfo,
    isInBook,
    bookMoves: nextMoves.length > 0 ? nextMoves : undefined,
  };
}

/**
 * Checks whether a move at a given ply was a book move.
 * A move at ply (1-indexed) is a book move if the move prefix up to that ply
 * exists in any opening line in the database.
 */
export function isPlyInBook(sans: string[], ply: number): boolean {
  if (ply <= 0 || ply > sans.length) return false;
  const sub = sans.slice(0, ply);
  for (const entry of OPENING_DATABASE) {
    if (movesMatch(entry.moves, sub)) return true;
  }
  return false;
}


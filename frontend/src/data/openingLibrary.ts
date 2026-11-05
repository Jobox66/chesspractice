// Built-in opening chapters offered in the "Library" tab of the
// Add-to-Repertoire dialog. Each entry is a plain PGN tree: the side being
// trained (`trainAs`) has exactly one move per position, the opponent's
// common replies are the branches. Comments are shown while training.
//
// Every PGN here is checked for legality / single-answer-per-position by
// replaying it with chessops — keep that true when editing.

export interface LibraryEntry {
  id: string;
  name: string;
  trainAs: 'white' | 'black';
  description: string;
  pgn: string;
}

export const OPENING_LIBRARY: LibraryEntry[] = [
  {
    id: 'w-italian',
    name: 'White: Italian & 1...e5',
    trainAs: 'white',
    description: 'Ván cờ Ý (Giuoco Pianissimo), Hai Mã, cùng Philidor và Petrov.',
    pgn: `1. e4 e5 2. Nf3 Nc6
(2... d6 { Phòng thủ Philidor: khá thụ động. Chiếm trung tâm ngay bằng d4. } 3. d4 exd4
  (3... Nf6 4. Nc3 Nbd7 5. Bc4 Be7 6. O-O O-O 7. Re1 c6 8. a4 { Giữ không gian, ngăn Đen đẩy ...b5. })
 4. Nxd4 Nf6 5. Nc3 Be7 6. Bf4 O-O 7. Qd2 { Kế hoạch: nhập thành dài rồi tấn công cánh vua. })
(2... Nf6 { Phòng thủ Petrov. } 3. Nxe5 d6
  (3... Nxe4 { Sai lầm hay gặp: chép nước của Trắng. } 4. Qe2 Qe7
    (4... Nf6 { Thua Hậu! } 5. Nc6+ { Chiếu mở bằng Hậu e2, đồng thời Mã c6 bắt Hậu d8. })
   5. Qxe4 d6 6. d4 dxe5 7. dxe5 { Trắng hơn một Tốt. })
 4. Nf3 Nxe4 5. Nc3 Nxc3 6. dxc3 Be7 7. Be3 Nc6 8. Qd2 Be6 9. O-O-O { Nhập thành dài, sau đó đẩy h4-g4 tấn công. })
3. Bc4 { Ván cờ Ý: Tượng nhắm thẳng vào f7, điểm yếu nhất của Đen. }
3... Bc5
(3... Nf6 { Phòng thủ Hai Mã. } 4. d3 { Chơi chắc, tránh các biến sắc bén sau 4.Ng5. } 4... Be7
  (4... Bc5 5. c3 d6 6. O-O O-O 7. Re1 a6 8. Bb3 Ba7 9. h3 { Về thế cờ của nhánh chính 3...Bc5. })
 5. O-O O-O 6. Re1 d6 7. c3 Na5 8. Bb5 { Tránh để Mã đổi mất Tượng đẹp. } 8... a6 9. Ba4 b5 10. Bc2 c5 11. Nbd2 { Kế hoạch kinh điển: Nf1-g3 rồi d4. })
4. c3 { Chuẩn bị d4, hoặc chơi chậm với d3. } 4... Nf6 5. d3 { Giuoco Pianissimo: xây dựng chậm, không mở cờ sớm. } 5... d6 6. O-O O-O 7. Re1 a6 8. Bb3 { Lùi Tượng trước để khỏi bị ...Na5 đuổi. } 8... Ba7 9. h3 { Ngăn ...Bg4 ghim Mã f3. } 9... h6 10. Nbd2 Re8 11. Nf1 { Mã đi vòng Nf1-g3; sau đó d4 hoặc Ng3-f5. } *`,
  },
  {
    id: 'w-alapin',
    name: 'White: Alapin vs Sicilian',
    trainAs: 'white',
    description: '2.c3 chống Sicilian: chuẩn bị d4, tránh khối lý thuyết Sicilian mở.',
    pgn: `1. e4 c5 2. c3 { Biến Alapin: chuẩn bị d4 để xây trung tâm hai Tốt. }
2... d5
(2... Nf6 3. e5 Nd5 4. d4 cxd4 5. cxd4 d6 6. Nf3 Nc6 7. Bc4 { Đuổi Mã d5. } 7... Nb6 8. Bb5 dxe5 9. Nxe5 Bd7 10. Nxd7 Qxd7 11. Nc3 { Trắng có Tốt d4 cô lập nhưng phát triển nhanh, quân hoạt động. })
(2... e6 3. d4 d5 4. e5 { Chuyển sang French Advance, xem chương French. })
(2... Nc6 3. d4 d5 4. exd5 Qxd5 5. Nf3 { Giống nhánh 2...d5. })
(2... d6 3. d4 Nf6 4. Bd3 { Giữ Tốt e4; nếu ...cxd4 thì bắt lại cxd4. })
3. exd5 Qxd5 4. d4 Nf6
(4... Nc6 5. Nf3 Bg4 6. Be2 cxd4 7. cxd4 e6 8. Nc3 { Đuổi Hậu, kiếm thêm nhịp. } 8... Qd6 9. O-O Nf6 10. Be3)
5. Nf3 e6 6. Be2 Nc6 7. O-O cxd4 8. cxd4 Be7 9. Nc3 { Đuổi Hậu, kiếm thêm nhịp phát triển. } 9... Qd6 10. Be3 O-O { Tốt d4 cô lập nhưng Trắng chơi chủ động; kế hoạch Rc1, Qd2, Rfd1. } *`,
  },
  {
    id: 'w-french-advance',
    name: 'White: French Advance',
    trainAs: 'white',
    description: '3.e5 chống French: chiếm không gian, khóa Tượng c8 của Đen.',
    pgn: `1. e4 e6 2. d4 d5 3. e5 { Biến Tiến: chiếm không gian và khóa Tượng c8 của Đen. }
3... c5 4. c3 { Giữ chuỗi Tốt d4-e5. }
4... Nc6
(4... Qb6 5. Nf3 Bd7 6. Be2 { Nhập thành nhanh; Tốt d4 vẫn được bảo vệ đủ. })
5. Nf3 Qb6
(5... Bd7 6. Be2 Nge7 7. Na3 { Mã sẽ đi c2 để giữ d4. } 7... cxd4 8. cxd4 Nf5 9. Nc2)
6. a3 { Chuẩn bị b4, giành không gian cánh hậu. }
6... c4
(6... Bd7 7. b4 cxd4 8. cxd4 Rc8 9. Bb2)
(6... Nh6 7. b4 cxd4 8. cxd4 Nf5 9. Bb2)
7. Nbd2 Na5 8. Rb1 Bd7 9. Be2 { Sau đó O-O; cánh hậu đã khóa, Trắng chơi ở cánh vua. } *`,
  },
  {
    id: 'w-caro-advance',
    name: 'White: Caro-Kann Advance',
    trainAs: 'white',
    description: '3.e5 chống Caro-Kann (hệ thống Short): đơn giản, nhập thành nhanh.',
    pgn: `1. e4 c6 2. d4 d5 3. e5 { Biến Tiến (hệ thống Short). }
3... Bf5
(3... c5 4. dxc5 e6 5. Nf3 Bxc5 6. Bd3 Nc6 7. O-O { Phát triển nhanh, giữ chốt e5. })
4. Nf3 e6 5. Be2 { Hệ thống Short: chơi đơn giản, nhập thành nhanh. }
5... c5
(5... Nd7 6. O-O h6 7. Nbd2 Ne7 8. Nb3 { Mã b3 kiểm soát c5, ngăn Đen phá bằng ...c5. })
(5... Ne7 6. O-O Nd7 7. Nbd2 h6 8. Nb3)
6. Be3 { Tăng áp lực lên c5. } 6... cxd4 7. Nxd4 Ne7 8. O-O { Trắng phát triển tốt, chuẩn bị c4 hoặc f4. } *`,
  },
  {
    id: 'w-other-defences',
    name: 'White: Scandi, Pirc, Alekhine',
    trainAs: 'white',
    description: 'Các phòng thủ khác sau 1.e4: Scandinavian, Pirc, Modern, Alekhine.',
    pgn: `1. e4 d5
(1... d6 { Phòng thủ Pirc. } 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 { Hệ thống 150: Be3, Qd2, f3, O-O-O rồi h4-h5. } 5... c6 6. f3)
(1... g6 { Phòng thủ Modern. } 2. d4 Bg7 3. Nc3 d6 4. Be3 { Cùng kế hoạch với Pirc: Qd2, f3, O-O-O. })
(1... Nf6 { Phòng thủ Alekhine. } 2. e5 Nd5 3. d4 d6 4. Nf3 { Biến Hiện đại: đơn giản, giữ không gian. } 4... Bg4
  (4... g6 5. Bc4 Nb6 6. Bb3 Bg7 7. Qe2)
 5. Be2 e6 6. O-O Be7 7. h3 Bh5 8. c4 Nb6 9. Nc3 O-O 10. Be3)
2. exd5 Qxd5
(2... Nf6 3. d4 Nxd5 4. Nf3 Bg4 5. Be2 e6 6. O-O Be7 7. c4 Nb6 8. Nc3 O-O 9. Be3)
3. Nc3 { Đuổi Hậu, tranh thủ phát triển. }
3... Qa5
(3... Qd6 4. d4 Nf6 5. Nf3 a6 6. g3 { Tượng g2 sẽ nhắm vào cánh hậu Đen. })
(3... Qd8 4. d4 Nf6 5. Nf3 Bg4 6. h3 Bxf3 7. Qxf3 c6 8. Be3 { Trắng có cặp Tượng và phát triển tốt. })
4. d4 Nf6 5. Nf3 c6 6. Bc4 Bf5 7. Bd2 { Mẹo cần nhớ: Mã c3 nhảy đi sẽ mở đường cho Tượng d2 tấn công Hậu a5. } 7... e6 8. Qe2 Bb4 9. O-O-O { Nhập thành dài, sau đó a3 hoặc Ne4/Nd5. } *`,
  },
  {
    id: 'w-catalan',
    name: 'White: Catalan (1.d4)',
    trainAs: 'white',
    description: 'd4 + c4 + g3: Tượng g2 ép đường chéo dài. Kèm cách chơi chống KID, Grünfeld, Benoni, Dutch.',
    pgn: `1. d4 Nf6
(1... d5 2. c4 e6
  (2... c6 3. Nf3 Nf6 4. e3 { Slav: phát triển bình thường, sau đó Bd3, O-O. })
  (2... dxc4 3. Nf3 Nf6 4. e3 { Gambit Hậu nhận: chuẩn bị Bxc4 lấy lại Tốt. })
 3. Nf3 Nf6 4. g3 { Về Catalan. })
(1... f5 { Phòng thủ Hà Lan. } 2. g3 Nf6 3. Bg2 g6 4. Nf3 Bg7 5. O-O O-O 6. c4 d6 7. Nc3 { Biến Leningrad: Tượng g2 vẫn là quân mạnh nhất. })
2. c4 e6
(2... g6 { King's Indian / Grünfeld. } 3. g3 Bg7 4. Bg2 O-O 5. Nf3 d6
  (5... d5 6. cxd5 Nxd5 7. O-O { Grünfeld với Tượng g2: áp lực lên trung tâm và cánh hậu. })
 6. O-O { King's Indian thế Fianchetto: chơi chắc, không cho Đen tấn công cánh vua. })
(2... c5 3. d5 e6 4. Nc3 exd5 5. cxd5 d6 6. Nf3 g6 7. g3 Bg7 8. Bg2 O-O 9. O-O { Benoni: Tượng g2 hỗ trợ đẩy e4-e5 sau này. })
3. g3 { Catalan: Tượng sẽ lên g2 nhắm vào cánh hậu Đen. }
3... d5
(3... Bb4+ 4. Bd2 Be7 5. Bg2 d5 6. Nf3 O-O 7. O-O { Về Catalan Đóng. })
(3... c5 4. d5 exd5 5. cxd5 d6 6. Nc3 g6 7. Bg2 Bg7 8. Nf3 O-O 9. O-O { Cấu trúc Benoni, Tượng g2 rất mạnh. })
4. Bg2
4... Be7
(4... dxc4 { Catalan Mở sớm. } 5. Qa4+ { Chiếu để lấy lại Tốt c4 ngay. } 5... Nbd7
  (5... Bd7 6. Qxc4 Bc6 7. Nf3 Bd5 8. Qd3)
 6. Qxc4 a6 7. Qc2 c5 8. Nf3 b6 9. O-O Bb7 10. Nc3)
(4... Bb4+ 5. Bd2 Be7 6. Nf3 O-O 7. O-O { Tượng đen lùi về, giống nhánh chính. })
5. Nf3 O-O 6. O-O
6... dxc4
(6... Nbd7 { Catalan Đóng. } 7. Qc2 c6 8. Nbd2 b6 9. e4 Bb7 10. b3 { Chiếm trung tâm bằng e4, Tượng b2 hỗ trợ. })
(6... c6 7. Qc2 Nbd7 8. Nbd2 b6 9. e4 Bb7 10. b3 { Về Catalan Đóng. })
7. Qc2 { Catalan Mở: lấy lại Tốt c4 bằng Hậu. } 7... a6 8. Qxc4 b5 9. Qc2 Bb7 10. Bd2 { Kế hoạch: Ba5 hoặc Rc1, áp lực cột c và đường chéo dài. } *`,
  },
  {
    id: 'b-caro-kann',
    name: 'Black: Caro-Kann',
    trainAs: 'black',
    description: '1...c6 chống 1.e4: vững chắc, phù hợp người muốn ít lý thuyết sắc bén.',
    pgn: `1. e4 c6 { Caro-Kann: chuẩn bị ...d5 mà không khóa Tượng c8. }
2. d4
(2. Nc3 d5 3. Nf3 { Biến Hai Mã. } 3... Bg4 4. h3 Bxf3 5. Qxf3 e6 6. d3 Nf6 7. Bd2 Nbd7 { Cấu trúc chắc chắn; sau đó ...Bc5 hoặc ...Bd6. })
(2. d3 d5 3. Nd2 e5 4. Ngf3 Bd6 5. g3 Nf6 6. Bg2 O-O 7. O-O { Chống hệ Ấn Độ tấn công: giữ trung tâm bằng cặp Tốt d5-e5. })
2... d5 3. Nc3
(3. Nd2 dxe4 4. Nxe4 Bf5 5. Ng3 Bg6 { Giống nhánh 3.Nc3. })
(3. e5 { Biến Tiến. } 3... Bf5 4. Nf3
  (4. Nc3 e6 5. g4 Bg6 6. Nge2 c5 { Phản công trung tâm ngay. })
  (4. h4 h5 5. c4 e6 6. Nc3 Ne7)
 4... e6 5. Be2 Nd7 6. O-O Ne7 7. Nbd2 h6 { Chừa ô h7 cho Tượng lùi; kế hoạch ...c5. })
(3. exd5 { Biến Đổi quân. } 3... cxd5 4. Bd3
  (4. c4 { Tấn công Panov. } 4... Nf6 5. Nc3 e6 6. Nf3 Be7 7. cxd5 Nxd5 8. Bd3 Nc6 9. O-O O-O)
 4... Nc6 5. c3 Nf6 6. Bf4 Bg4 { Đưa Tượng ra ngoài chuỗi Tốt trước khi đẩy ...e6, kèm tấn công Hậu d1. } 7. Qb3 Qd7)
(3. f3 e6 4. Nc3 Bb4 { Ghim Mã, tăng áp lực lên e4. })
3... dxe4 4. Nxe4 Bf5 5. Ng3 Bg6 6. h4
(6. Nf3 Nd7 7. h4 h6 8. h5 Bh7 9. Bd3 Bxd3 10. Qxd3 e6)
(6. Bc4 e6 7. N1e2 Nf6 8. O-O Bd6)
6... h6 { Chừa ô h7 để Tượng không bị h5 bắt kẹt. } 7. Nf3 Nd7 8. h5 Bh7 9. Bd3 Bxd3 10. Qxd3 e6 11. Bd2 Ngf6 12. O-O-O Be7 { Thế cờ kinh điển: Đen vững chắc, sau đó ...O-O hoặc ...Qc7. } *`,
  },
  {
    id: 'b-slav',
    name: 'Black: Slav vs 1.d4',
    trainAs: 'black',
    description: '1...d5 2...c6 chống 1.d4, kèm cách chơi chống hệ thống London.',
    pgn: `1. d4 d5 2. c4
(2. Bf4 { Hệ thống London. } 2... Nf6 3. e3 c5 4. c3 Nc6 5. Nd2 e6 6. Ngf3 Bd6 7. Bg3 O-O 8. Bd3 { Đen có thể chơi ...b6, ...Bb7 hoặc ...Qe7 rồi ...e5. })
(2. Nf3 Nf6 3. c4
  (3. Bf4 c5 4. e3 Nc6 5. c3 e6 6. Nbd2 Bd6 7. Bg3 O-O 8. Bd3)
 3... c6 { Về Slav. })
2... c6 { Phòng thủ Slav: giữ d5 bằng Tốt c6, Tượng c8 vẫn ra được f5/g4. }
3. Nf3
(3. Nc3 Nf6 4. Nf3
  (4. e3 Bf5 5. Nf3 e6 { Giống nhánh 4.e3. })
  (4. cxd5 cxd5 5. Bf4 Nc6 { Giống biến Đổi quân. })
 4... dxc4 { Giống nhánh chính. })
(3. cxd5 { Biến Đổi quân. } 3... cxd5 4. Nc3 Nf6 5. Bf4 Nc6 6. e3 Bf5 7. Nf3 e6 8. Qb3 Bb4 9. Bb5 O-O { Thế đối xứng, Đen dễ cân bằng. })
3... Nf6 4. Nc3
(4. e3 Bf5 5. Nc3
  (5. cxd5 cxd5 6. Qb3 Qc7 { Giữ Tốt b7; sau đó ...e6, ...Nc6. })
 5... e6 6. Nh4 Bg6 7. Nxg6 hxg6 { Cột h mở có lợi cho Xe h8 của Đen. } 8. Bd3 Nbd7)
4... dxc4 5. a4 { Ngăn ...b5 giữ Tốt. }
(5. e3 b5 6. a4 b4 7. Na2 e6 8. Bxc4 Be7 9. O-O O-O)
(5. e4 b5 6. e5 Nd5)
5... Bf5 6. e3 e6 7. Bxc4 Bb4 8. O-O Nbd7 9. Qe2 Bg6 10. e4 O-O { Thế cờ chính của Slav; Đen tiếp theo ...Bh5 và ...e5. } *`,
  },
  {
    id: 'b-flank',
    name: 'Black: vs 1.c4 & 1.Nf3',
    trainAs: 'black',
    description: 'Chống khai cuộc Anh và Réti: đưa về cấu trúc Slav/Caro quen thuộc.',
    pgn: `1. c4
(1. Nf3 d5 2. d4
  (2. c4 c6 3. e3 Nf6 4. Nc3 e6 { Cấu trúc Semi-Slav chắc chắn. })
  (2. g3 Nf6 3. Bg2 c6 4. O-O Bg4 5. d3 Nbd7 6. Nbd2 e5 { Chiếm trung tâm bằng cặp Tốt d5-e5. })
 2... Nf6 3. c4 c6 { Về Slav. })
1... c6 { Chơi như Slav/Caro: chuẩn bị ...d5 chắc chắn. }
2. Nf3
(2. e4 d5 3. exd5 cxd5 4. d4 Nf6 5. Nc3 e6 { Về Panov của Caro-Kann. })
(2. d4 d5 3. Nf3 Nf6 { Về Slav. })
(2. Nc3 d5 3. cxd5 cxd5 4. d4 Nf6 { Về Slav Đổi quân. })
2... d5 3. e3
(3. g3 Nf6 4. Bg2 Bf5 5. O-O e6 6. d3 Be7 7. Nc3 O-O)
(3. cxd5 cxd5 4. d4 Nf6 5. Nc3 Nc6)
(3. b3 Nf6 4. Bb2 Bf5)
3... Nf6 4. Nc3 e6 5. d4 Nbd7 { Về Semi-Slav. } *`,
  },
  {
    id: 'b-pirc',
    name: 'Black: Pirc Defence',
    trainAs: 'black',
    description: '1...d6 2...Nf6 3...g6: để Trắng chiếm trung tâm rồi phản công. Có Austrian, 150, Classical.',
    pgn: `1. e4 d6 { Phòng thủ Pirc: để Trắng chiếm trung tâm, rồi phá bằng ...c5 hoặc ...e5. }
2. d4
(2. Nc3 Nf6 3. d4 g6 { Về nhánh chính. })
(2. Nf3 Nf6 3. Nc3 g6 4. d4 Bg7 { Về Classical. })
2... Nf6 3. Nc3
(3. Nd2 g6 4. Ngf3 Bg7 5. Be2 O-O 6. O-O c6 { Chuẩn bị ...e5 hoặc ...b5. })
3... g6 4. f4
(4. Be3 { Tấn công 150: Be3, Qd2, Bh6. } 4... c6 5. Qd2 b5 6. f3 Nbd7 { Phản công cánh hậu bằng ...b4, ...Qa5 trước khi Trắng tấn công. })
(4. Nf3 { Classical. } 4... Bg7 5. Be2 O-O 6. O-O Bg4 7. Be3 Nc6 8. Qd2 e5 9. d5 Ne7 { Chuẩn bị ...Nd7, ...f5 phản công cánh vua. })
(4. Bg5 Bg7 5. Qd2 h6 6. Bh4 g5 7. Bg3 Nh5 { Đổi Tượng g3 khó chịu của Trắng. })
(4. g3 Bg7 5. Bg2 O-O 6. Nge2 e5 { Phá trung tâm ngay. })
(4. Bc4 Bg7 5. Qe2 c6 { Chuẩn bị ...d5 hoặc ...b5 đuổi Tượng. })
4... Bg7 { Tấn công Áo: Trắng đẩy cả e4, d4, f4. } 5. Nf3 c5 { Phá trung tâm ngay trước khi e5 quá mạnh. }
6. dxc5
(6. Bb5+ Bd7 7. e5 Ng4 8. e6 fxe6 9. Ng5 Bxb5 10. Nxe6 Bxd4 11. Nxd8 Bf2+ 12. Kd2 Be3+ 13. Ke1 Bf2+ { Chiếu lặp, hòa. Biến sắc bén cần thuộc chính xác. })
(6. d5 O-O 7. Bd3 e6 8. O-O exd5 9. exd5 { Cấu trúc Benoni, Đen chơi ...Re8, ...Bg4. })
6... Qa5 7. Bd3 Qxc5 8. Qe2 O-O 9. Be3 Qa5 10. O-O Bg4 { Đổi Tượng lấy Mã f3, tranh ô e5 và d4. } *`,
  },
];

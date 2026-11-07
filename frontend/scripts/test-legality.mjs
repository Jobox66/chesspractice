import { OPENING_LIBRARY } from '../src/data/openingLibrary.ts';
import { parsePgn } from 'chessops/pgn';
import { parseSan } from 'chessops/san';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';

console.log(`Kiểm tra ${OPENING_LIBRARY.length} chương khai cuộc trong openingLibrary.ts...\n`);

let totalMoves = 0;
let totalPositions = 0;
const errors = [];
const summary = [];

for (const entry of OPENING_LIBRARY) {
  let parsed;
  try {
    parsed = parsePgn(entry.pgn);
  } catch (e) {
    errors.push(`[${entry.name}] Lỗi cú pháp PGN: ${e.message}`);
    continue;
  }

  const game = parsed[0];
  if (!game) {
    errors.push(`[${entry.name}] Không tìm thấy ván cờ hợp lệ trong PGN`);
    continue;
  }

  let chapterMoves = 0;
  let chapterPositions = 0;
  let chapterErrors = 0;

  const walk = (node, pos, ply, line) => {
    if (node.children.length > 0) {
      chapterPositions++;
      totalPositions++;
    }

    const isPlayerTurn = pos.turn === entry.trainAs;
    if (isPlayerTurn && node.children.length > 1) {
      errors.push(`[${entry.name}] Bên người học (${entry.trainAs}) có nhiều hơn 1 nhánh (${node.children.length} nhánh) sau nước: ${line.join(' ')}`);
      chapterErrors++;
    }

    for (const c of node.children) {
      chapterMoves++;
      totalMoves++;
      const san = c.data.san;
      const mv = parseSan(pos, san);
      if (!mv) {
        errors.push(`[${entry.name}] Nước đi KHÔNG HỢP LỆ: "${san}" sau: ${line.join(' ')} (FEN: ${makeFen(pos.toSetup())})`);
        chapterErrors++;
        return;
      }
      const next = pos.clone();
      next.play(mv);
      walk(c, next, ply + 1, [...line, san]);
    }
  };

  walk(game.moves, Chess.default(), 0, []);
  summary.push({
    id: entry.id,
    name: entry.name,
    trainAs: entry.trainAs,
    positions: chapterPositions,
    moves: chapterMoves,
    ok: chapterErrors === 0,
  });
}

console.log('='.repeat(70));
console.log('KẾT QUẢ KIỂM TRA TỪNG CHƯƠNG KHAI CUỘC:');
console.log('='.repeat(70));
for (const s of summary) {
  const status = s.ok ? '✅ HỢP LỆ' : '❌ CÓ LỖI';
  console.log(`${status} | [${s.trainAs.toUpperCase()}] ${s.name} (${s.positions} thế cờ, ${s.moves} nước đi)`);
}

console.log('='.repeat(70));
console.log(`Tổng kết: ${summary.length} chương, ${totalPositions} thế cờ, ${totalMoves} nước đi.`);

if (errors.length === 0) {
  console.log(`\n🎉 KẾT QUẢ: 100% tất cả các nước đi và thế cờ trong thư viện đều chính xác theo luật cờ vua quốc tế!`);
} else {
  console.log(`\n❌ Phát hiện ${errors.length} lỗi:`);
  errors.forEach(e => console.log('  - ' + e));
}

